import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { civitaiModelVersionsUrl, configDir, watchedDownloadsPath } from '../config.mjs'
import { parseInteger } from '../civitai-query.mjs'
import { normalizeOptionalBoolean, safeTrim, tryParseJson } from '../shared.mjs'
import {
  buildCivitaiRequestHeaders,
  buildDownloadId,
  normalizeDownloadFile,
  normalizeDownloadModelMetadata,
  normalizePreviewImage,
  normalizePreviewImages,
  safeUnlink,
  sanitizeModelFilename,
} from './metadata.mjs'
import { enqueueCivitaiDownload } from './queue.mjs'
import { renameWithRetries } from './state.mjs'

const watchedDownloads = new Map()
let watchedDownloadsLoaded = false
let watchedDownloadsPersistPromise = null
let watchedDownloadsPersistPending = false
let watchedDownloadsPersistTimer = null
let watchedDownloadPollTimer = null

export function resetWatchedDownloadsRuntimeState() {
  watchedDownloads.clear()
  watchedDownloadsLoaded = false
  watchedDownloadsPersistPromise = null
  watchedDownloadsPersistPending = false

  if (watchedDownloadsPersistTimer) {
    clearTimeout(watchedDownloadsPersistTimer)
  }
  watchedDownloadsPersistTimer = null

  stopWatchedDownloadPoller()
}

function pollIntervalMs() {
  return Math.max(
    60_000,
    Number.parseInt(process.env.CIVITAI_WATCHED_DOWNLOAD_POLL_INTERVAL_MS ?? `${60 * 60 * 1000}`, 10) || 60 * 60 * 1000,
  )
}

function nextCheckAfter(now = Date.now()) {
  return now + pollIntervalMs()
}

function normalizeModelType(value) {
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

function invalidWatchError(code, message) {
  const error = new Error(message)
  error.code = code
  return error
}

function normalizeWatchedDownloadBody(body) {
  const modelId = parseInteger(body?.modelId)
  const versionId = parseInteger(body?.versionId)
  const modelType = normalizeModelType(body?.modelType)
  const file = normalizeDownloadFile(body?.file)
  const fileName = sanitizeModelFilename(file.name)

  if (!modelId || !versionId || !fileName) {
    throw invalidWatchError('invalid-watch', 'A model id, version id, and primary model file name are required.')
  }

  if (!modelType) {
    throw invalidWatchError(
      'unsupported-model-type',
      'Only Checkpoint, LoRA, and ControlNet downloads are supported.',
    )
  }

  if (file.type && file.type !== 'Model') {
    throw invalidWatchError('unsupported-file-type', 'Only primary model files can be watched for download.')
  }

  const modelMetadata = normalizeDownloadModelMetadata(body?.modelMetadata ?? body?.model, {
    modelId,
    modelName: body?.modelName,
    modelType,
    modelNsfw: body?.modelNsfw ?? body?.nsfw,
    creator: body?.creator,
    stats: body?.stats,
    tags: body?.tags,
  })

  return {
    id: buildDownloadId(modelId, versionId, file),
    modelId,
    modelName: safeTrim(body?.modelName) || `Model ${modelId}`,
    modelType,
    modelNsfw: modelMetadata.nsfw,
    modelMetadata,
    versionId,
    versionName: safeTrim(body?.versionName) || `Version ${versionId}`,
    baseModel: safeTrim(body?.baseModel),
    file,
    fileId: file.id,
    fileName,
    trainedWords: Array.isArray(body?.trainedWords) ? body.trainedWords.filter((word) => typeof word === 'string') : [],
    previewImage: normalizePreviewImage(body?.previewImage),
    previewImages: normalizePreviewImages(body?.previewImages),
  }
}

export async function readWatchedDownloadsState() {
  let rawState
  try {
    rawState = await readFile(watchedDownloadsPath, 'utf8')
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return []
    }

    throw error
  }

  if (!rawState.trim()) {
    return []
  }

  const parsedState = JSON.parse(rawState)
  return Array.isArray(parsedState?.items) ? parsedState.items : []
}

export async function ensureWatchedDownloadsLoaded() {
  if (watchedDownloadsLoaded) {
    return
  }

  try {
    const items = await readWatchedDownloadsState()
    for (const item of items) {
      if (!item?.id) {
        continue
      }

      watchedDownloads.set(item.id, {
        ...item,
        state: item.state === 'checking' ? 'watching' : item.state,
      })
    }
  } catch {
    watchedDownloads.clear()
  } finally {
    watchedDownloadsLoaded = true
  }
}

