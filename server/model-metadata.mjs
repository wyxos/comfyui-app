import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { configDir } from './config.mjs'
import {
  normalizeBaseModelList,
  normalizeHashes,
  normalizeImageSafetyOverrides,
  normalizeStringList,
} from './model-metadata-normalizers.mjs'
import { resolveModelPath } from './model-paths.mjs'
import { readJsonFileIfExists } from './model-trigger-words.mjs'
import {
  imageListNsfwLevelDetectedValue,
  normalizeNsfwLevel,
  normalizeOptionalBoolean,
  normalizePlainObject,
  safeTrim,
} from './shared.mjs'

const pendingEnrichment = new Set()

function normalizeInteger(value) {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return value
  }

  const parsed = Number.parseInt(safeTrim(value), 10)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

export function normalizeBaseModelKey(value) {
  const normalized = safeTrim(value)
    .toLowerCase()
    .replace(/\b(stable diffusion|sd)\b/g, 'sd')
    .replace(/[^a-z0-9]+/g, '')

  if (!normalized) {
    return ''
  }

  if (normalized === 'sdxl10' || normalized === 'sdxlbase10') {
    return 'sdxl'
  }

  return normalized
}

const sdxlArchitectureBaseModelKeys = new Set(['sdxl', 'pony', 'illustrious'])

export function expandBaseModelCompatibilityKeys(...values) {
  const keys = new Set()
  for (const value of values.flat()) {
    const key = normalizeBaseModelKey(value)
    if (!key) {
      continue
    }
    keys.add(key)
    if (sdxlArchitectureBaseModelKeys.has(key)) {
      keys.add('sdxl')
    }
  }
  return keys
}

function collectFileHashes(payload, version) {
  const files = [
    ...(Array.isArray(payload?.files) ? payload.files : []),
    ...(Array.isArray(version?.files) ? version.files : []),
    ...(Array.isArray(payload?.modelVersion?.files) ? payload.modelVersion.files : []),
  ]
  return normalizeHashes(
    payload?.hashes,
    payload?.file?.hashes,
    payload?.modelVersion?.file?.hashes,
    version?.file?.hashes,
    ...files.map((file) => file?.hashes),
  )
}

function normalizeModelType(value, fallback) {
  const modelType = safeTrim(value || fallback)
  if (!modelType) {
    return safeTrim(fallback) || null
  }

  return modelType.toLowerCase() === 'lora' ? 'LORA' : modelType
}

function getVersionCandidates(payload) {
  if (payload?.modelVersion && typeof payload.modelVersion === 'object') {
    return [payload.modelVersion]
  }

  if (payload?.version && typeof payload.version === 'object') {
    return [payload.version]
  }

  if (Array.isArray(payload?.modelVersions)) {
    return payload.modelVersions.filter((version) => version && typeof version === 'object')
  }

  if (Array.isArray(payload?.model?.modelVersions)) {
    return payload.model.modelVersions.filter((version) => version && typeof version === 'object')
  }

  return []
}

function getVersionPayload(payload) {
  const versions = getVersionCandidates(payload)
  if (!versions.length) {
    return payload
  }

  const expectedVersionId = normalizeInteger(payload.versionId ?? payload.modelVersionId)
  return versions.find((version) => normalizeInteger(version.id) === expectedVersionId) ?? versions[0]
}

