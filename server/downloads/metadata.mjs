import { readdir, stat, unlink } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import { supportedPreviewExtensions } from '../config.mjs'
import { normalizeOptionalBoolean, normalizePlainObject, safeTrim } from '../shared.mjs'
import { getStoredCivitaiApiKey } from '../settings.mjs'
import { scheduleDownloadsPersist } from './state.mjs'
import { verifyCivitaiDownloadHash } from './transfer.mjs'
import { normalizeCivitaiDownloadHashes } from './hash-metadata.mjs'
import { getComfyCheckpointDir, getComfyControlNetDir, getComfyLoraDir, normalizeNumericField } from '../model-paths.mjs'
import { readJsonFileIfExists } from '../model-trigger-words.mjs'
import { fetchCivitaiVersionMetadata } from '../model-metadata.mjs'
import { refreshCivitaiArchiveForDownload } from '../civitai-archive.mjs'

const pendingModelMetadataRefreshes = new Set()
const failedModelMetadataRefreshes = new Map()
const modelMetadataRefreshFailureBackoffMs = 15 * 60 * 1000
const maxAutomaticModelMetadataRefreshesPerPass = 3

function modelMetadataRefreshKey(download) {
  return safeTrim(download?.id)
}

function isModelMetadataRefreshBackedOff(key, now = Date.now()) {
  const retryAt = failedModelMetadataRefreshes.get(key)
  if (!retryAt) {
    return false
  }

  if (retryAt > now) {
    return true
  }

  failedModelMetadataRefreshes.delete(key)
  return false
}

function markModelMetadataRefreshFailed(key) {
  failedModelMetadataRefreshes.set(key, Date.now() + modelMetadataRefreshFailureBackoffMs)
}

export function resetDownloadMetadataRuntimeState() {
  pendingModelMetadataRefreshes.clear()
  failedModelMetadataRefreshes.clear()
}

export function normalizeDownloadFile(rawFile) {
  const file = normalizePlainObject(rawFile)
  const name = safeTrim(file.name)
  const downloadUrl = safeTrim(file.downloadUrl)
  const sizeKb = normalizeNumericField(file.sizeKb ?? file.sizeKB, null)

  return {
    id: file.id ?? null,
    name,
    type: safeTrim(file.type),
    primary: file.primary === true,
    downloadUrl,
    sizeKb,
    hashes: normalizeCivitaiDownloadHashes(file.hashes),
    metadata: normalizePlainObject(file.metadata),
  }
}

export function sanitizeModelFilename(value) {
  const filename = basename(safeTrim(value).replace(/\\/g, '/'))
  if (!filename || filename === '.' || filename === '..') {
    return null
  }

  // Control characters are intentionally stripped from filesystem names.
  // eslint-disable-next-line no-control-regex
  return filename.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
}

export function buildDownloadId(modelId, versionId, file) {
  return [
    modelId,
    versionId,
    file.id ?? file.name,
  ]
    .map((entry) => safeTrim(String(entry)).replace(/[^a-z0-9._-]+/gi, '-'))
    .filter(Boolean)
    .join('__')
}

export async function resolveCivitaiDownloadTargetDir(modelType) {
  const normalizedType = safeTrim(modelType).toLowerCase()
  if (normalizedType === 'checkpoint') {
    return getComfyCheckpointDir()
  }

  if (normalizedType === 'lora') {
    return getComfyLoraDir()
  }

  if (normalizedType === 'controlnet' || normalizedType === 'control net') {
    return getComfyControlNetDir()
  }

  const error = new Error('Only Checkpoint, LoRA, and ControlNet downloads are supported.')
  error.code = 'unsupported-model-type'
  throw error
}

export function buildDownloadSidecarPayload(download) {
  const modelMetadata = normalizeDownloadModelMetadata(download.modelMetadata ?? download.model, {
    modelId: download.modelId,
    modelName: download.modelName,
    modelType: download.modelType,
    modelNsfw: download.modelNsfw,
  })

  return {
    source: 'civitai',
    modelId: download.modelId,
    modelName: download.modelName,
    modelType: download.modelType,
    modelNsfw: modelMetadata.nsfw,
    modelNsfwOverride: modelMetadata.modelNsfwOverride,
    imageSafetyOverrides: modelMetadata.imageSafetyOverrides,
    model: modelMetadata,
    modelMetadata,
    versionId: download.versionId,
    versionName: download.versionName,
    baseModel: download.baseModel,
    fileId: download.fileId,
    fileName: download.fileName,
    downloadUrl: download.downloadUrl,
    trainedWords: download.trainedWords,
    hashes: download.hashes,
    previewImage: download.previewImage,
    previewImages: download.previewImages,
    previewPaths: download.previewPaths,
    downloadedAt: download.finishedAt,
  }
}