export function serializeWatchedDownload(item) {
  return {
    id: item.id,
    state: item.state,
    modelId: item.modelId,
    modelName: item.modelName,
    modelType: item.modelType,
    modelNsfw: item.modelNsfw ?? null,
    modelMetadata: item.modelMetadata ?? null,
    versionId: item.versionId,
    versionName: item.versionName,
    baseModel: item.baseModel ?? null,
    fileId: item.fileId ?? null,
    fileName: item.fileName,
    file: item.file ?? null,
    trainedWords: item.trainedWords ?? [],
    previewImage: item.previewImage ?? null,
    previewImages: item.previewImages ?? [],
    createdAt: item.createdAt ?? null,
    updatedAt: item.updatedAt ?? null,
    lastCheckedAt: item.lastCheckedAt ?? null,
    nextCheckAt: item.nextCheckAt ?? null,
    queuedDownloadId: item.queuedDownloadId ?? null,
    lastStatus: item.lastStatus ?? '',
    lastError: item.lastError ?? null,
  }
}

function compareWatchedDownloads(left, right) {
  const stateRank = {
    watching: 0,
    attention: 1,
    queued: 2,
    cancelled: 3,
  }
  const leftRank = stateRank[left.state] ?? 99
  const rightRank = stateRank[right.state] ?? 99
  if (leftRank !== rightRank) {
    return leftRank - rightRank
  }

  return (right.updatedAt ?? 0) - (left.updatedAt ?? 0)
}

export function createWatchedDownloadsResponse(items = watchedDownloads.values()) {
  const serializedItems = [...items].map(serializeWatchedDownload).sort(compareWatchedDownloads)
  return {
    ok: true,
    items: serializedItems,
    counts: {
      watching: serializedItems.filter((item) => item.state === 'watching').length,
      attention: serializedItems.filter((item) => item.state === 'attention').length,
      queued: serializedItems.filter((item) => item.state === 'queued').length,
      cancelled: serializedItems.filter((item) => item.state === 'cancelled').length,
    },
  }
}

async function writeWatchedDownloadsStateSnapshot() {
  await mkdir(configDir, { recursive: true })
  const tempPath = `${watchedDownloadsPath}.${process.pid}.${Date.now()}.tmp`
  const backupPath = `${watchedDownloadsPath}.bak`
  const items = [...watchedDownloads.values()].map(serializeWatchedDownload)

  await writeFile(tempPath, `${JSON.stringify({ items }, null, 2)}\n`, 'utf8')
  await safeUnlink(backupPath)
  try {
    await renameWithRetries(watchedDownloadsPath, backupPath)
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      throw error
    }
  }

  try {
    await renameWithRetries(tempPath, watchedDownloadsPath)
  } catch (error) {
    try {
      await renameWithRetries(backupPath, watchedDownloadsPath)
    } catch {}
    await safeUnlink(tempPath)
    throw error
  }

  await safeUnlink(backupPath)
}

async function writeWatchedDownloadsStateNow() {
  watchedDownloadsPersistPending = true
  if (watchedDownloadsPersistPromise) {
    return watchedDownloadsPersistPromise
  }

  watchedDownloadsPersistPromise = (async () => {
    try {
      while (watchedDownloadsPersistPending) {
        watchedDownloadsPersistPending = false
        await writeWatchedDownloadsStateSnapshot()
      }
    } catch (error) {
      console.warn('Could not persist watched Civitai downloads state:', error instanceof Error ? error.message : error)
    } finally {
      watchedDownloadsPersistPromise = null
    }
  })()

  return watchedDownloadsPersistPromise
}

export function scheduleWatchedDownloadsPersist(immediate = false, delayMs = 750) {
  if (!watchedDownloadsLoaded) {
    return
  }

  if (immediate) {
    if (watchedDownloadsPersistTimer) {
      clearTimeout(watchedDownloadsPersistTimer)
      watchedDownloadsPersistTimer = null
    }

    void writeWatchedDownloadsStateNow()
    return
  }

  if (watchedDownloadsPersistTimer) {
    return
  }

  watchedDownloadsPersistTimer = setTimeout(() => {
    watchedDownloadsPersistTimer = null
    void writeWatchedDownloadsStateNow()
  }, delayMs)
}

export async function addWatchedCivitaiDownload(body) {
  await ensureWatchedDownloadsLoaded()
  const normalized = normalizeWatchedDownloadBody(body)
  const now = Date.now()
  const existing = watchedDownloads.get(normalized.id)
  const item = {
    ...(existing ?? {}),
    ...normalized,
    state: 'watching',
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    lastCheckedAt: existing?.lastCheckedAt ?? null,
    nextCheckAt: existing?.nextCheckAt ?? nextCheckAfter(now),
    queuedDownloadId: existing?.queuedDownloadId ?? null,
    lastStatus: 'Waiting for Civitai to expose a downloadable file.',
    lastError: null,
  }

  watchedDownloads.set(item.id, item)
  scheduleWatchedDownloadsPersist(true)
  return item
}

