import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { civitaiDownloads, configDir, downloadsPath, downloadsPersistRenameAttempts, downloadsPersistRenameDelayMs } from '../config.mjs'
import { delay, safeTrim } from '../shared.mjs'
import { queueDownloadsSnapshotBroadcast } from './events.mjs'
import { safeUnlink } from './metadata.mjs'

let downloadsPersistPromise = null
let downloadsPersistPending = false
export let downloadsLoaded = false
let downloadsPersistTimer = null

export function resetDownloadsRuntimeState() {
  downloadsPersistPromise = null
  downloadsPersistPending = false
  downloadsLoaded = false
  if (downloadsPersistTimer) {
    clearTimeout(downloadsPersistTimer)
  }
  downloadsPersistTimer = null
}

export async function readDownloadsState() {
  let rawDownloads
  try {
    rawDownloads = await readFile(downloadsPath, 'utf8')
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return []
    }

    throw error
  }

  if (!rawDownloads.trim()) {
    try {
      rawDownloads = await readFile(`${downloadsPath}.bak`, 'utf8')
    } catch {
      return []
    }

    if (!rawDownloads.trim()) {
      return []
    }
  }

  const parsedDownloads = JSON.parse(rawDownloads)
  return Array.isArray(parsedDownloads?.items) ? parsedDownloads.items : []
}

export function isRetryableFileReplaceError(error) {
  return ['EACCES', 'EBUSY', 'EPERM'].includes(error?.code)
}

export async function renameWithRetries(sourcePath, targetPath) {
  for (let attempt = 1; attempt <= downloadsPersistRenameAttempts; attempt += 1) {
    try {
      await rename(sourcePath, targetPath)
      return
    } catch (error) {
      if (!isRetryableFileReplaceError(error) || attempt === downloadsPersistRenameAttempts) {
        throw error
      }

      await delay(downloadsPersistRenameDelayMs * attempt)
    }
  }
}

export async function writeDownloadsStateSnapshot() {
  await mkdir(configDir, { recursive: true })
  const items = [...civitaiDownloads.values()].map((download) => serializeDownload(download))
  const tempPath = `${downloadsPath}.${process.pid}.${Date.now()}.tmp`
  const backupPath = `${downloadsPath}.bak`
  await writeFile(tempPath, `${JSON.stringify({ items }, null, 2)}\n`, 'utf8')
  await safeUnlink(backupPath)
  try {
    await renameWithRetries(downloadsPath, backupPath)
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      throw error
    }
  }

  try {
    await renameWithRetries(tempPath, downloadsPath)
  } catch (error) {
    try {
      await renameWithRetries(backupPath, downloadsPath)
    } catch {}
    await safeUnlink(tempPath)
    throw error
  }

  await safeUnlink(backupPath)
}

export async function writeDownloadsStateNow() {
  downloadsPersistPending = true
  if (downloadsPersistPromise) {
    return downloadsPersistPromise
  }

  downloadsPersistPromise = (async () => {
    try {
      while (downloadsPersistPending) {
        downloadsPersistPending = false
        await writeDownloadsStateSnapshot()
      }
    } catch (error) {
      console.warn('Could not persist Civitai downloads state:', error instanceof Error ? error.message : error)
    } finally {
      downloadsPersistPromise = null
    }
  })()

  return downloadsPersistPromise
}

export function scheduleDownloadsPersist(immediate = false, delayMs = 750) {
  if (!downloadsLoaded) {
    return
  }

  queueDownloadsSnapshotBroadcast({ immediate })

  if (immediate) {
    if (downloadsPersistTimer) {
      clearTimeout(downloadsPersistTimer)
      downloadsPersistTimer = null
    }

    void writeDownloadsStateNow()
    return
  }

  if (downloadsPersistTimer) {
    return
  }

  downloadsPersistTimer = setTimeout(() => {
    downloadsPersistTimer = null
    void writeDownloadsStateNow()
  }, delayMs)
}

export async function ensureDownloadsLoaded() {
  if (downloadsLoaded) {
    return
  }

  try {
    const downloads = await readDownloadsState()
    for (const download of downloads) {
      if (!download?.id) {
        continue
      }

      const normalizedDownload = {
        ...download,
        abortController: null,
      }

      if (normalizedDownload.state === 'downloading' || normalizedDownload.state === 'queued') {
        normalizedDownload.state = 'paused'
      }

      civitaiDownloads.set(normalizedDownload.id, normalizedDownload)
    }
  } catch {
    civitaiDownloads.clear()
  } finally {
    downloadsLoaded = true
  }

}

