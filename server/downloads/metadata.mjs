import { createWriteStream } from 'node:fs'
import { copyFile, mkdir, readdir, stat, unlink, writeFile } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { civitaiImagesUrl, previewMimeExtensionMap, supportedPreviewExtensions, supportedVideoExtensions } from '../config.mjs'
import { normalizeOptionalBoolean, normalizePlainObject, safeTrim } from '../shared.mjs'
import { getStoredCivitaiApiKey } from '../settings.mjs'
import { scheduleDownloadsPersist } from './state.mjs'
import { verifyCivitaiDownloadHash } from './transfer.mjs'
import { getComfyCheckpointDir, getComfyLoraDir, normalizeNumericField, readJsonFileIfExists } from '../model-paths.mjs'
import { fetchCivitaiVersionMetadata } from '../model-metadata.mjs'

const pendingModelMetadataRefreshes = new Set()

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
    hashes: normalizePlainObject(file.hashes),
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

  const error = new Error('Only Checkpoint and LoRA downloads are supported.')
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

  return {
    id: normalizeNumericField(model.id ?? fallback.modelId ?? fallback.id, null),
    name: safeTrim(model.name ?? fallback.modelName ?? fallback.name),
    type: safeTrim(model.type ?? fallback.modelType ?? fallback.type),
    nsfw: normalizeOptionalBoolean(model.nsfw ?? fallback.modelNsfw ?? fallback.nsfw),
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
    tags: payload?.tags ?? download.modelMetadata?.tags,
  })

  download.modelMetadata = modelMetadata
  download.modelNsfw = modelMetadata.nsfw
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
  for (const download of downloads) {
    if (!download?.id || download.state !== 'complete' || hasDownloadModelNsfwMetadata(download)) {
      continue
    }

    if (pendingModelMetadataRefreshes.has(download.id)) {
      continue
    }

    pendingModelMetadataRefreshes.add(download.id)
    void refreshDownloadModelMetadata(download)
      .then((changed) => {
        if (changed) {
          download.updatedAt = Date.now()
          scheduleDownloadsPersist(true)
        }
      })
      .catch(() => {})
      .finally(() => {
        pendingModelMetadataRefreshes.delete(download.id)
      })
  }
}

export function getPreviewExtension(preview) {
  const previewUrl = typeof preview === 'string' ? preview : safeTrim(preview?.url)
  const previewType = typeof preview === 'string' ? '' : safeTrim(preview?.type).toLowerCase()

  if (previewType.includes('video')) {
    return '.mp4'
  }

  try {
    const extension = extname(new URL(previewUrl).pathname).toLowerCase()
    return supportedPreviewExtensions.has(extension) ? extension : '.jpg'
  } catch {
    return '.jpg'
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

export function buildPreviewFileName(image, index) {
  const extension = getPreviewExtension(image)
  const idPart = image.id ? safeTrim(String(image.id)).replace(/[^a-z0-9._-]+/gi, '-') : String(index + 1).padStart(4, '0')
  return `${String(index + 1).padStart(4, '0')}-${idPart}${extension}`
}

export async function buildCivitaiRequestHeaders(accept = 'application/json') {
  const headers = { Accept: accept }
  const apiKey = await getStoredCivitaiApiKey()

  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`
  }

  return headers
}

export async function fetchCivitaiVersionImages(versionId) {
  const images = []
  let cursor = ''

  for (let page = 0; page < 20; page += 1) {
    const upstreamUrl = new URL(civitaiImagesUrl.toString())
    upstreamUrl.searchParams.set('modelVersionId', String(versionId))
    upstreamUrl.searchParams.set('limit', '100')
    if (cursor) {
      upstreamUrl.searchParams.set('cursor', cursor)
    }

    const response = await fetch(upstreamUrl, {
      headers: await buildCivitaiRequestHeaders('application/json'),
      redirect: 'follow',
    })
    if (!response.ok) {
      break
    }

    const payload = await response.json()
    images.push(...normalizePreviewImages(payload?.items))
    cursor = safeTrim(payload?.metadata?.nextCursor)
    if (!cursor) {
      break
    }
  }

  return normalizePreviewImages(images)
}

export async function resolveDownloadPreviewImages(download) {
  const providedImages = normalizePreviewImages([
    ...(Array.isArray(download.previewImages) ? download.previewImages : []),
    download.previewImage,
  ])

  let fetchedImages = []
  if (download.versionId) {
    fetchedImages = await fetchCivitaiVersionImages(download.versionId)
  }

  return normalizePreviewImages([...providedImages, ...fetchedImages])
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

export async function downloadPreviewMediaToPath(image, targetPath, headers) {
  const previewUrl = safeTrim(image?.url)
  if (!previewUrl) {
    return false
  }

  try {
    const response = await fetch(previewUrl, { headers })
    if (!response.ok || !response.body) {
      return null
    }

    const contentType = safeTrim(response.headers.get('content-type')).split(';')[0]?.toLowerCase()
    const responseExtension = previewMimeExtensionMap.get(contentType)
    const currentExtension = extname(targetPath).toLowerCase()
    const finalPath = responseExtension && responseExtension !== currentExtension
      ? `${targetPath.slice(0, -currentExtension.length)}${responseExtension}`
      : targetPath

    await pipeline(Readable.fromWeb(response.body), createWriteStream(finalPath))
    return finalPath
  } catch {
    return false
  }
}

export async function markDownloadedSidecars(download) {
  await refreshDownloadModelMetadata(download).catch(() => false)

  const previewImages = await resolveDownloadPreviewImages(download)
  const mediaHeaders = await buildCivitaiRequestHeaders('image/*, video/*')
  const previewPaths = []

  if (previewImages.length) {
    await cleanPreviewOutputs(download)
    const basePath = getDownloadBasePath(download)
    const galleryDir = getDownloadPreviewGalleryDir(download)
    await mkdir(galleryDir, { recursive: true })

    for (const [index, image] of previewImages.entries()) {
      const galleryPath = join(galleryDir, buildPreviewFileName(image, index))
      const downloadedPath = await downloadPreviewMediaToPath(image, galleryPath, mediaHeaders)
      if (!downloadedPath) {
        continue
      }

      const item = {
        ...image,
        path: downloadedPath,
        mediaType: supportedVideoExtensions.has(extname(downloadedPath).toLowerCase()) ? 'video' : 'image',
        url: `/api/civitai/downloads/${encodeURIComponent(download.id)}/previews/${previewPaths.length}`,
      }
      previewPaths.push(item)

      if (previewPaths.length === 1) {
        const primaryPreviewPath = `${basePath}.preview${extname(downloadedPath)}`
        await copyFile(downloadedPath, primaryPreviewPath)
        download.previewPath = primaryPreviewPath
        download.previewUrl = `/api/civitai/downloads/${encodeURIComponent(download.id)}/preview`
      }
    }
  }

  if (previewPaths.length) {
    download.previewImages = previewImages
    download.previewPaths = previewPaths
  }

  const sidecarPath = `${download.targetPath}.civitai.info`
  download.sidecarPath = sidecarPath
  await writeFile(sidecarPath, `${JSON.stringify(buildDownloadSidecarPayload(download), null, 2)}\n`, 'utf8')
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