export function normalizeDownloadModelMetadata(rawModel, fallback = {}) {
  const model = normalizePlainObject(rawModel)
  const creator = normalizePlainObject(model.creator ?? fallback.creator)
  const stats = normalizePlainObject(model.stats ?? fallback.stats)
  const imageSafetyOverrides = normalizePlainObject(model.imageSafetyOverrides ?? fallback.imageSafetyOverrides)

  return {
    id: normalizeNumericField(model.id ?? fallback.modelId ?? fallback.id, null),
    name: safeTrim(model.name ?? fallback.modelName ?? fallback.name),
    type: safeTrim(model.type ?? fallback.modelType ?? fallback.type),
    nsfw: normalizeOptionalBoolean(model.nsfw ?? fallback.modelNsfw ?? fallback.nsfw),
    modelNsfwOverride: normalizeOptionalBoolean(model.modelNsfwOverride ?? fallback.modelNsfwOverride),
    imageSafetyOverrides,
    creator: creator.username ? { username: safeTrim(creator.username) } : null,
    stats: Object.keys(stats).length ? stats : null,
    tags: Array.isArray(model.tags ?? fallback.tags) ? (model.tags ?? fallback.tags).filter((tag) => typeof tag === 'string') : [],
  }
}

export function applyDownloadModelMetadata(download, payload) {
  const modelMetadata = normalizeDownloadModelMetadata(payload?.modelMetadata ?? payload?.model, {
    modelId: payload?.modelId ?? download.modelId,
    modelName: payload?.modelName ?? download.modelName,
    modelType: payload?.modelType ?? download.modelType,
    modelNsfw: payload?.modelNsfw ?? payload?.nsfw ?? download.modelNsfw,
    modelNsfwOverride: payload?.modelNsfwOverride ?? download.modelNsfwOverride ?? download.modelMetadata?.modelNsfwOverride,
    imageSafetyOverrides: payload?.imageSafetyOverrides ?? download.imageSafetyOverrides ?? download.modelMetadata?.imageSafetyOverrides,
    tags: payload?.tags ?? download.modelMetadata?.tags,
  })

  download.modelMetadata = modelMetadata
  download.modelNsfw = modelMetadata.nsfw
  download.modelNsfwOverride = modelMetadata.modelNsfwOverride
  download.imageSafetyOverrides = modelMetadata.imageSafetyOverrides
  return download
}

export function hasDownloadModelNsfwMetadata(download) {
  return normalizeOptionalBoolean(download?.modelNsfw ?? download?.modelMetadata?.nsfw ?? download?.model?.nsfw) !== null
}

async function readDownloadSidecarPayload(download) {
  const candidates = [
    download.sidecarPath,
    download.targetPath ? `${download.targetPath}.civitai.info` : '',
    download.targetPath ? `${getDownloadBasePath(download)}.civitai.info` : '',
  ].filter(Boolean)

  for (const candidate of candidates) {
    const payload = await readJsonFileIfExists(candidate)
    if (payload) {
      return payload
    }
  }

  return null
}

export async function refreshDownloadModelMetadata(download, { force = false } = {}) {
  if (!download || (!force && hasDownloadModelNsfwMetadata(download))) {
    return false
  }

  const sidecarPayload = await readDownloadSidecarPayload(download)
  if (
    sidecarPayload &&
    normalizeOptionalBoolean(sidecarPayload.modelNsfw ?? sidecarPayload.model?.nsfw ?? sidecarPayload.modelMetadata?.nsfw) !== null
  ) {
    applyDownloadModelMetadata(download, sidecarPayload)
    return true
  }

  const payload = await fetchCivitaiVersionMetadata({
    versionId: download.versionId,
    hashes: download.hashes,
  })

  if (!payload) {
    return false
  }

  applyDownloadModelMetadata(download, payload)
  return true
}

