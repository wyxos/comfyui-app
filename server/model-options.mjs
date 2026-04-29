import { basename, extname } from 'node:path'
import { civitaiDownloads, supportedPreviewExtensions, supportedVideoExtensions } from './config.mjs'
import { normalizeOptionalBoolean, safeTrim } from './shared.mjs'
import { statFileIfExists } from './downloads/metadata.mjs'
import { downloadsLoaded, readDownloadsState } from './downloads/state.mjs'
import { getComfyCheckpointDir, getComfyLoraDir, readJsonFileIfExists, resolveModelPath } from './model-paths.mjs'
import { getModelCompatibilityMetadata } from './model-metadata.mjs'

export async function readModelSidecar(rootPath, modelName) {
  const resolvedModelPath = resolveModelPath(rootPath, modelName)
  if (!resolvedModelPath) {
    return null
  }

  const candidates = [
    `${resolvedModelPath}.civitai.info`,
    `${resolvedModelPath}.cm-info.json`,
    `${resolvedModelPath}.json`,
    `${resolvedModelPath.slice(0, -extname(resolvedModelPath).length)}.civitai.info`,
    `${resolvedModelPath.slice(0, -extname(resolvedModelPath).length)}.cm-info.json`,
    `${resolvedModelPath.slice(0, -extname(resolvedModelPath).length)}.json`,
  ]

  for (const candidate of candidates) {
    const payload = await readJsonFileIfExists(candidate)
    if (payload) {
      return {
        path: candidate,
        payload,
      }
    }
  }

  return null
}

export async function findModelPreviewPath(rootPath, modelName) {
  const resolvedModelPath = resolveModelPath(rootPath, modelName)
  if (!resolvedModelPath) {
    return null
  }

  const basePath = resolvedModelPath.slice(0, -extname(resolvedModelPath).length)
  for (const extension of supportedPreviewExtensions) {
    const candidate = `${basePath}.preview${extension}`
    if (await statFileIfExists(candidate)) {
      return candidate
    }
  }

  return null
}

export function buildModelDisplayName(modelName, sidecarPayload = null) {
  const civitaiName = safeTrim(sidecarPayload?.modelName)
  const versionName = safeTrim(sidecarPayload?.versionName)
  if (civitaiName && versionName) {
    return `${civitaiName} · ${versionName}`
  }

  return civitaiName || safeTrim(modelName)
}

export function modelPreviewMediaType(previewPath) {
  return supportedVideoExtensions.has(extname(previewPath).toLowerCase()) ? 'video' : 'image'
}

function normalizeFileKey(value) {
  const fileName = basename(safeTrim(value).replace(/\\/g, '/')).toLowerCase()
  return fileName && fileName !== '.' && fileName !== '..' ? fileName : ''
}

function normalizeModelTypeKey(value) {
  const modelType = safeTrim(value).toLowerCase()
  return modelType === 'lora' ? 'lora' : modelType
}

function downloadHasModelType(download, modelType) {
  return normalizeModelTypeKey(download?.modelType ?? download?.modelMetadata?.type ?? download?.model?.type) ===
    normalizeModelTypeKey(modelType)
}

function downloadModelNsfw(download) {
  return normalizeOptionalBoolean(download?.modelNsfw ?? download?.modelMetadata?.nsfw ?? download?.model?.nsfw)
}

async function readDownloadMetadataItems() {
  if (downloadsLoaded) {
    return [...civitaiDownloads.values()]
  }

  return readDownloadsState()
}

async function buildDownloadMetadataIndex(modelType) {
  const index = new Map()
  const downloads = await readDownloadMetadataItems()

  for (const download of downloads) {
    if (download?.state !== 'complete' || !downloadHasModelType(download, modelType)) {
      continue
    }

    const keys = [
      normalizeFileKey(download.fileName),
      normalizeFileKey(download.targetPath),
    ].filter(Boolean)
    const uniqueKeys = new Set(keys)

    for (const key of uniqueKeys) {
      const existing = index.get(key)
      if (!existing || (download.updatedAt ?? 0) > (existing.updatedAt ?? 0)) {
        index.set(key, download)
      }
    }
  }

  return index
}

function mergeDownloadMetadata(compatibility, download) {
  const modelNsfw = downloadModelNsfw(download)
  if (modelNsfw === null) {
    return {
      compatibility,
      modelNsfw: compatibility.modelNsfw ?? null,
    }
  }

  return {
    compatibility: {
      ...compatibility,
      modelNsfw,
    },
    modelNsfw,
  }
}

export async function enrichCheckpointOptions(checkpoints) {
  let rootPath = null
  try {
    rootPath = await getComfyCheckpointDir()
  } catch {}

  if (!rootPath) {
    return checkpoints
  }

  const downloadMetadata = await buildDownloadMetadataIndex('Checkpoint')

  return Promise.all(checkpoints.map(async (checkpoint) => {
    const sidecar = await readModelSidecar(rootPath, checkpoint.name)
    const previewPath = await findModelPreviewPath(rootPath, checkpoint.name)
    const baseCompatibility = await getModelCompatibilityMetadata({
      rootPath,
      modelName: checkpoint.name,
      modelType: 'Checkpoint',
      sidecar,
    })
    const { compatibility, modelNsfw } = mergeDownloadMetadata(
      baseCompatibility,
      downloadMetadata.get(normalizeFileKey(checkpoint.name)),
    )
    return {
      ...checkpoint,
      displayName: buildModelDisplayName(checkpoint.name, sidecar?.payload),
      downloaded: Boolean(sidecar || previewPath),
      previewUrl: previewPath ? `/api/model-preview?type=checkpoint&name=${encodeURIComponent(checkpoint.name)}` : null,
      previewMediaType: previewPath ? modelPreviewMediaType(previewPath) : null,
      modelNsfw,
      compatibility,
      civitai: sidecar?.payload ?? null,
    }
  }))
}

export async function enrichLoraOptions(loras) {
  let rootPath = null
  try {
    rootPath = await getComfyLoraDir()
  } catch {}

  if (!rootPath) {
    return loras
  }

  const downloadMetadata = await buildDownloadMetadataIndex('LORA')

  return Promise.all(loras.map(async (lora) => {
    const sidecar = await readModelSidecar(rootPath, lora.name)
    const previewPath = await findModelPreviewPath(rootPath, lora.name)
    const baseCompatibility = await getModelCompatibilityMetadata({
      rootPath,
      modelName: lora.name,
      modelType: 'LORA',
      sidecar,
    })
    const { compatibility, modelNsfw } = mergeDownloadMetadata(
      baseCompatibility,
      downloadMetadata.get(normalizeFileKey(lora.name)),
    )
    return {
      ...lora,
      displayName: buildModelDisplayName(lora.name, sidecar?.payload),
      triggerWords: lora.triggerWords?.length ? lora.triggerWords : compatibility.trainedWords,
      downloaded: Boolean(sidecar || previewPath),
      previewUrl: previewPath ? `/api/model-preview?type=lora&name=${encodeURIComponent(lora.name)}` : null,
      previewMediaType: previewPath ? modelPreviewMediaType(previewPath) : null,
      modelNsfw,
      compatibility,
      civitai: sidecar?.payload ?? null,
    }
  }))
}
