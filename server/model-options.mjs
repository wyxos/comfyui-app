import { basename, extname } from 'node:path'
import { civitaiDownloads, supportedPreviewExtensions, supportedVideoExtensions } from './config.mjs'
import { imageListNsfwLevelDetectedValue, safeTrim } from './shared.mjs'
import { statFileIfExists } from './downloads/metadata.mjs'
import { downloadsLoaded, readDownloadsState } from './downloads/state.mjs'
import { getComfyCheckpointDir, getComfyControlNetDir, getComfyLoraDir, resolveModelPath } from './model-paths.mjs'
import { readJsonFileIfExists } from './model-trigger-words.mjs'
import { getModelCompatibilityMetadata, normalizeModelCompatibilityMetadata } from './model-metadata.mjs'
import { detectCheckpointFamily } from './checkpoint-family.mjs'
import { serializeModelOptionPreviewPaths } from './model-option-preview-paths.mjs'

export async function readModelSidecar(rootPath, modelName) {
  const resolvedModelPath = resolveModelPath(rootPath, modelName)
  if (!resolvedModelPath) {
    return null
  }

  const basePath = resolvedModelPath.slice(0, -extname(resolvedModelPath).length)
  const providerCandidates = [
    `${resolvedModelPath}.civitai.info`,
    `${resolvedModelPath}.cm-info.json`,
    `${resolvedModelPath}.json`,
    `${basePath}.civitai.info`,
    `${basePath}.cm-info.json`,
    `${basePath}.json`,
  ]
  const manualCandidates = [
    `${resolvedModelPath}.companion.info`,
    `${basePath}.companion.info`,
  ]
  const payloads = []

  for (const candidate of [...providerCandidates, ...manualCandidates]) {
    const payload = await readJsonFileIfExists(candidate)
    if (payload) {
      payloads.push({ path: candidate, payload })
    }
  }

  if (!payloads.length) {
    return null
  }

  return {
    path: payloads[payloads.length - 1].path,
    payload: payloads.reduce((merged, item) => ({
      ...merged,
      ...item.payload,
      model: {
        ...(merged.model ?? {}),
        ...(item.payload.model ?? {}),
      },
      modelMetadata: {
        ...(merged.modelMetadata ?? {}),
        ...(item.payload.modelMetadata ?? {}),
      },
      metadata: {
        ...(merged.metadata ?? {}),
        ...(item.payload.metadata ?? {}),
      },
    }), {}),
  }
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
  return imageListNsfwLevelDetectedValue([
    download?.previewImage,
    ...(Array.isArray(download?.previewImages) ? download.previewImages : []),
    ...(Array.isArray(download?.previewPaths) ? download.previewPaths : []),
  ].filter(Boolean))
}

function mergeStringList(primary = [], fallback = []) {
  const seen = new Set()
  const merged = []

  for (const value of [...primary, ...fallback]) {
    const text = safeTrim(value)
    const key = text.toLowerCase()
    if (!text || seen.has(key)) {
      continue
    }

    seen.add(key)
    merged.push(text)
  }

  return merged
}

