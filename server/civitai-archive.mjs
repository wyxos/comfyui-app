import { copyFile, mkdir, stat, writeFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { previewMimeExtensionMap, supportedPreviewExtensions, supportedVideoExtensions } from './config.mjs'
import { parseInteger } from './civitai-query.mjs'
import { sendError, sendJson, streamFile } from './http.mjs'
import { resolveModelPath } from './model-paths.mjs'
import { extractCivitaiImageId, hydrateArchiveImageMetadata } from './civitai-archive-images.mjs'
import { fetchCivitaiArchiveVersionMetadata } from './civitai-archive-metadata.mjs'
import { readJsonFileIfExists } from './model-trigger-words.mjs'
import { normalizePlainObject, safeTrim } from './shared.mjs'
import { getStoredCivitaiApiKey } from './settings.mjs'
import {
  archiveModelType,
  getArchiveBasePath,
  getArchivePreviewDir,
  getArchiveSidecarPath,
  normalizeArchiveType,
  rootForArchiveType,
} from './civitai-archive-paths.mjs'

export { getArchiveBasePath, getArchivePreviewDir, getArchiveSidecarPath } from './civitai-archive-paths.mjs'

export const civitaiArchiveVersion = 1

function normalizeNumber(value, fallback = null) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value)
  }
  const parsed = Number.parseInt(safeTrim(value), 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

function uniqueStringList(...values) {
  const seen = new Set()
  const list = []
  for (const value of values.flat()) {
    const text = safeTrim(value)
    const key = text.toLowerCase()
    if (!text || seen.has(key)) {
      continue
    }
    seen.add(key)
    list.push(text)
  }
  return list
}

function normalizeArchiveImage(image, index = 0) {
  const item = normalizePlainObject(image)
  const remoteUrl = safeTrim(item.remoteUrl ?? item.originalUrl ?? item.sourceUrl ?? item.url)
  const localPath = safeTrim(item.path ?? item.localPath)
  const localUrl = safeTrim(item.localUrl)
  if (!remoteUrl && !localPath && !localUrl) {
    return null
  }

  return {
    id: extractCivitaiImageId(item) ?? null,
    url: localUrl || remoteUrl,
    remoteUrl,
    width: normalizeNumber(item.width),
    height: normalizeNumber(item.height),
    hash: safeTrim(item.hash),
    type: safeTrim(item.type),
    nsfw: item.nsfw ?? null,
    nsfwLevel: item.nsfwLevel ?? null,
    meta: normalizePlainObject(item.meta),
    postId: item.postId ?? null,
    username: safeTrim(item.username),
    modelVersionIds: Array.isArray(item.modelVersionIds) ? item.modelVersionIds : [],
    path: localPath,
    mediaType: safeTrim(item.mediaType) || (supportedVideoExtensions.has(extname(localPath).toLowerCase()) ? 'video' : 'image'),
    archiveSource: localPath ? 'local' : 'remote',
    archiveIndex: index,
    mediaStatus: safeTrim(item.mediaStatus) || (localPath ? 'downloaded' : 'remote'),
  }
}

function normalizeArchiveImages(images) {
  const candidates = Array.isArray(images) ? images : []
  const seen = new Set()
  const normalized = []

  for (const candidate of candidates) {
    const image = normalizeArchiveImage(candidate, normalized.length)
    const key = image?.id ? `id:${image.id}` : image?.hash ? `hash:${image.hash}` : image?.remoteUrl ? `url:${image.remoteUrl}` : `path:${image?.path}`
    if (!image || seen.has(key)) {
      continue
    }
    seen.add(key)
    normalized.push(image)
  }
  return normalized
}

function getArchivePreviewExtension(image) {
  const type = safeTrim(image?.type).toLowerCase()
  if (type.includes('video')) {
    return '.mp4'
  }
  try {
    const extension = extname(new URL(safeTrim(image?.remoteUrl ?? image?.url)).pathname).toLowerCase()
    return supportedPreviewExtensions.has(extension) ? extension : '.jpg'
  } catch {
    return '.jpg'
  }
}

function archivePreviewFileName(image, index) {
  const id = image?.id ? safeTrim(String(image.id)).replace(/[^a-z0-9._-]+/gi, '-') : String(index + 1).padStart(4, '0')
  return `${String(index + 1).padStart(4, '0')}-${id}${getArchivePreviewExtension(image)}`
}

async function archiveRequestHeaders(accept = 'application/json') {
  const headers = { Accept: accept }
  const apiKey = await getStoredCivitaiApiKey()
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`
  }
  return headers
}

async function writeResponseBodyToFile(response, targetPath) {
  const { pipeline } = await import('node:stream/promises')
  const { Readable } = await import('node:stream')
  const { createWriteStream } = await import('node:fs')
  await pipeline(Readable.fromWeb(response.body), createWriteStream(targetPath))
}

async function downloadArchiveMediaToPath(image, targetPath, { fetchImpl = fetch } = {}) {
  const remoteUrl = safeTrim(image?.remoteUrl ?? image?.url)
  if (!remoteUrl) {
    return { path: '', status: 'missing-url' }
  }

  try {
    const response = await fetchImpl(remoteUrl, { headers: await archiveRequestHeaders('image/*, video/*') })
    if (!response.ok || !response.body) {
      return { path: '', status: `http-${response.status}` }
    }
    const contentType = safeTrim(response.headers.get('content-type')).split(';')[0]?.toLowerCase()
    const responseExtension = previewMimeExtensionMap.get(contentType)
    const currentExtension = extname(targetPath).toLowerCase()
    const finalPath = responseExtension && responseExtension !== currentExtension
      ? `${targetPath.slice(0, -currentExtension.length)}${responseExtension}`
      : targetPath
    await writeResponseBodyToFile(response, finalPath)
    return { path: finalPath, status: 'downloaded' }
  } catch {
    return { path: '', status: 'failed' }
  }
}

async function statFile(filePath) {
  try {
    const stats = await stat(filePath)
    return stats.isFile() ? stats : null
  } catch {
    return null
  }
}

function sidecarToArchiveModel(payload, type, modelName) {
  const archiveImages = normalizeArchiveImages(payload?.previewImages ?? payload?.previewPaths ?? payload?.images)
  const model = normalizePlainObject(payload?.model)
  const modelMetadata = normalizePlainObject(payload?.modelMetadata)
  const version = normalizePlainObject(payload?.modelVersion)
  const modelId = normalizeNumber(payload?.modelId ?? model.id ?? modelMetadata.id)
  const versionId = normalizeNumber(payload?.versionId ?? payload?.modelVersionId ?? version.id)
  const normalizedType = archiveModelType(type, payload?.modelType ?? model.type ?? modelMetadata.type)

  return {
    id: modelId,
    name: safeTrim(payload?.modelName ?? model.name ?? modelMetadata.name ?? modelName),
    type: normalizedType,
    nsfw: payload?.modelNsfw ?? model.nsfw ?? modelMetadata.nsfw ?? null,
    creator: normalizePlainObject(model.creator ?? modelMetadata.creator),
    stats: normalizePlainObject(model.stats ?? modelMetadata.stats),
    tags: Array.isArray(model.tags ?? modelMetadata.tags) ? (model.tags ?? modelMetadata.tags) : [],
    modelVersions: versionId
      ? [{
          id: versionId,
          modelId,
          name: safeTrim(payload?.versionName ?? version.name) || `Version ${versionId}`,
          baseModel: safeTrim(payload?.baseModel ?? version.baseModel),
          trainedWords: uniqueStringList(payload?.trainedWords, version.trainedWords),
          files: Array.isArray(payload?.files)
            ? payload.files
            : payload?.fileName
              ? [{ id: payload.fileId ?? null, name: payload.fileName, type: 'Model', primary: true, hashes: payload.hashes ?? {} }]
              : [],
          images: archiveImages.map((image, index) => ({
            ...image,
            url: image.path
              ? `/api/model-archive-media?type=${encodeURIComponent(type)}&name=${encodeURIComponent(modelName)}&index=${index}`
              : image.url,
            archiveSource: image.path ? 'local' : 'remote',
          })),
        }]
      : [],
  }
}

async function resolveArchiveRequest(url) {
  const type = normalizeArchiveType(url.searchParams.get('type'))
  const name = safeTrim(url.searchParams.get('name'))
  if (!type) {
    return { error: { status: 400, code: 'invalid-model-type', message: 'Model archive type is invalid.' } }
  }
  const rootPath = await rootForArchiveType(type)
  const modelPath = rootPath ? resolveModelPath(rootPath, name) : null
  if (!name || !modelPath) {
    return { error: { status: 400, code: 'invalid-model-name', message: 'Model archive name is invalid.' } }
  }
  return { type, name, rootPath, modelPath }
}

export async function readModelArchive({ type, name, modelPath }) {
  const sidecarPath = getArchiveSidecarPath(modelPath)
  const payload = await readJsonFileIfExists(sidecarPath)
  if (!payload) {
    return { item: null, archiveStatus: { state: 'missing' } }
  }

  return {
    item: sidecarToArchiveModel(payload, type, name),
    archiveStatus: {
      state: payload.archiveStatus?.state ?? (payload.archiveVersion ? 'ready' : 'legacy'),
      mediaTotal: payload.archiveStatus?.mediaTotal ?? normalizeArchiveImages(payload.previewImages ?? payload.previewPaths).length,
      mediaDownloaded: payload.archiveStatus?.mediaDownloaded ?? normalizeArchiveImages(payload.previewImages ?? payload.previewPaths).filter((image) => image.path).length,
      mediaFailed: payload.archiveStatus?.mediaFailed ?? 0,
      partial: payload.archiveStatus?.partial ?? false,
      archiveVersion: payload.archiveVersion ?? null,
    },
    payload,
  }
}

export async function handleModelArchive(url, response) {
  const resolved = await resolveArchiveRequest(url)
  if (resolved.error) {
    return sendError(response, resolved.error.status, resolved.error.code, resolved.error.message)
  }

  const archive = await readModelArchive(resolved)
  return sendJson(response, 200, {
    ok: true,
    source: 'local-archive',
    item: archive.item,
    archiveStatus: archive.archiveStatus,
  })
}

export async function handleModelArchiveMedia(url, response) {
  const resolved = await resolveArchiveRequest(url)
  if (resolved.error) {
    return sendError(response, resolved.error.status, resolved.error.code, resolved.error.message)
  }

  const index = parseInteger(url.searchParams.get('index'))
  if (index === null || index < 0) {
    return sendError(response, 400, 'invalid-archive-media-index', 'Archive media index is invalid.')
  }

  const archive = await readModelArchive(resolved)
  const image = archive.item?.modelVersions?.[0]?.images?.[index] ?? null
  const sidecarImage = normalizeArchiveImages(archive.payload?.previewImages ?? archive.payload?.previewPaths)[index]
  const mediaPath = safeTrim(sidecarImage?.path ?? image?.path)
  if (!mediaPath || !(await statFile(mediaPath))) {
    return sendError(response, 404, 'archive-media-not-found', 'Archive media was not found.')
  }

  return streamFile(response, mediaPath)
}

function mergeArchiveModelPayload(download, versionPayload) {
  const version = normalizePlainObject(versionPayload)
  const model = normalizePlainObject(version.model ?? download.model ?? download.modelMetadata)
  const files = Array.isArray(version.files) && version.files.length
    ? version.files
    : download.fileName
      ? [{ id: download.fileId ?? null, name: download.fileName, type: download.fileType ?? 'Model', primary: true, hashes: download.hashes ?? {} }]
      : []

  return {
    modelId: normalizeNumber(download.modelId ?? version.modelId ?? model.id),
    modelName: safeTrim(download.modelName ?? model.name),
    modelType: safeTrim(download.modelType ?? model.type),
    modelNsfw: download.modelNsfw ?? model.nsfw ?? null,
    model: {
      ...model,
      id: normalizeNumber(model.id ?? download.modelId ?? version.modelId),
      name: safeTrim(model.name ?? download.modelName),
      type: safeTrim(model.type ?? download.modelType),
    },
    versionId: normalizeNumber(download.versionId ?? version.id),
    versionName: safeTrim(download.versionName ?? version.name),
    baseModel: safeTrim(download.baseModel ?? version.baseModel),
    trainedWords: uniqueStringList(download.trainedWords, version.trainedWords),
    fileId: download.fileId ?? files[0]?.id ?? null,
    fileName: download.fileName ?? files[0]?.name ?? '',
    hashes: download.hashes ?? files[0]?.hashes ?? {},
    files,
  }
}

function archiveImageMatchKeys(image) {
  const keys = []
  const normalized = normalizeArchiveImage(image)
  if (!normalized) {
    return keys
  }
  if (normalized.id !== null && normalized.id !== undefined && normalized.id !== '') {
    keys.push(`id:${normalized.id}`)
  }
  if (normalized.hash) {
    keys.push(`hash:${normalized.hash}`)
  }
  if (normalized.remoteUrl) {
    keys.push(`url:${normalized.remoteUrl}`)
  }
  return keys
}

async function findReusableArchiveMedia(image, candidates) {
  const keys = new Set(archiveImageMatchKeys(image))
  const directPath = safeTrim(image?.path)
  if (directPath && await statFile(directPath)) {
    return directPath
  }

  for (const candidate of candidates) {
    const candidatePath = safeTrim(candidate?.path)
    if (!candidatePath || !(await statFile(candidatePath))) {
      continue
    }
    const candidateKeys = archiveImageMatchKeys(candidate)
    if (candidateKeys.some((key) => keys.has(key))) {
      return candidatePath
    }
  }

  return ''
}

export async function refreshCivitaiArchiveForDownload(download, { fetchImpl = fetch } = {}) {
  if (!download?.targetPath || download.state !== 'complete') {
    return { changed: false, skipped: true, reason: 'not-complete' }
  }
  if (!(await statFile(download.targetPath))) {
    return { changed: false, skipped: true, reason: 'missing-model-file' }
  }

  const versionPayload = await fetchCivitaiArchiveVersionMetadata({
    versionId: download.versionId,
    hashes: download.hashes,
    fetchImpl,
  }).catch(() => null)
  const modelPayload = mergeArchiveModelPayload(download, versionPayload)
  const providedImages = normalizeArchiveImages([
    ...(Array.isArray(download.previewImages) ? download.previewImages : []),
    download.previewImage,
  ])
  const versionImages = await hydrateArchiveImageMetadata(normalizeArchiveImages(versionPayload?.images), { fetchImpl })
  const images = normalizeArchiveImages(versionImages.length
    ? versionImages
    : await hydrateArchiveImageMetadata(providedImages, { fetchImpl }))
  const galleryDir = getArchivePreviewDir(download.targetPath)
  await mkdir(galleryDir, { recursive: true })
  const existingSidecar = await readJsonFileIfExists(getArchiveSidecarPath(download.targetPath))
  const reusableMediaCandidates = normalizeArchiveImages([
    ...(Array.isArray(existingSidecar?.previewImages) ? existingSidecar.previewImages : []),
    ...(Array.isArray(existingSidecar?.previewPaths) ? existingSidecar.previewPaths : []),
    ...(Array.isArray(download.previewPaths) ? download.previewPaths : []),
    download.previewImage,
  ])

  const archivedImages = []
  let mediaDownloaded = 0
  let mediaFetched = 0
  let mediaReused = 0
  let mediaFailed = 0
  for (const [index, image] of images.entries()) {
    const candidatePath = join(galleryDir, archivePreviewFileName(image, index))
    const reusablePath = await findReusableArchiveMedia(image, reusableMediaCandidates)
    const downloaded = reusablePath
      ? { path: reusablePath, status: 'reused' }
      : await downloadArchiveMediaToPath(image, candidatePath, { fetchImpl })
    if (!downloaded.path) {
      mediaFailed += 1
      archivedImages.push({
        ...image,
        mediaStatus: downloaded.status,
      })
      continue
    }
    mediaDownloaded += 1
    if (downloaded.status === 'reused') {
      mediaReused += 1
    } else {
      mediaFetched += 1
    }
    const mediaType = supportedVideoExtensions.has(extname(downloaded.path).toLowerCase()) ? 'video' : 'image'
    const localImage = {
      ...image,
      remoteUrl: safeTrim(image.remoteUrl ?? image.url),
      path: downloaded.path,
      mediaType,
      mediaStatus: downloaded.status === 'reused' ? 'reused' : 'downloaded',
    }
    archivedImages.push(localImage)
    if (mediaDownloaded === 1) {
      const primaryPreviewPath = `${getArchiveBasePath(download.targetPath)}.preview${extname(downloaded.path)}`
      await copyFile(downloaded.path, primaryPreviewPath)
      download.previewPath = primaryPreviewPath
      download.previewUrl = `/api/civitai/downloads/${encodeURIComponent(download.id)}/preview`
    }
  }

  download.previewImages = archivedImages
  download.previewPaths = archivedImages
    .filter((image) => image.path)
    .map((image, index) => ({
      ...image,
      url: `/api/civitai/downloads/${encodeURIComponent(download.id)}/previews/${index}`,
    }))
  download.sidecarPath = getArchiveSidecarPath(download.targetPath)

  const sidecar = {
    archiveVersion: civitaiArchiveVersion,
    source: 'civitai',
    ...modelPayload,
    previewImage: archivedImages[0] ?? null,
    previewImages: archivedImages,
    previewPaths: download.previewPaths,
    downloadedAt: download.finishedAt ?? Date.now(),
    archiveStatus: {
      state: mediaFailed ? 'partial' : 'ready',
      mediaTotal: images.length,
      mediaDownloaded,
      mediaFetched,
      mediaReused,
      mediaFailed,
      partial: Boolean(mediaFailed),
      truncated: false,
      updatedAt: new Date().toISOString(),
    },
  }
  await writeFile(download.sidecarPath, `${JSON.stringify(sidecar, null, 2)}\n`, 'utf8')
  return { changed: true, skipped: false, archiveStatus: sidecar.archiveStatus }
}

export async function inspectCivitaiArchiveForDownload(download, { fetchImpl = fetch } = {}) {
  if (!download?.targetPath || download.state !== 'complete') {
    return { changed: false, skipped: true, reason: 'not-complete' }
  }
  if (!(await statFile(download.targetPath))) {
    return { changed: false, skipped: true, reason: 'missing-model-file' }
  }

  const versionPayload = await fetchCivitaiArchiveVersionMetadata({
    versionId: download.versionId,
    hashes: download.hashes,
    fetchImpl,
  }).catch(() => null)
  const versionImages = normalizeArchiveImages(versionPayload?.images)
  const legacyImages = normalizeArchiveImages([
    ...(Array.isArray(download.previewImages) ? download.previewImages : []),
    download.previewImage,
  ])
  const existingSidecar = await readJsonFileIfExists(getArchiveSidecarPath(download.targetPath))
  const existingArchiveImages = normalizeArchiveImages(existingSidecar?.previewImages ?? existingSidecar?.previewPaths)
  const source = versionImages.length
    ? 'civitai-version'
    : legacyImages.length
      ? 'legacy-local-fallback'
      : 'none'

  return {
    changed: false,
    skipped: false,
    dryRun: true,
    id: download.id,
    fileName: download.fileName ?? '',
    modelId: normalizeNumber(download.modelId ?? versionPayload?.modelId ?? versionPayload?.model?.id),
    versionId: normalizeNumber(download.versionId ?? versionPayload?.id),
    source,
    versionPreviewCount: versionImages.length,
    legacyPreviewCount: legacyImages.length,
    legacyPreviewPathCount: Array.isArray(download.previewPaths) ? download.previewPaths.length : 0,
    existingArchivePreviewCount: existingArchiveImages.length,
    archivePreviewCount: versionImages.length || legacyImages.length,
    metadataStatus: versionPayload ? 'ok' : 'missing',
  }
}