export function refreshMissingDownloadModelMetadataInBackground(downloads) {
  let scheduledRefreshes = 0
  const now = Date.now()

  for (const download of downloads) {
    if (!download?.id || download.state !== 'complete' || hasDownloadModelNsfwMetadata(download)) {
      continue
    }

    const refreshKey = modelMetadataRefreshKey(download)
    if (
      !refreshKey ||
      pendingModelMetadataRefreshes.has(refreshKey) ||
      isModelMetadataRefreshBackedOff(refreshKey, now)
    ) {
      continue
    }

    if (scheduledRefreshes >= maxAutomaticModelMetadataRefreshesPerPass) {
      break
    }

    scheduledRefreshes += 1
    pendingModelMetadataRefreshes.add(refreshKey)
    void refreshDownloadModelMetadata(download)
      .then((changed) => {
        if (changed) {
          failedModelMetadataRefreshes.delete(refreshKey)
          download.updatedAt = Date.now()
          scheduleDownloadsPersist(true)
        } else {
          markModelMetadataRefreshFailed(refreshKey)
        }
      })
      .catch(() => {
        markModelMetadataRefreshFailed(refreshKey)
      })
      .finally(() => {
        pendingModelMetadataRefreshes.delete(refreshKey)
      })
  }
}

export function normalizePreviewImage(rawImage) {
  const image = normalizePlainObject(rawImage)
  const url = safeTrim(image.url)
  if (!url) {
    return null
  }

  return {
    id: image.id ?? null,
    url,
    width: normalizeNumericField(image.width, null),
    height: normalizeNumericField(image.height, null),
    hash: safeTrim(image.hash),
    type: safeTrim(image.type),
    nsfw: image.nsfw,
    nsfwLevel: safeTrim(image.nsfwLevel),
    meta: normalizePlainObject(image.meta),
    postId: image.postId ?? null,
    username: safeTrim(image.username),
    modelVersionIds: Array.isArray(image.modelVersionIds) ? image.modelVersionIds : [],
  }
}

export function normalizePreviewImages(rawImages) {
  const candidates = Array.isArray(rawImages) ? rawImages : []
  const seenKeys = new Set()
  const images = []

  for (const candidate of candidates) {
    const image = normalizePreviewImage(candidate)
    const key = image?.id ? `id:${image.id}` : image?.hash ? `hash:${image.hash}` : `url:${image?.url}`
    if (!image || seenKeys.has(key)) {
      continue
    }

    seenKeys.add(key)
    images.push(image)
  }

  return images
}

export function getDownloadBasePath(download) {
  return download.targetPath.slice(0, -extname(download.targetPath).length)
}

export function getDownloadPreviewGalleryDir(download) {
  return `${getDownloadBasePath(download)}.previews`
}

export async function buildCivitaiRequestHeaders(accept = 'application/json') {
  const headers = { Accept: accept }
  const apiKey = await getStoredCivitaiApiKey()

  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`
  }

  return headers
}

export async function cleanPreviewOutputs(download) {
  const basePath = getDownloadBasePath(download)
  for (const extension of supportedPreviewExtensions) {
    await safeUnlink(`${basePath}.preview${extension}`)
  }

  const galleryDir = getDownloadPreviewGalleryDir(download)
  try {
    const entries = await readdir(galleryDir)
    await Promise.all(entries.map((entry) => safeUnlink(join(galleryDir, entry))))
  } catch {}
}

export async function markDownloadedSidecars(download) {
  await refreshCivitaiArchiveForDownload(download)
}

export async function refreshDownloadedSidecarsInBackground(download) {
  try {
    await markDownloadedSidecars(download)
    download.updatedAt = Date.now()
    scheduleDownloadsPersist(true)
  } catch (error) {
    console.warn(
      `Could not refresh Civitai sidecars for ${download.fileName}:`,
      error instanceof Error ? error.message : error,
    )
  }
}

export async function refreshCompletedDownloadPreviews(download) {
  if (download.state !== 'complete') {
    return download
  }

  const targetStats = await statFileIfExists(download.targetPath)
  if (!targetStats) {
    download.state = 'error'
    download.error = 'Downloaded model file is missing.'
    download.updatedAt = Date.now()
    return download
  }

  try {
    await verifyCivitaiDownloadHash(download)
  } catch (error) {
    download.state = 'error'
    download.error = error instanceof Error ? error.message : 'Downloaded model file hash did not match Civitai metadata.'
    download.updatedAt = Date.now()
    return download
  }

  await markDownloadedSidecars(download)
  download.updatedAt = Date.now()
  scheduleDownloadsPersist(true)
  return download
}

export async function safeUnlink(filePath) {
  if (!filePath) {
    return
  }

  try {
    await unlink(filePath)
  } catch {}
}

export async function statFileIfExists(filePath) {
  try {
    const fileStat = await stat(filePath)
    return fileStat.isFile() ? fileStat : null
  } catch {
    return null
  }
}