export function serializeDownload(download) {
  const serializedDownload = { ...download }
  delete serializedDownload.abortController

  if (serializedDownload.previewImage) {
    serializedDownload.previewImage = serializeDownloadPreview(serializedDownload.previewImage)
  }
  if (Array.isArray(serializedDownload.previewImages)) {
    serializedDownload.previewImages = []
  }
  if (Array.isArray(serializedDownload.previewPaths)) {
    serializedDownload.previewPaths = serializedDownload.previewPaths.slice(0, 1).map((image) => serializeDownloadPreview(image))
  }

  return serializedDownload
}

export function serializeDownloadPreview(image) {
  if (!image || typeof image !== 'object') {
    return image
  }

  return {
    id: image.id ?? null,
    url: safeTrim(image.url),
    width: image.width ?? null,
    height: image.height ?? null,
    hash: safeTrim(image.hash),
    type: safeTrim(image.type),
    nsfw: image.nsfw ?? null,
    nsfwLevel: safeTrim(image.nsfwLevel),
    postId: image.postId ?? null,
    username: safeTrim(image.username),
    modelVersionIds: Array.isArray(image.modelVersionIds) ? image.modelVersionIds : [],
    mediaType: image.mediaType,
    path: image.path,
  }
}

function compareSerializedDownloads(left, right) {
  const stateRank = {
    downloading: 0,
    queued: 1,
    paused: 2,
    error: 3,
    complete: 4,
    deleted: 5,
    cancelled: 6,
  }

  const leftRank = stateRank[left.state] ?? 99
  const rightRank = stateRank[right.state] ?? 99
  if (leftRank !== rightRank) {
    return leftRank - rightRank
  }

  return (right.updatedAt ?? 0) - (left.updatedAt ?? 0)
}

export function serializeDownloadPanelItem(download) {
  return {
    id: download.id,
    state: download.state,
    modelId: download.modelId,
    modelName: download.modelName,
    modelType: download.modelType,
    versionId: download.versionId,
    versionName: download.versionName,
    baseModel: download.baseModel ?? null,
    fileName: download.fileName,
    fileSizeKb: download.fileSizeKb ?? null,
    bytesDownloaded: download.bytesDownloaded ?? 0,
    totalBytes: download.totalBytes ?? null,
    progressPercent: download.progressPercent ?? null,
    dismissedAt: download.dismissedAt ?? null,
    deletedAt: download.deletedAt ?? null,
    createdAt: download.createdAt ?? null,
    startedAt: download.startedAt ?? null,
    finishedAt: download.finishedAt ?? null,
    error: download.error ?? null,
    updatedAt: download.updatedAt ?? 0,
  }
}

export function createDownloadsResponse(downloads) {
  const items = [...downloads]
    .map((download) => serializeDownload(download))
    .sort(compareSerializedDownloads)

  return {
    ok: true,
    items,
    counts: {
      queued: items.filter((item) => item.state === 'queued').length,
      downloading: items.filter((item) => item.state === 'downloading').length,
      paused: items.filter((item) => item.state === 'paused').length,
      complete: items.filter((item) => item.state === 'complete').length,
      error: items.filter((item) => item.state === 'error').length,
      deleted: items.filter((item) => item.state === 'deleted').length,
    },
  }
}

export function createDownloadsPanelResponse(downloads) {
  const sourceItems = [...downloads]
  const items = sourceItems
    .map((download) => serializeDownloadPanelItem(download))
    .sort(compareSerializedDownloads)

  return {
    ok: true,
    items,
    counts: createDownloadsSummaryResponse(sourceItems).counts,
  }
}

export function createDownloadsSummaryResponse(downloads) {
  const counts = {
    queued: 0,
    downloading: 0,
    paused: 0,
    complete: 0,
    error: 0,
    cancelled: 0,
    deleted: 0,
    active: 0,
    attention: 0,
    visibleComplete: 0,
  }

  for (const item of downloads) {
    if (Object.prototype.hasOwnProperty.call(counts, item.state)) {
      counts[item.state] += 1
    }

    if (item.state === 'queued' || item.state === 'downloading' || item.state === 'paused') {
      counts.active += 1
    }

    if ((item.state === 'error' || item.state === 'cancelled') && !item.dismissedAt) {
      counts.attention += 1
    }

    if (item.state === 'complete' && !item.dismissedAt) {
      counts.visibleComplete += 1
    }
  }

  return {
    ok: true,
    counts,
  }
}

export function serializeDownloadsResponse(downloads = civitaiDownloads.values()) {
  return createDownloadsResponse(downloads)
}

export async function clearDismissibleDownloads() {
  await ensureDownloadsLoaded()

  const now = Date.now()
  let cleared = 0

  for (const download of civitaiDownloads.values()) {
    if (
      (download.state === 'complete' || download.state === 'error' || download.state === 'cancelled') &&
      !download.dismissedAt
    ) {
      download.dismissedAt = now
      download.updatedAt = now
      cleared += 1
    }
  }

  if (cleared) {
    scheduleDownloadsPersist(true)
  }

  return cleared
}