export async function cancelWatchedCivitaiDownload(id) {
  await ensureWatchedDownloadsLoaded()
  const item = watchedDownloads.get(id)
  if (!item) {
    return null
  }

  item.state = 'cancelled'
  item.updatedAt = Date.now()
  item.nextCheckAt = null
  watchedDownloads.delete(id)
  scheduleWatchedDownloadsPersist(true)
  return item
}

function normalizedAvailability(value) {
  return safeTrim(value).toLowerCase()
}

function isVersionDownloadable(version) {
  const availability = normalizedAvailability(version?.availability)
  return !availability || availability === 'public' || (availability === 'earlyaccess' && version?.covered === true)
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

function unavailableReason(version, file) {
  if (!file?.name) {
    return 'No primary model file is available yet.'
  }

  if (!isVersionDownloadable(version)) {
    return normalizedAvailability(version?.availability) === 'earlyaccess'
      ? 'Early access locked'
      : 'Version unavailable'
  }

  if (!file.downloadUrl) {
    return 'Download URL not available yet.'
  }

  return ''
}

async function fetchCivitaiVersion(versionId) {
  const upstreamUrl = new URL(`${civitaiModelVersionsUrl.toString().replace(/\/$/, '')}/${versionId}`)
  const response = await fetch(upstreamUrl, {
    headers: await buildCivitaiRequestHeaders('application/json'),
    redirect: 'follow',
  })
  const text = await response.text()
  if (!response.ok) {
    const error = new Error(`Civitai returned ${response.status}.`)
    error.statusCode = response.status
    error.payload = text ? tryParseJson(text) ?? text.slice(0, 1000) : null
    throw error
  }

  const payload = tryParseJson(text)
  if (!payload || typeof payload !== 'object') {
    throw new Error('Civitai returned an invalid model version response.')
  }

  return payload
}

function enqueuePayloadForWatchedVersion(item, version, file) {
  const model = version?.model && typeof version.model === 'object' ? version.model : null
  const modelId = parseInteger(model?.id) ?? item.modelId
  const modelType = normalizeModelType(model?.type) || item.modelType
  const modelNsfw = normalizeOptionalBoolean(model?.nsfw) ?? item.modelNsfw ?? null
  const modelName = safeTrim(model?.name) || item.modelName
  const modelMetadata = normalizeDownloadModelMetadata(model ?? item.modelMetadata, {
    modelId,
    modelName,
    modelType,
    modelNsfw,
    creator: item.modelMetadata?.creator,
    stats: item.modelMetadata?.stats,
    tags: item.modelMetadata?.tags,
  })

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
    previewImages: normalizePreviewImages([
      ...(Array.isArray(version?.images) ? version.images : []),
      ...(Array.isArray(item.previewImages) ? item.previewImages : []),
      item.previewImage,
    ]),
  }
}

async function checkWatchedDownloadItem(item, now) {
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
  const reason = unavailableReason(version, file)
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

export async function checkWatchedDownloads({ force = false } = {}) {
  await ensureWatchedDownloadsLoaded()
  const now = Date.now()
  const candidates = [...watchedDownloads.values()]
    .filter((item) =>
      (item.state === 'watching' || item.state === 'attention') &&
      (force || !item.nextCheckAt || item.nextCheckAt <= now),
    )

  const results = []
  let queued = 0
  for (const item of candidates) {
    const result = await checkWatchedDownloadItem(item, now)
    results.push(result.item)
    if (result.queued) {
      queued += 1
    }
  }

  if (candidates.length) {
    await writeWatchedDownloadsStateNow()
  }

  return {
    ok: true,
    checked: candidates.length,
    queued,
    items: results.map(serializeWatchedDownload),
  }
}

export function startWatchedDownloadPoller() {
  stopWatchedDownloadPoller()
  void ensureWatchedDownloadsLoaded()
    .then(() => checkWatchedDownloads())
    .catch((error) => {
      console.warn('Could not start watched Civitai download checks:', error instanceof Error ? error.message : error)
    })
  watchedDownloadPollTimer = setInterval(() => {
    void checkWatchedDownloads().catch((error) => {
      console.warn('Could not check watched Civitai downloads:', error instanceof Error ? error.message : error)
    })
  }, pollIntervalMs())
}

export function stopWatchedDownloadPoller() {
  if (watchedDownloadPollTimer) {
    clearInterval(watchedDownloadPollTimer)
  }
  watchedDownloadPollTimer = null
}