function mergeCompatibilityMetadata(primary, fallback) {
  const baseModel = safeTrim(primary?.baseModel) || safeTrim(fallback?.baseModel)
  const baseModelKey = safeTrim(primary?.baseModelKey) || safeTrim(fallback?.baseModelKey)
  const compatibleBaseModels = mergeStringList(primary?.compatibleBaseModels, fallback?.compatibleBaseModels)
  const compatibleBaseModelKeys = mergeStringList(primary?.compatibleBaseModelKeys, fallback?.compatibleBaseModelKeys)
  const hasFallbackBasis = Boolean(
    fallback?.baseModelKey ||
      fallback?.compatibleBaseModelKeys?.length ||
      fallback?.checkpointNames?.length ||
      Object.keys(fallback?.checkpointHashes ?? {}).length,
  )
  const hasPrimaryBasis = Boolean(
    primary?.baseModelKey ||
      primary?.compatibleBaseModelKeys?.length ||
      primary?.checkpointNames?.length ||
      Object.keys(primary?.checkpointHashes ?? {}).length,
  )

  return {
    ...primary,
    modelId: primary?.modelId ?? fallback?.modelId ?? null,
    versionId: primary?.versionId ?? fallback?.versionId ?? null,
    modelName: safeTrim(primary?.modelName) || safeTrim(fallback?.modelName),
    versionName: safeTrim(primary?.versionName) || safeTrim(fallback?.versionName),
    modelType: safeTrim(primary?.modelType) || safeTrim(fallback?.modelType) || null,
    modelNsfw: primary?.modelNsfwOverride ?? primary?.modelNsfw ?? fallback?.modelNsfwOverride ?? fallback?.modelNsfw ?? null,
    modelNsfwOverride: primary?.modelNsfwOverride ?? fallback?.modelNsfwOverride ?? null,
    imageSafetyOverrides: {
      ...(fallback?.imageSafetyOverrides ?? {}),
      ...(primary?.imageSafetyOverrides ?? {}),
    },
    baseModel,
    baseModelKey,
    trainedWords: mergeStringList(primary?.trainedWords, fallback?.trainedWords),
    hashes: {
      ...(fallback?.hashes ?? {}),
      ...(primary?.hashes ?? {}),
    },
    checkpointNames: mergeStringList(primary?.checkpointNames, fallback?.checkpointNames),
    checkpointHashes: {
      ...(fallback?.checkpointHashes ?? {}),
      ...(primary?.checkpointHashes ?? {}),
    },
    compatibleBaseModels,
    compatibleBaseModelKeys,
    controlType: safeTrim(primary?.controlType) || safeTrim(fallback?.controlType),
    loaderType: safeTrim(primary?.loaderType) || safeTrim(fallback?.loaderType),
    source: hasPrimaryBasis || !hasFallbackBasis ? primary?.source : fallback?.source,
    status: !hasPrimaryBasis && hasFallbackBasis
      ? fallback?.status
      : primary?.status === 'missing' && fallback?.status === 'ready'
        ? 'ready'
        : primary?.status,
  }
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
  const downloadCompatibility = download
    ? normalizeModelCompatibilityMetadata(download, {
        modelType: compatibility.modelType ?? download.modelType,
        source: 'download',
        status: 'ready',
      })
    : null
  const mergedCompatibility = downloadCompatibility
    ? mergeCompatibilityMetadata(compatibility, downloadCompatibility)
    : compatibility
  const modelNsfw = downloadModelNsfw(download)
  if (mergedCompatibility.modelNsfwOverride !== null && mergedCompatibility.modelNsfwOverride !== undefined) {
    return {
      compatibility: {
        ...mergedCompatibility,
        modelNsfw: mergedCompatibility.modelNsfwOverride,
      },
      modelNsfw: mergedCompatibility.modelNsfwOverride,
    }
  }

  if (modelNsfw === null) {
    return {
      compatibility: mergedCompatibility,
      modelNsfw: mergedCompatibility.modelNsfw ?? null,
    }
  }

  return {
    compatibility: {
      ...mergedCompatibility,
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
    const download = downloadMetadata.get(normalizeFileKey(checkpoint.name))
    const baseCompatibility = await getModelCompatibilityMetadata({
      rootPath,
      modelName: checkpoint.name,
      modelType: 'Checkpoint',
      sidecar,
    })
    const { compatibility, modelNsfw } = mergeDownloadMetadata(
      baseCompatibility,
      download,
    )
    return {
      ...checkpoint,
      family: detectCheckpointFamily(checkpoint.name, compatibility),
      displayName: buildModelDisplayName(checkpoint.name, sidecar?.payload),
      downloaded: Boolean(sidecar || previewPath),
      previewUrl: previewPath ? `/api/model-preview?type=checkpoint&name=${encodeURIComponent(checkpoint.name)}` : null,
      previewMediaType: previewPath ? modelPreviewMediaType(previewPath) : null,
      previewPaths: serializeModelOptionPreviewPaths({
        download,
        sidecarPayload: sidecar?.payload,
        type: 'checkpoint',
        modelName: checkpoint.name,
      }),
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
    const download = downloadMetadata.get(normalizeFileKey(lora.name))
    const baseCompatibility = await getModelCompatibilityMetadata({
      rootPath,
      modelName: lora.name,
      modelType: 'LORA',
      sidecar,
    })
    const { compatibility, modelNsfw } = mergeDownloadMetadata(
      baseCompatibility,
      download,
    )
    return {
      ...lora,
      displayName: buildModelDisplayName(lora.name, sidecar?.payload),
      triggerWords: lora.triggerWords?.length ? lora.triggerWords : compatibility.trainedWords,
      downloaded: Boolean(sidecar || previewPath),
      previewUrl: previewPath ? `/api/model-preview?type=lora&name=${encodeURIComponent(lora.name)}` : null,
      previewMediaType: previewPath ? modelPreviewMediaType(previewPath) : null,
      previewPaths: serializeModelOptionPreviewPaths({
        download,
        sidecarPayload: sidecar?.payload,
        type: 'lora',
        modelName: lora.name,
      }),
      modelNsfw,
      compatibility,
      civitai: sidecar?.payload ?? null,
    }
  }))
}

