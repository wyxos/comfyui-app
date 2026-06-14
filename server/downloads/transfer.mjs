import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, open, rename } from 'node:fs/promises'
import { dirname } from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { civitaiDownloadSegmentCount, civitaiSegmentStallTimeoutMs, civitaiSegmentedDownloadMinBytes } from '../config.mjs'
import { safeTrim } from '../shared.mjs'
import { scheduleDownloadsPersist } from './state.mjs'
import { getCivitaiSha256Hash } from './hash-metadata.mjs'
import { createCivitaiHashMismatchError, isCivitaiHashMismatchError, recordCivitaiHashMismatch } from './hash-mismatch.mjs'
import { refreshDownloadedSidecarsInBackground, safeUnlink, statFileIfExists } from './metadata.mjs'
import { assertSegmentContentRange, buildCivitaiDownloadRequest, parseContentRangeTotal } from './request.mjs'

const progressPersistDelayMs = 15000

export function updateDownloadProgress(download, bytesDownloaded, totalBytes) {
  download.bytesDownloaded = bytesDownloaded
  download.totalBytes = totalBytes
  download.progressPercent = totalBytes > 0 ? Math.min(100, Math.round((bytesDownloaded / totalBytes) * 1000) / 10) : null
  download.updatedAt = Date.now()
  scheduleDownloadsPersist(false, progressPersistDelayMs)
}

function buildSegmentRanges(totalBytes, requestedSegmentCount = civitaiDownloadSegmentCount) {
  const segmentCount = Math.min(requestedSegmentCount, Math.ceil(totalBytes / civitaiSegmentedDownloadMinBytes) + 1)
  const segmentSize = Math.ceil(totalBytes / segmentCount)
  const ranges = []
  for (let index = 0; index < segmentCount; index += 1) {
    const start = index * segmentSize
    const end = Math.min(totalBytes - 1, start + segmentSize - 1)
    if (start <= end) {
      ranges.push({ index, start, end })
    }
  }

  return ranges
}

function segmentLength(range) {
  return range.end - range.start + 1
}

function parseSegmentedTransferCount(transferMode) {
  const match = /^segmented-(\d+)$/i.exec(safeTrim(transferMode))
  if (!match) {
    return null
  }

  const count = Number.parseInt(match[1], 10)
  return Number.isSafeInteger(count) && count > 0 ? count : null
}

function normalizedSegmentProgress(progress, ranges) {
  if (!Array.isArray(progress) || progress.length !== ranges.length) {
    return null
  }

  return ranges.map((range, index) => {
    const value = Number.parseInt(progress[index], 10)
    return Number.isSafeInteger(value) ? Math.max(0, Math.min(segmentLength(range), value)) : 0
  })
}

function sumSegmentProgress(segmentProgress) {
  return segmentProgress.reduce((sum, segmentBytes) => sum + segmentBytes, 0)
}

function getSegmentedResumeState(download, partialStats) {
  const totalBytes = Number.parseInt(download.totalBytes, 10)
  const segmentCount = parseSegmentedTransferCount(download.transferMode)
  if (!partialStats || !totalBytes || !segmentCount || partialStats.size !== totalBytes) {
    return null
  }

  const ranges = buildSegmentRanges(totalBytes, segmentCount)
  const segmentProgress = normalizedSegmentProgress(download.segmentProgress, ranges)
  if (!segmentProgress) {
    return null
  }

  return {
    ranges,
    segmentProgress,
    totalBytes,
    complete: sumSegmentProgress(segmentProgress) >= totalBytes,
  }
}

async function readCivitaiErrorMessage(response) {
  let text
  try {
    text = await response.text()
  } catch {
    return ''
  }

  if (!text) {
    return ''
  }

  try {
    const payload = JSON.parse(text)
    if (typeof payload?.message === 'string' && payload.message.trim()) {
      return payload.message.trim()
    }

    if (typeof payload?.error === 'string' && payload.error.trim()) {
      return payload.error.trim()
    }
  } catch {
    return text.trim().slice(0, 500)
  }

  return text.trim().slice(0, 500)
}