export function normalizeModelCompatibilityMetadata(payload, options = {}) {
  const source = options.source ?? safeTrim(payload?.source) ?? 'unknown'
  if (!payload || typeof payload !== 'object') {
    return {
      modelId: null,
      versionId: null,
      modelName: '',
      versionName: '',
      modelType: normalizeModelType(null, options.modelType),
      modelNsfw: null,
      modelNsfwOverride: null,
      imageSafetyOverrides: {},
      baseModel: '',
      baseModelKey: '',
      trainedWords: [],
      hashes: {},
      checkpointNames: [],
      checkpointHashes: {},
      compatibleBaseModels: [],
      compatibleBaseModelKeys: [],
      controlType: '',
      loaderType: '',
      source,
      status: options.status ?? 'missing',
    }
  }

  const version = getVersionPayload(payload)
  const model = payload.model && typeof payload.model === 'object' ? payload.model : payload
  const currentSafetyImages = [
    ...(Array.isArray(payload.images) ? payload.images : []),
    ...(Array.isArray(payload.previewImages) ? payload.previewImages : []),
    ...(
      Array.isArray(payload.modelVersions)
        ? payload.modelVersions.flatMap((candidate) => Array.isArray(candidate?.images) ? candidate.images : [])
        : []
    ),
    ...(
      Array.isArray(model.modelVersions)
        ? model.modelVersions.flatMap((candidate) => Array.isArray(candidate?.images) ? candidate.images : [])
        : []
    ),
  ]
  const baseModel = safeTrim(payload.baseModel ?? version.baseModel ?? payload.metadata?.baseModel)
  const modelNsfw = imageListNsfwLevelDetectedValue(currentSafetyImages)
  const modelNsfwOverride = normalizeOptionalBoolean(payload.modelNsfwOverride ?? payload.localModelNsfw ?? payload.metadata?.modelNsfwOverride) ?? (payload.source === 'manual' && modelNsfw !== null ? modelNsfw : null)
  const imageSafetyOverrides = normalizeImageSafetyOverrides(
    payload.imageSafetyOverrides ?? payload.metadata?.imageSafetyOverrides,
  )
  const trainedWords = normalizeStringList([
    ...normalizeStringList(payload.trainedWords),
    ...normalizeStringList(version.trainedWords),
    ...normalizeStringList(payload.triggerWords),
  ])
  const hashes = collectFileHashes(payload, version)
  const checkpointHashes = normalizeHashes(payload.checkpointHashes, payload.compatibleCheckpointHashes)
  const compatibleBaseModels = normalizeBaseModelList(
    payload.compatibleBaseModels,
    payload.compatibleBases,
    payload.supportedBaseModels,
    payload.supportedBases,
    payload.metadata?.compatibleBaseModels,
  )
  const compatibleBaseModelKeys = normalizeStringList([
    ...compatibleBaseModels.map(normalizeBaseModelKey),
    ...normalizeStringList(payload.compatibleBaseModelKeys),
    ...normalizeStringList(payload.supportedBaseModelKeys),
  ]).filter(Boolean)

  return {
    modelId: normalizeInteger(payload.modelId ?? model.id ?? version.modelId),
    versionId: normalizeInteger(payload.versionId ?? payload.modelVersionId ?? version.id),
    modelName: safeTrim(payload.modelName ?? model.name ?? options.modelName),
    versionName: safeTrim(payload.versionName ?? version.name),
    modelType: normalizeModelType(payload.modelType ?? model.type ?? payload.type, options.modelType),
    modelNsfw,
    modelNsfwOverride,
    imageSafetyOverrides,
    baseModel,
    baseModelKey: normalizeBaseModelKey(baseModel),
    trainedWords,
    hashes,
    checkpointNames: normalizeStringList(payload.checkpointNames ?? payload.compatibleCheckpoints),
    checkpointHashes,
    compatibleBaseModels,
    compatibleBaseModelKeys,
    controlType: safeTrim(payload.controlType ?? payload.control_type ?? payload.metadata?.controlType),
    loaderType: safeTrim(payload.loaderType ?? payload.loader_type ?? payload.metadata?.loaderType),
    source,
    status: options.status ?? 'ready',
  }
}

function hasCompatibilityBasis(metadata) {
  return Boolean(
      metadata?.baseModelKey ||
      metadata?.compatibleBaseModelKeys?.length ||
      metadata?.checkpointNames?.length ||
      Object.keys(metadata?.checkpointHashes ?? {}).length,
  )
}

function metadataCachePath(modelType, modelName) {
  const encodedName = Buffer.from(`${modelType}:${modelName}`).toString('base64url')
  return join(configDir, 'model-metadata-cache', `${encodedName}.civitai.info`)
}

function civitaiVersionToSidecar(payload, fallback = {}) {
  const primaryFile = Array.isArray(payload?.files)
    ? payload.files.find((file) => file?.primary) ?? payload.files[0]
    : null
  const previewImages = normalizeCivitaiPreviewImages(payload?.images)
  const modelNsfw = imageListNsfwLevelDetectedValue(previewImages)
  const modelId = payload?.modelId ?? payload?.model?.id ?? fallback.modelId
  const modelName = payload?.model?.name ?? fallback.modelName
  const modelType = payload?.model?.type ?? fallback.modelType
  const modelSafetyMetadata = { id: modelId, name: modelName, type: modelType, nsfw: modelNsfw, safetySchemaVersion: 2 }

  return {
    source: 'civitai',
    modelId,
    modelName,
    modelType,
    modelNsfw,
    model: modelSafetyMetadata,
    modelMetadata: modelSafetyMetadata,
    versionId: payload?.id ?? fallback.versionId,
    versionName: payload?.name ?? fallback.versionName,
    baseModel: payload?.baseModel ?? fallback.baseModel,
    trainedWords: payload?.trainedWords ?? fallback.trainedWords ?? [],
    fileId: primaryFile?.id ?? fallback.fileId,
    fileName: primaryFile?.name ?? fallback.fileName,
    hashes: primaryFile?.hashes ?? fallback.hashes ?? {},
    files: payload?.files ?? [],
    previewImage: previewImages[0] ?? null,
    previewImages,
  }
}