function inferControlNetCompatibilityPayload(controlNetName) {
  const name = safeTrim(controlNetName)
  const normalized = name.toLowerCase()
  const controlType = inferControlTypeFromName(normalized)
  const payload = {
    source: 'inferred',
    modelName: name,
    modelType: 'ControlNet',
    status: 'ready',
    compatibleBaseModels: [],
    controlType,
    loaderType: 'controlnet',
  }

  if (normalized.includes('anima') || normalized.includes('lllite')) {
    return {
      ...payload,
      baseModel: 'Anima',
      compatibleBaseModels: ['Anima'],
      controlType,
      loaderType: 'anima-lllite',
    }
  }

  if (normalized.includes('pony')) {
    return {
      ...payload,
      baseModel: 'Pony',
      compatibleBaseModels: ['Pony'],
      controlType,
    }
  }

  if (normalized.includes('illustrious')) {
    return {
      ...payload,
      baseModel: 'Illustrious',
      compatibleBaseModels: ['Illustrious'],
      controlType,
    }
  }

  if (normalized.includes('sdxl') || normalized.includes('xl') || normalized.includes('mistoline')) {
    return {
      ...payload,
      baseModel: 'SDXL',
      compatibleBaseModels: ['SDXL'],
      controlType,
    }
  }

  return null
}

function inferControlTypeFromName(normalizedName) {
  if (normalizedName.includes('openpose') || normalizedName.includes('pose')) {
    return 'pose'
  }

  if (normalizedName.includes('mistoline') || normalizedName.includes('lineart') || normalizedName.includes('line')) {
    return 'lineart'
  }

  if (normalizedName.includes('depth')) {
    return 'depth'
  }

  if (normalizedName.includes('canny')) {
    return 'canny'
  }

  if (normalizedName.includes('tile')) {
    return 'tile'
  }

  return ''
}

export async function enrichControlNetOptions(controlNets) {
  let rootPath = null
  try {
    rootPath = await getComfyControlNetDir()
  } catch {}

  if (!rootPath) {
    return controlNets
  }

  return Promise.all(controlNets.map(async (controlNet) => {
    const sidecar = await readModelSidecar(rootPath, controlNet.name)
    const previewPath = await findModelPreviewPath(rootPath, controlNet.name)
    const inferredPayload = inferControlNetCompatibilityPayload(controlNet.name)
    const metadataSidecar = sidecar ?? (inferredPayload ? { payload: inferredPayload } : null)
    const baseCompatibility = await getModelCompatibilityMetadata({
      rootPath,
      modelName: controlNet.name,
      modelType: 'ControlNet',
      sidecar: metadataSidecar,
    })
    const inferredCompatibility = normalizeModelCompatibilityMetadata(inferredPayload, {
      modelName: controlNet.name,
      modelType: 'ControlNet',
      source: 'inferred',
      status: inferredPayload ? 'ready' : 'missing',
    })
    const compatibility = mergeCompatibilityMetadata(baseCompatibility, inferredCompatibility)

    return {
      ...controlNet,
      displayName: buildModelDisplayName(controlNet.name, sidecar?.payload),
      downloaded: Boolean(sidecar || previewPath),
      previewUrl: previewPath ? `/api/model-preview?type=controlnet&name=${encodeURIComponent(controlNet.name)}` : null,
      previewMediaType: previewPath ? modelPreviewMediaType(previewPath) : null,
      previewPaths: serializeModelOptionPreviewPaths({
        sidecarPayload: sidecar?.payload,
        type: 'controlnet',
        modelName: controlNet.name,
      }),
      compatibility,
      controlType: compatibility.controlType,
      loaderType: compatibility.loaderType,
      civitai: sidecar?.payload ?? null,
    }
  }))
}