async function createCivitaiDownloadError(response, label) {
  const detail = await readCivitaiErrorMessage(response)
  const error = new Error(detail ? `${label} returned ${response.status}: ${detail}` : `${label} returned ${response.status}`)
  error.statusCode = response.status
  return error
}

export async function probeCivitaiSegmentedDownload(download) {
  if (civitaiDownloadSegmentCount <= 1) {
    return null
  }

  const request = await buildCivitaiDownloadRequest(download.downloadUrl, 0, 0)
  const response = await fetch(request.url, {
    headers: request.headers,
    signal: download.abortController.signal,
    redirect: 'follow',
  })

  if (response.status !== 206) {
    await response.body?.cancel?.()
    return null
  }

  const totalBytes = parseContentRangeTotal(response.headers.get('content-range'))
  if (!totalBytes || totalBytes < civitaiSegmentedDownloadMinBytes) {
    await response.body?.cancel?.()
    return null
  }

  await response.arrayBuffer()
  return totalBytes
}

export function getExpectedCivitaiSha256(download) {
  return getCivitaiSha256Hash(download.hashes)
}

export async function hashFileSha256(filePath) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(filePath)) {
    hash.update(chunk)
  }
  return hash.digest('hex').toUpperCase()
}

export async function verifyCivitaiDownloadHash(download) {
  await verifyCivitaiDownloadPathHash(download, download.targetPath)
}

async function verifyCivitaiDownloadPathHash(download, filePath) {
  const expectedHash = getExpectedCivitaiSha256(download)
  if (!expectedHash) {
    return
  }

  const actualHash = await hashFileSha256(filePath)
  if (actualHash === expectedHash) {
    return
  }

  throw createCivitaiHashMismatchError(expectedHash, actualHash)
}

export async function markCivitaiDownloadComplete(download, { allowHashMismatch = false } = {}) {
  const targetStats = await statFileIfExists(download.targetPath)
  if (!targetStats) {
    return false
  }

  let acceptedHashMismatch = false
  try {
    await verifyCivitaiDownloadHash(download)
  } catch (error) {
    if (!isCivitaiHashMismatchError(error) || (!allowHashMismatch && download.allowHashMismatch !== true)) {
      recordCivitaiHashMismatch(download, error)
      throw error
    }

    recordCivitaiHashMismatch(download, error, { accepted: true })
    acceptedHashMismatch = true
  }
  download.bytesDownloaded = targetStats.size
  download.totalBytes = targetStats.size
  download.progressPercent = 100
  download.state = 'complete'
  download.error = null
  delete download.errorCode
  delete download.allowHashMismatch
  if (!acceptedHashMismatch) {
    delete download.hashMismatch
  }
  download.finishedAt = download.finishedAt ?? Date.now()
  download.updatedAt = Date.now()
  scheduleDownloadsPersist(true)
  void refreshDownloadedSidecarsInBackground(download)
  return true
}

export async function finishCivitaiDownload(download, totalBytes, bytesDownloaded) {
  let acceptedHashMismatch = false
  try {
    await verifyCivitaiDownloadPathHash(download, download.partialPath)
  } catch (error) {
    if (isCivitaiHashMismatchError(error) && download.allowHashMismatch === true) {
      recordCivitaiHashMismatch(download, error, { accepted: true })
      acceptedHashMismatch = true
    } else if (isCivitaiHashMismatchError(error)) {
      recordCivitaiHashMismatch(download, error)
      await safeUnlink(download.partialPath)
      throw error
    } else {
      throw error
    }
  }

  await safeUnlink(download.targetPath)
  await rename(download.partialPath, download.targetPath)
  download.bytesDownloaded = totalBytes || bytesDownloaded
  download.totalBytes = totalBytes || bytesDownloaded
  download.progressPercent = 100
  download.state = 'complete'
  download.error = null
  delete download.errorCode
  delete download.allowHashMismatch
  if (!acceptedHashMismatch) {
    delete download.hashMismatch
  }
  download.finishedAt = Date.now()
  download.updatedAt = Date.now()
  scheduleDownloadsPersist(true)
  void refreshDownloadedSidecarsInBackground(download)
}

