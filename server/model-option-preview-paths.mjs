import { safeTrim } from './shared.mjs'

function mediaTypeForPreview(source) {
  return safeTrim(source?.mediaType ?? source?.type) || null
}

function modelArchiveMediaUrl(type, modelName, index) {
  return `/api/model-archive-media?type=${encodeURIComponent(type)}&name=${encodeURIComponent(modelName)}&index=${index}`
}

function scalarKey(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value)
  }

  return safeTrim(value)
}

function previewSourceKey(source) {
  const id = scalarKey(source?.id)
  if (id) {
    return `id:${id}`
  }

  const hash = scalarKey(source?.hash).toLowerCase()
  if (hash) {
    return `hash:${hash}`
  }

  const remoteUrl = safeTrim(source?.remoteUrl ?? source?.originalUrl ?? source?.sourceUrl)
  if (remoteUrl) {
    return `remote:${remoteUrl}`
  }

  const localPath = safeTrim(source?.path ?? source?.localPath)
  if (localPath) {
    return `path:${localPath.toLowerCase()}`
  }

  const url = safeTrim(source?.localUrl ?? source?.url)
  return url ? `url:${url}` : ''
}

function serializeDownloadPreviewPath(download, source, index) {
  const url = safeTrim(source?.url) ||
    (safeTrim(source?.path) && download?.id
      ? `/api/civitai/downloads/${encodeURIComponent(download.id)}/previews/${index}`
      : '')

  return url ? { url, mediaType: mediaTypeForPreview(source) } : null
}

function serializeSidecarPreviewPath(source, index, type, modelName) {
  const url = safeTrim(source?.path)
    ? modelArchiveMediaUrl(type, modelName, index)
    : safeTrim(source?.localUrl ?? source?.url)

  return url ? { url, mediaType: mediaTypeForPreview(source) } : null
}

function addPreviewPath(results, seenKeys, seenUrls, source, preview) {
  const url = safeTrim(preview?.url)
  if (!url) {
    return
  }

  const key = previewSourceKey(source)
  if ((key && seenKeys.has(key)) || seenUrls.has(url)) {
    return
  }

  if (key) {
    seenKeys.add(key)
  }
  seenUrls.add(url)
  results.push(preview)
}

export function serializeModelOptionPreviewPaths({ download, sidecarPayload, type, modelName }) {
  const downloadPaths = Array.isArray(download?.previewPaths) ? download.previewPaths : []
  const sidecarPaths = Array.isArray(sidecarPayload?.previewPaths)
    ? sidecarPayload.previewPaths
    : Array.isArray(sidecarPayload?.previewImages)
      ? sidecarPayload.previewImages
      : []

  const results = []
  const seenKeys = new Set()
  const seenUrls = new Set()

  downloadPaths.forEach((source, index) => {
    addPreviewPath(results, seenKeys, seenUrls, source, serializeDownloadPreviewPath(download, source, index))
  })
  sidecarPaths.forEach((source, index) => {
    addPreviewPath(results, seenKeys, seenUrls, source, serializeSidecarPreviewPath(source, index, type, modelName))
  })

  return results
}