function normalizeCivitaiPreviewImages(images) {
  return (Array.isArray(images) ? images : [])
    .filter((image) => safeTrim(image?.url))
    .map((image) => {
      const item = normalizePlainObject(image)
      return {
        id: item.id ?? null,
        url: safeTrim(item.url),
        width: typeof item.width === 'number' ? item.width : null,
        height: typeof item.height === 'number' ? item.height : null,
        hash: safeTrim(item.hash),
        type: safeTrim(item.type),
        nsfwLevel: normalizeNsfwLevel(item.nsfwLevel),
      }
    })
}

export async function fetchCivitaiVersionMetadata({ versionId, hashes = {}, fetchImpl = fetch } = {}) {
  if (versionId) {
    const response = await fetchImpl(`https://civitai.com/api/v1/model-versions/${versionId}`)
    if (response.ok) {
      return civitaiVersionToSidecar(await response.json())
    }
  }

  for (const hash of Object.values(hashes)) {
    const normalizedHash = safeTrim(hash)
    if (!normalizedHash) {
      continue
    }

    const response = await fetchImpl(
      `https://civitai.com/api/v1/model-versions/by-hash/${encodeURIComponent(normalizedHash)}`,
    )
    if (response.ok) {
      return civitaiVersionToSidecar(await response.json(), { hashes })
    }
  }

  return null
}

async function hashFileSha256(filePath) {
  return new Promise((resolveHash, rejectHash) => {
    const hash = createHash('sha256')
    const stream = createReadStream(filePath)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('error', rejectHash)
    stream.on('end', () => resolveHash(hash.digest('hex').toUpperCase()))
  })
}

