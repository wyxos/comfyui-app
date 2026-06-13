import { civitaiDownloads } from '../config.mjs'
import { safeTrim } from '../shared.mjs'
import { downloadsLoaded, ensureDownloadsLoaded, scheduleDownloadsPersist } from './state.mjs'
import { buildDownloadId, normalizeDownloadFile, normalizeDownloadModelMetadata, normalizePreviewImage, normalizePreviewImages, refreshCompletedDownloadPreviews, resolveCivitaiDownloadTargetDir, safeUnlink, sanitizeModelFilename, statFileIfExists } from './metadata.mjs'
import { downloadCivitaiFile, verifyCivitaiDownloadHash } from './transfer.mjs'
import { parseInteger } from '../civitai-query.mjs'
import { resolveInsideRoot } from '../model-paths.mjs'
import { civitaiEarlyAccessStatus, fetchCivitaiVersion, isCivitaiEarlyAccessLocked } from './civitai-version.mjs'

let downloadQueueActive = false

export function resetDownloadQueueRuntimeState() {
  downloadQueueActive = false
}

function shouldProbeEarlyAccessHandoff(error) {
  const statusCode = Number.parseInt(error?.statusCode, 10)
  if (statusCode !== 401 && statusCode !== 403) {
    return false
  }

  const message = safeTrim(error?.message).toLowerCase()
  return (
    message.includes('requires you to be logged in') ||
    message.includes('creator of this asset') ||
    message.includes('early access')
  )
}

function versionFileForDownload(download, version) {
  const files = Array.isArray(version?.files) ? version.files.map((file) => normalizeDownloadFile(file)) : []
  const downloadFileId = download?.fileId === null || download?.fileId === undefined ? '' : String(download.fileId)
  const downloadFileName = safeTrim(download?.fileName)

  return files.find((file) => downloadFileId && String(file.id) === downloadFileId)
    ?? files.find((file) => downloadFileName && file.name === downloadFileName)
    ?? null
}

function watchedPayloadForDownload(download, version) {
  const model = version?.model && typeof version.model === 'object' ? version.model : null
  const versionFile = versionFileForDownload(download, version)
  const fileName = sanitizeModelFilename(download.fileName || versionFile?.name)

  return {
    modelId: parseInteger(model?.id) ?? download.modelId,
    modelName: safeTrim(model?.name) || download.modelName,
    modelType: safeTrim(model?.type) || download.modelType,
    modelNsfw: model?.nsfw ?? download.modelNsfw ?? null,
    modelMetadata: model ?? download.modelMetadata,
    versionId: parseInteger(version?.id) ?? download.versionId,
    versionName: safeTrim(version?.name) || download.versionName,
    baseModel: safeTrim(version?.baseModel) || download.baseModel,
    file: {
      ...(versionFile ?? {}),
      id: download.fileId ?? versionFile?.id,
      name: fileName,
      type: download.fileType || versionFile?.type || 'Model',
      primary: versionFile?.primary ?? true,
      sizeKb: download.fileSizeKb ?? versionFile?.sizeKb ?? null,
      downloadUrl: download.downloadUrl ?? versionFile?.downloadUrl,
      hashes: download.hashes ?? versionFile?.hashes ?? {},
    },
    trainedWords: Array.isArray(version?.trainedWords) ? version.trainedWords.filter((word) => typeof word === 'string') : download.trainedWords,
    previewImage: normalizePreviewImage(version?.images?.[0]) ?? download.previewImage,
    previewImages: normalizePreviewImages([
      ...(Array.isArray(version?.images) ? version.images : []),
      ...(Array.isArray(download.previewImages) ? download.previewImages : []),
      download.previewImage,
    ]),
  }
}

async function moveEarlyAccessDownloadToWatch(download, error) {
  if (!shouldProbeEarlyAccessHandoff(error) || !download?.versionId) {
    return false
  }

  try {
    const version = await fetchCivitaiVersion(download.versionId)
    if (!isCivitaiEarlyAccessLocked(version)) {
      return false
    }

    const { addWatchedCivitaiDownload } = await import('./watched.mjs')
    await addWatchedCivitaiDownload(watchedPayloadForDownload(download, version), {
      lastCheckedAt: Date.now(),
      lastStatus: civitaiEarlyAccessStatus(version),
    })
    civitaiDownloads.delete(download.id)
    return true
  } catch {
    return false
  }
}

export async function processDownloadQueue() {
  if (downloadQueueActive || !downloadsLoaded) {
    return
  }

  const download = [...civitaiDownloads.values()]
    .sort((left, right) => (left.createdAt ?? 0) - (right.createdAt ?? 0))
    .find((item) => item.state === 'queued')

  if (!download) {
    return
  }

  downloadQueueActive = true

  try {
    await downloadCivitaiFile(download)
  } catch (error) {
    if (download.state === 'paused' || download.state === 'cancelled') {
      return
    }

    if (error?.name === 'AbortError') {
      download.state = 'paused'
      download.updatedAt = Date.now()
      return
    }

    if (await moveEarlyAccessDownloadToWatch(download, error)) {
      return
    }

    download.state = 'error'
    download.error = error instanceof Error ? error.message : 'Download failed.'
    download.updatedAt = Date.now()
  } finally {
    download.abortController = null
    downloadQueueActive = false
    scheduleDownloadsPersist(true)
    void processDownloadQueue()
  }
}

