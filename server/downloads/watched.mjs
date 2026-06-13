import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { configDir, watchedDownloadsPath } from '../config.mjs'
import { parseInteger } from '../civitai-query.mjs'
import { safeTrim } from '../shared.mjs'
import {
  buildDownloadId,
  normalizeDownloadFile,
  normalizeDownloadModelMetadata,
  normalizePreviewImage,
  normalizePreviewImages,
  safeUnlink,
  sanitizeModelFilename,
} from './metadata.mjs'
import { renameWithRetries } from './state.mjs'
import { checkWatchedDownloadItem, normalizeModelType, pollIntervalMs } from './watched-checks.mjs'

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

function nextCheckAfter(now = Date.now()) {
  return now + pollIntervalMs()
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

export async function addWatchedCivitaiDownload(body, options = {}) {
  await ensureWatchedDownloadsLoaded()
  const normalized = normalizeWatchedDownloadBody(body)
  const now = Date.now()
  const existing = watchedDownloads.get(normalized.id)
  const lastStatus = safeTrim(options.lastStatus) || 'Waiting for Civitai to expose a downloadable file.'
  const item = {
    ...(existing ?? {}),
    ...normalized,
    state: 'watching',
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    lastCheckedAt: options.lastCheckedAt ?? existing?.lastCheckedAt ?? null,
    nextCheckAt: options.nextCheckAt ?? existing?.nextCheckAt ?? nextCheckAfter(now),
    queuedDownloadId: existing?.queuedDownloadId ?? null,
    lastStatus,
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