export async function downloadCivitaiFileSingle(download, partialStats) {
  const rangeStart = partialStats?.size ?? 0
  let request = await buildCivitaiDownloadRequest(download.downloadUrl, rangeStart)
  download.transferMode = rangeStart > 0 ? 'single-resume' : 'single'
  download.state = 'downloading'
  download.error = null
  download.startedAt = download.startedAt ?? Date.now()
  download.updatedAt = Date.now()
  download.bytesDownloaded = rangeStart
  scheduleDownloadsPersist(true)

  let response = await fetch(request.url, {
    headers: request.headers,
    signal: download.abortController.signal,
    redirect: 'follow',
  })

  let append = rangeStart > 0 && response.status === 206
  if (rangeStart > 0 && response.status !== 206) {
    await response.body?.cancel?.()
    await safeUnlink(download.partialPath)
    request = await buildCivitaiDownloadRequest(download.downloadUrl, 0)
    response = await fetch(request.url, {
      headers: request.headers,
      signal: download.abortController.signal,
      redirect: 'follow',
    })
    append = false
  }

  if (!response.ok || !response.body) {
    throw await createCivitaiDownloadError(response, 'Civitai download')
  }

  const contentLength = Number.parseInt(response.headers.get('content-length') ?? '', 10)
  const totalBytes = append && Number.isFinite(contentLength)
    ? rangeStart + contentLength
    : Number.isFinite(contentLength)
      ? contentLength
      : download.totalBytes ?? 0

  let bytesDownloaded = append ? rangeStart : 0
  const progressStream = new Transform({
    transform(chunk, _encoding, callback) {
      bytesDownloaded += chunk.length
      updateDownloadProgress(download, bytesDownloaded, totalBytes)
      callback(null, chunk)
    },
  })

  await mkdir(dirname(download.targetPath), { recursive: true })
  await pipeline(
    Readable.fromWeb(response.body),
    progressStream,
    createWriteStream(download.partialPath, { flags: append ? 'a' : 'w' }),
  )

  await finishCivitaiDownload(download, totalBytes, bytesDownloaded)
}

export async function downloadCivitaiSegment(download, fileHandle, range, segmentProgress, totalBytes) {
  const expectedLength = segmentLength(range)
  const resumeOffset = Math.max(0, Math.min(expectedLength, segmentProgress[range.index] ?? 0))
  if (resumeOffset >= expectedLength) {
    return
  }

  const rangeStart = range.start + resumeOffset
  const request = await buildCivitaiDownloadRequest(download.downloadUrl, rangeStart, range.end)
  const response = await fetch(request.url, {
    headers: request.headers,
    signal: download.abortController.signal,
    redirect: 'follow',
  })

  if (response.status !== 206 || !response.body) {
    throw await createCivitaiDownloadError(response, `Civitai segment ${range.index + 1}`)
  }
  assertSegmentContentRange(response, { ...range, start: rangeStart }, totalBytes)

  const reader = response.body.getReader()
  let position = rangeStart
  let bytesDownloaded = resumeOffset
  let lastProgressAt = 0

  while (true) {
    let timeout = null
    const readResult = await Promise.race([
      reader.read(),
      new Promise((_, reject) => {
        timeout = setTimeout(() => {
          const error = new Error(`Civitai segment ${range.index + 1} stalled.`)
          error.code = 'segment-stalled'
          reject(error)
        }, civitaiSegmentStallTimeoutMs)
      }),
    ]).finally(() => {
      if (timeout) {
        clearTimeout(timeout)
      }
    })

    const { done, value } = readResult
    if (done) {
      break
    }

    const chunk = Buffer.from(value)
    await fileHandle.write(chunk, 0, chunk.length, position)
    position += chunk.length
    bytesDownloaded += chunk.length
    segmentProgress[range.index] = bytesDownloaded
    download.segmentProgress = segmentProgress

    const now = Date.now()
    if (now - lastProgressAt > 250) {
      lastProgressAt = now
      const totalDownloaded = segmentProgress.reduce((sum, segmentBytes) => sum + segmentBytes, 0)
      updateDownloadProgress(download, totalDownloaded, totalBytes)
    }
  }

  if (bytesDownloaded !== expectedLength) {
    throw new Error(`Civitai segment ${range.index + 1} ended early.`)
  }
}

