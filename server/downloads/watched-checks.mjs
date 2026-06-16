import { parseInteger } from '../civitai-query.mjs'
import { safeTrim } from '../shared.mjs'
import {
  normalizeDownloadFile,
  normalizeDownloadModelMetadata,
  normalizePreviewImage,
  normalizePreviewImages,
  sanitizeModelFilename,
} from './metadata.mjs'
import { enqueueCivitaiDownload } from './queue.mjs'
import {
  civitaiEarlyAccessStatus,
  fetchCivitaiVersion,
  isVersionDownloadable,
  normalizedAvailability,
} from './civitai-version.mjs'

export function pollIntervalMs() {
  return Math.max(
    60_000,
    Number.parseInt(process.env.CIVITAI_WATCHED_DOWNLOAD_POLL_INTERVAL_MS ?? `${60 * 60 * 1000}`, 10) || 60 * 60 * 1000,
  )
}

function nextCheckAfter(now = Date.now()) {
  return now + pollIntervalMs()
}

export function normalizeModelType(value) {
  const normalized = safeTrim(value).toLowerCase()
  if (normalized === 'checkpoint') {
    return 'Checkpoint'
  }

  if (normalized === 'lora') {
    return 'LORA'
  }

  if (normalized === 'controlnet' || normalized === 'control net' || normalized === 'control-net') {
    return 'ControlNet'
  }

  return ''
}

function modelFileCandidates(version) {
  return Array.isArray(version?.files) ? version.files.map((file) => normalizeDownloadFile(file)) : []
}

function chooseModelFile(version, watchedItem) {
  const files = modelFileCandidates(version)
  const watchedFileId = watchedItem?.fileId === null || watchedItem?.fileId === undefined
    ? ''
    : String(watchedItem.fileId)
  const watchedFileName = safeTrim(watchedItem?.fileName)

  return files.find((file) => watchedFileId && String(file.id) === watchedFileId)
    ?? files.find((file) => watchedFileName && file.name === watchedFileName)
    ?? files.find((file) => file.primary === true && file.type === 'Model')
    ?? files.find((file) => file.type === 'Model')
    ?? files.find((file) => file.primary === true)
    ?? normalizeDownloadFile(watchedItem?.file)
}

function unavailableReason(version, file, now) {
  if (!file?.name) {
    return 'No primary model file is available yet.'
  }

  const earlyAccessStatus = civitaiEarlyAccessStatus(version, now)
  if (earlyAccessStatus) {
    return earlyAccessStatus
  }

  if (!isVersionDownloadable(version, now)) {
    return normalizedAvailability(version?.availability) === 'earlyaccess'
      ? 'Early access locked'
      : 'Version unavailable'
  }

  if (!file.downloadUrl) {
    return 'Download URL not available yet.'
  }

  return ''
}

function enqueuePayloadForWatchedVersion(item, version, file) {
  const model = version?.model && typeof version.model === 'object' ? version.model : null
  const modelId = parseInteger(model?.id) ?? item.modelId
  const modelType = normalizeModelType(model?.type) || item.modelType
  const modelName = safeTrim(model?.name) || item.modelName
  const previewImages = normalizePreviewImages([
    ...(Array.isArray(version?.images) ? version.images : []),
    ...(Array.isArray(item.previewImages) ? item.previewImages : []),
    item.previewImage,
  ])
  const modelMetadata = normalizeDownloadModelMetadata(model ?? item.modelMetadata, {
    modelId,
    modelName,
    modelType,
    previewImages,
    creator: item.modelMetadata?.creator,
    stats: item.modelMetadata?.stats,
    tags: item.modelMetadata?.tags,
  })
  const modelNsfw = modelMetadata.nsfw

  return {
    modelId,
    modelName,
    modelType,
    modelNsfw,
    modelMetadata,
    versionId: parseInteger(version?.id) ?? item.versionId,
    versionName: safeTrim(version?.name) || item.versionName,
    baseModel: safeTrim(version?.baseModel) || item.baseModel,
    file,
    trainedWords: Array.isArray(version?.trainedWords) ? version.trainedWords.filter((word) => typeof word === 'string') : item.trainedWords,
    previewImage: normalizePreviewImage(version?.images?.[0]) ?? item.previewImage,
    previewImages,
  }
}

export async function checkWatchedDownloadItem(item, now) {
  item.lastCheckedAt = now
  item.updatedAt = now
  item.lastError = null

  let version
  try {
    version = await fetchCivitaiVersion(item.versionId)
  } catch (error) {
    item.state = 'watching'
    item.lastError = error instanceof Error ? error.message : 'Could not refresh Civitai version.'
    item.lastStatus = 'Waiting for Civitai.'
    item.nextCheckAt = nextCheckAfter(now)
    return { item, queued: false }
  }

  const file = chooseModelFile(version, item)
  const reason = unavailableReason(version, file, now)
  if (reason) {
    item.state = 'watching'
    item.lastStatus = reason
    item.nextCheckAt = nextCheckAfter(now)
    item.file = file
    item.fileId = file.id
    item.fileName = sanitizeModelFilename(file.name) ?? item.fileName
    return { item, queued: false }
  }

  try {
    const download = await enqueueCivitaiDownload(enqueuePayloadForWatchedVersion(item, version, file))
    item.state = 'queued'
    item.queuedDownloadId = download.id
    item.lastStatus = 'Queued after Civitai released the file.'
    item.nextCheckAt = null
    item.updatedAt = Date.now()
    item.file = file
    item.fileId = file.id
    item.fileName = sanitizeModelFilename(file.name) ?? item.fileName
    return { item, queued: true }
  } catch (error) {
    item.state = 'attention'
    item.lastError = error instanceof Error ? error.message : 'Could not queue watched download.'
    item.lastStatus = 'Queue failed.'
    item.nextCheckAt = nextCheckAfter(now)
    item.updatedAt = Date.now()
    return { item, queued: false }
  }
}