async function writeMetadataPayload(modelPath, cachePath, payload) {
  const sidecarPath = `${modelPath}.civitai.info`
  try {
    await writeFile(sidecarPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
    return sidecarPath
  } catch {
    await mkdir(dirname(cachePath), { recursive: true })
    await writeFile(cachePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
    return cachePath
  }
}

export async function writeManualModelCompatibilityMetadata({ rootPath, modelName, modelType, payload }) {
  const modelPath = resolveModelPath(rootPath, modelName)
  if (!modelPath) {
    const error = new Error('Model name is invalid.')
    error.code = 'invalid-model-name'
    throw error
  }

  const sidecarPath = `${modelPath}.companion.info`
  const existingPayload = await readJsonFileIfExists(sidecarPath) ?? {}
  const normalizedPayload = payload && typeof payload === 'object' ? payload : {}
  const normalized = normalizeModelCompatibilityMetadata(
    {
      ...existingPayload,
      ...normalizedPayload,
      imageSafetyOverrides: {
        ...normalizeImageSafetyOverrides(existingPayload.imageSafetyOverrides),
        ...normalizeImageSafetyOverrides(normalizedPayload.imageSafetyOverrides ?? normalizedPayload.metadata?.imageSafetyOverrides),
      },
      modelName,
      modelType,
      source: 'manual',
    },
    {
      modelName,
      modelType,
      source: 'manual',
      status: 'ready',
    },
  )
  await writeFile(sidecarPath, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8')
  return {
    path: sidecarPath,
    metadata: normalized,
  }
}

async function enrichModelMetadataInBackground({ metadata, modelPath, cachePath }) {
  const hashes = { ...(metadata.hashes ?? {}) }
  if (!Object.keys(hashes).length) {
    hashes.SHA256 = await hashFileSha256(modelPath)
  }

  const payload = await fetchCivitaiVersionMetadata({
    versionId: metadata.versionId,
    hashes,
  })

  if (payload) {
    await writeMetadataPayload(modelPath, cachePath, payload)
  }
}

function scheduleModelMetadataEnrichment(options) {
  const key = `${options.modelType}:${options.modelName}`
  if (pendingEnrichment.has(key)) {
    return
  }

  pendingEnrichment.add(key)
  void enrichModelMetadataInBackground(options)
    .catch(() => {})
    .finally(() => {
      pendingEnrichment.delete(key)
    })
}

export async function getModelCompatibilityMetadata({ rootPath, modelName, modelType, sidecar }) {
  const modelPath = resolveModelPath(rootPath, modelName)
  const cachePath = metadataCachePath(modelType, modelName)
  const cachedPayload = await readJsonFileIfExists(cachePath)
  const sidecarMetadata = normalizeModelCompatibilityMetadata(sidecar?.payload, {
    modelName,
    modelType,
    source: sidecar ? 'sidecar' : 'unknown',
    status: sidecar ? 'ready' : 'missing',
  })
  const cachedMetadata = normalizeModelCompatibilityMetadata(cachedPayload, {
    modelName,
    modelType,
    source: 'cache',
    status: cachedPayload ? 'ready' : 'missing',
  })
  const metadata = hasCompatibilityBasis(sidecarMetadata)
    ? sidecarMetadata
    : hasCompatibilityBasis(cachedMetadata)
      ? cachedMetadata
      : sidecar
        ? sidecarMetadata
        : cachedPayload
          ? cachedMetadata
          : sidecarMetadata

  if (modelPath && !hasCompatibilityBasis(metadata)) {
    scheduleModelMetadataEnrichment({ rootPath, modelName, modelType, metadata, modelPath, cachePath })
    return {
      ...metadata,
      status: metadata.status === 'missing' ? 'loading' : metadata.status,
    }
  }

  return metadata
}

function hasExplicitMatch(checkpointMetadata, loraMetadata) {
  const checkpointNameKeys = new Set(
    [checkpointMetadata?.modelName, checkpointMetadata?.versionName]
      .filter(Boolean)
      .map((value) => safeTrim(value).toLowerCase()),
  )
  const loraCheckpointNames = loraMetadata?.checkpointNames ?? []
  if (loraCheckpointNames.some((name) => checkpointNameKeys.has(name.toLowerCase()))) {
    return true
  }

  const checkpointHashes = new Set(Object.values(checkpointMetadata?.hashes ?? {}).map((hash) => safeTrim(hash).toLowerCase()))
  return Object.values(loraMetadata?.checkpointHashes ?? {}).some((hash) =>
    checkpointHashes.has(safeTrim(hash).toLowerCase()),
  )
}

export function classifyLoraCompatibility(checkpointMetadata, loraMetadata) {
  if (hasExplicitMatch(checkpointMetadata, loraMetadata)) {
    return 'compatible'
  }

  const checkpointBaseModel = checkpointMetadata?.baseModelKey || normalizeBaseModelKey(checkpointMetadata?.baseModel)
  const loraBaseModel = loraMetadata?.baseModelKey || normalizeBaseModelKey(loraMetadata?.baseModel)
  if (checkpointBaseModel && loraBaseModel) {
    if (checkpointBaseModel === loraBaseModel) {
      return 'compatible'
    }

    if (
      sdxlArchitectureBaseModelKeys.has(checkpointBaseModel) &&
      sdxlArchitectureBaseModelKeys.has(loraBaseModel)
    ) {
      return 'warning'
    }

    return 'incompatible'
  }

  return 'unverified'
}

export function classifyControlNetCompatibility(checkpointMetadata, controlNetMetadata, checkpointFamily = '') {
  if (hasExplicitMatch(checkpointMetadata, controlNetMetadata)) {
    return 'compatible'
  }

  const checkpointKeys = expandBaseModelCompatibilityKeys(
    checkpointMetadata?.baseModelKey,
    checkpointMetadata?.baseModel,
    checkpointFamily,
  )
  const controlNetKeys = expandBaseModelCompatibilityKeys(
    controlNetMetadata?.baseModelKey,
    controlNetMetadata?.baseModel,
    controlNetMetadata?.compatibleBaseModelKeys ?? [],
    controlNetMetadata?.compatibleBaseModels ?? [],
  )

  if ([...checkpointKeys].some((key) => controlNetKeys.has(key))) {
    return 'compatible'
  }

  if (checkpointKeys.size && controlNetKeys.size) {
    return 'incompatible'
  }

  return 'unverified'
}

export function resetModelMetadataRuntimeState() {
  pendingEnrichment.clear()
}