export async function downloadCivitaiFileSegmented(download, totalBytes, resumeState = null) {
  const ranges = resumeState?.ranges ?? buildSegmentRanges(totalBytes)
  const segmentProgress = resumeState?.segmentProgress ?? new Array(ranges.length).fill(0)
  const resume = Boolean(resumeState)
  download.transferMode = `segmented-${ranges.length}`
  download.totalBytes = totalBytes
  download.segmentProgress = segmentProgress
  updateDownloadProgress(download, sumSegmentProgress(segmentProgress), totalBytes)
  download.updatedAt = Date.now()
  scheduleDownloadsPersist(true)

  await mkdir(dirname(download.targetPath), { recursive: true })
  if (!resume) {
    await safeUnlink(download.partialPath)
  }
  const fileHandle = await open(download.partialPath, resume ? 'r+' : 'w')
  let completed = false
  let segmentError = null

  try {
    await fileHandle.truncate(totalBytes)
    const results = await Promise.allSettled(ranges.map(async (range) => {
      try {
        await downloadCivitaiSegment(download, fileHandle, range, segmentProgress, totalBytes)
      } catch (error) {
        if (!segmentError && error?.name !== 'AbortError') {
          segmentError = error
        }
        download.abortController?.abort()
        throw error
      }
    }))
    const rejectedResult = results.find((result) => result.status === 'rejected')
    if (segmentError) {
      throw segmentError
    }
    if (rejectedResult) {
      throw rejectedResult.reason
    }
    completed = true
  } finally {
    await fileHandle.close()
    download.segmentProgress = segmentProgress
    if (!completed && download.state === 'cancelled') {
      await safeUnlink(download.partialPath)
    }
  }

  const partialStats = await statFileIfExists(download.partialPath)
  if (partialStats?.size !== totalBytes) {
    throw new Error('Segmented download did not produce the expected file size.')
  }

  updateDownloadProgress(download, totalBytes, totalBytes)
  await finishCivitaiDownload(download, totalBytes, totalBytes)
  delete download.segmentProgress
}

export async function downloadCivitaiFile(download) {
  let partialStats = await statFileIfExists(download.partialPath)
  let segmentedResumeState = getSegmentedResumeState(download, partialStats)
  if (partialStats && safeTrim(download.transferMode).startsWith('segmented-') && !segmentedResumeState) {
    await safeUnlink(download.partialPath)
    partialStats = null
    download.bytesDownloaded = 0
    download.progressPercent = 0
    delete download.segmentProgress
  }
  const rangeStart = partialStats?.size ?? 0

  download.abortController = new AbortController()
  download.state = 'downloading'
  download.error = null
  download.startedAt = download.startedAt ?? Date.now()
  download.updatedAt = Date.now()
  download.bytesDownloaded = rangeStart
  scheduleDownloadsPersist(true)

  if (segmentedResumeState?.complete) {
    await finishCivitaiDownload(download, segmentedResumeState.totalBytes, segmentedResumeState.totalBytes)
    return
  }

  if (segmentedResumeState) {
    await downloadCivitaiFileSegmented(download, segmentedResumeState.totalBytes, segmentedResumeState)
    return
  }

  if (partialStats?.size > 0 && download.totalBytes > 0 && partialStats.size >= download.totalBytes) {
    await finishCivitaiDownload(download, download.totalBytes, partialStats.size)
    return
  }

  if (!partialStats) {
    const segmentedTotalBytes = await probeCivitaiSegmentedDownload(download)
    if (segmentedTotalBytes) {
      try {
        await downloadCivitaiFileSegmented(download, segmentedTotalBytes)
        return
      } catch (error) {
        if (error?.name === 'AbortError' || download.state === 'paused' || download.state === 'cancelled') {
          throw error
        }

        throw error
      }
    }
  }

  await downloadCivitaiFileSingle(download, partialStats)
}