export async function enqueueCivitaiDownload(body) {
  await ensureDownloadsLoaded()

  const modelId = parseInteger(body?.modelId)
  const versionId = parseInteger(body?.versionId)
  const file = normalizeDownloadFile(body?.file)
  const fileName = sanitizeModelFilename(file.name)

  if (!modelId || !versionId || !fileName || !file.downloadUrl) {
    const error = new Error('A model id, version id, primary file name, and download URL are required.')
    error.code = 'invalid-download'
    throw error
  }

  if (file.type && file.type !== 'Model') {
    const error = new Error('Only primary model files can be downloaded.')
    error.code = 'unsupported-file-type'
    throw error
  }

  const targetDir = await resolveCivitaiDownloadTargetDir(body?.modelType)
  const targetPath = resolveInsideRoot(targetDir, fileName)
  if (!targetPath) {
    const error = new Error('Download target is invalid.')
    error.code = 'invalid-download-target'
    throw error
  }

  const id = buildDownloadId(modelId, versionId, file)
  const modelMetadata = normalizeDownloadModelMetadata(body?.modelMetadata ?? body?.model, {
    modelId,
    modelName: body?.modelName,
    modelType: body?.modelType,
    modelNsfw: body?.modelNsfw ?? body?.nsfw,
    creator: body?.creator,
    stats: body?.stats,
    tags: body?.tags,
  })
  const existingDownload = civitaiDownloads.get(id)
  if (existingDownload) {
    const forceRedownload = body?.force === true || body?.redownload === true
    existingDownload.dismissedAt = null
    existingDownload.previewImage = normalizePreviewImage(body?.previewImage) ?? existingDownload.previewImage ?? null
    existingDownload.previewImages = normalizePreviewImages([
      ...(Array.isArray(body?.previewImages) ? body.previewImages : []),
      existingDownload.previewImage,
      ...(Array.isArray(existingDownload.previewImages) ? existingDownload.previewImages : []),
    ])
    existingDownload.trainedWords = Array.isArray(body?.trainedWords)
      ? body.trainedWords.filter((word) => typeof word === 'string')
      : existingDownload.trainedWords ?? []
    existingDownload.modelMetadata = modelMetadata
    existingDownload.modelNsfw = modelMetadata.nsfw
    existingDownload.updatedAt = Date.now()

    if (forceRedownload) {
      existingDownload.state = 'queued'
      existingDownload.error = null
      existingDownload.bytesDownloaded = 0
      existingDownload.progressPercent = 0
      existingDownload.startedAt = null
      existingDownload.finishedAt = null
      await safeUnlink(existingDownload.partialPath)
      void processDownloadQueue()
    } else if (existingDownload.state === 'error' || existingDownload.state === 'cancelled') {
      existingDownload.state = 'queued'
      existingDownload.error = null
      existingDownload.updatedAt = Date.now()
      void processDownloadQueue()
    } else if (existingDownload.state === 'complete') {
      void refreshCompletedDownloadPreviews(existingDownload)
    }

    scheduleDownloadsPersist(true)
    return existingDownload
  }

  const existingTarget = await statFileIfExists(targetPath)
  const now = Date.now()
  const download = {
    id,
    state: existingTarget ? 'complete' : 'queued',
    modelId,
    modelName: safeTrim(body?.modelName) || `Model ${modelId}`,
    modelType: safeTrim(body?.modelType),
    modelNsfw: modelMetadata.nsfw,
    modelMetadata,
    versionId,
    versionName: safeTrim(body?.versionName) || `Version ${versionId}`,
    baseModel: safeTrim(body?.baseModel),
    fileId: file.id,
    fileName,
    fileType: file.type || 'Model',
    fileSizeKb: file.sizeKb,
    downloadUrl: file.downloadUrl,
    hashes: file.hashes,
    targetPath,
    partialPath: `${targetPath}.part`,
    sidecarPath: `${targetPath}.civitai.info`,
    previewImage: normalizePreviewImage(body?.previewImage),
    previewImages: normalizePreviewImages(body?.previewImages),
    previewPaths: [],
    previewPath: null,
    previewUrl: null,
    trainedWords: Array.isArray(body?.trainedWords) ? body.trainedWords.filter((word) => typeof word === 'string') : [],
    bytesDownloaded: existingTarget?.size ?? 0,
    totalBytes: existingTarget?.size ?? (file.sizeKb ? Math.round(file.sizeKb * 1024) : 0),
    progressPercent: existingTarget ? 100 : 0,
    createdAt: now,
    updatedAt: now,
    startedAt: existingTarget ? now : null,
    finishedAt: existingTarget ? now : null,
    dismissedAt: null,
    error: null,
    abortController: null,
  }

  if (existingTarget) {
    try {
      await verifyCivitaiDownloadHash(download)
    } catch (error) {
      download.state = 'error'
      download.error = error instanceof Error ? error.message : 'Downloaded model file hash did not match Civitai metadata.'
    }
  }

  civitaiDownloads.set(download.id, download)
  scheduleDownloadsPersist(true)
  if (existingTarget) {
    void refreshCompletedDownloadPreviews(download)
  }
  void processDownloadQueue()
  return download
}
