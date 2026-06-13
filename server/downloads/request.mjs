import { safeTrim } from '../shared.mjs'
import { getStoredCivitaiApiKey } from '../settings.mjs'

function createCivitaiDownloadHeaders(apiKey, rangeStart = 0, rangeEnd = null) {
  const headers = {
    Accept: 'application/octet-stream',
  }

  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`
  }

  if (rangeStart > 0 || Number.isInteger(rangeEnd)) {
    headers.Range = `bytes=${rangeStart}-${Number.isInteger(rangeEnd) ? rangeEnd : ''}`
  }

  return headers
}

function buildAuthenticatedCivitaiDownloadUrl(downloadUrl, apiKey) {
  const trimmedUrl = safeTrim(downloadUrl)
  if (!trimmedUrl || !apiKey) {
    return trimmedUrl
  }

  try {
    const url = new URL(trimmedUrl)
    const civitaiHost = url.hostname === 'civitai.com' || url.hostname.endsWith('.civitai.com')
    if (url.protocol === 'https:' && civitaiHost && url.pathname.startsWith('/api/download/') && !url.searchParams.has('token')) {
      url.searchParams.set('token', apiKey)
      return url.toString()
    }
  } catch {
    return trimmedUrl
  }

  return trimmedUrl
}

export async function buildCivitaiDownloadHeaders(rangeStart = 0, rangeEnd = null) {
  const apiKey = await getStoredCivitaiApiKey()
  return createCivitaiDownloadHeaders(apiKey, rangeStart, rangeEnd)
}

export async function buildCivitaiDownloadRequest(downloadUrl, rangeStart = 0, rangeEnd = null) {
  const apiKey = await getStoredCivitaiApiKey()

  return {
    url: buildAuthenticatedCivitaiDownloadUrl(downloadUrl, apiKey),
    headers: createCivitaiDownloadHeaders(apiKey, rangeStart, rangeEnd),
  }
}

function parseContentRange(contentRange) {
  if (!contentRange) {
    return null
  }

  const match = /^bytes\s+(\d+)-(\d+)\/(\d+)$/i.exec(contentRange.trim())
  if (!match) {
    return null
  }

  const start = Number.parseInt(match[1], 10)
  const end = Number.parseInt(match[2], 10)
  const total = Number.parseInt(match[3], 10)
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || !Number.isSafeInteger(total) || start < 0 || end < start || total <= 0) {
    return null
  }

  return { start, end, total }
}

export function parseContentRangeTotal(contentRange) {
  return parseContentRange(contentRange)?.total ?? null
}

export function assertSegmentContentRange(response, range, totalBytes) {
  const contentRange = parseContentRange(response.headers.get('content-range'))
  if (!contentRange || contentRange.start !== range.start || contentRange.end !== range.end || contentRange.total !== totalBytes) {
    throw new Error(`Civitai segment ${range.index + 1} did not return the requested byte range.`)
  }
}
