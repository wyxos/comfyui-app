import { modelHasNsfwContent } from './nsfw-level'

const COMPANION_BASE_URL = 'http://127.0.0.1:3210'
const QUEUE_MESSAGE_TYPE = 'COMFY_COMPANION_QUEUE_CIVITAI_MODEL'
const STATUS_MESSAGE_TYPE = 'COMFY_COMPANION_CIVITAI_DOWNLOAD_STATUS'

type RuntimeMessageSender = {
  tab?: {
    url?: string
  }
}

type QueueCivitaiModelMessage = {
  type: typeof QUEUE_MESSAGE_TYPE
  modelId?: unknown
  modelVersionId?: unknown
  sourceHostname?: unknown
  sourceUrl?: unknown
}

type DownloadStatusMessage = {
  type: typeof STATUS_MESSAGE_TYPE
  downloadId?: unknown
  modelId?: unknown
  modelVersionId?: unknown
}

type CivitaiModelFile = {
  id?: number | string | null
  name?: string | null
  type?: string | null
  downloadUrl?: string | null
  sizeKb?: number | null
  sizeKB?: number | null
  hashes?: Record<string, unknown> | null
  primary?: boolean
  metadata?: Record<string, unknown> | null
}

type CivitaiImage = {
  id?: number | string | null
  url?: string | null
  type?: string | null
  nsfw?: string | boolean | null
  nsfwLevel?: string | number | null
  width?: number
  height?: number
  hash?: string | null
  meta?: unknown
  postId?: number
  username?: string
  modelVersionIds?: number[]
}

type CivitaiModelVersion = {
  id?: number | string | null
  name?: string | null
  nsfwLevel?: string | number | null
  availability?: string | null
  covered?: boolean
  baseModel?: string | null
  trainedWords?: string[]
  files?: CivitaiModelFile[]
  images?: CivitaiImage[]
}

type CivitaiModel = {
  id?: number | string | null
  name?: string | null
  type?: string | null
  nsfw?: boolean | null
  nsfwLevel?: string | number | null
  creator?: Record<string, unknown> | null
  stats?: Record<string, unknown> | null
  tags?: string[]
  modelVersions?: CivitaiModelVersion[]
}

type CivitaiModelsResponse = {
  items?: CivitaiModel[]
}

type QueueDownloadPayload = {
  modelId: number
  modelName: string
  modelType: string
  modelNsfw: boolean
  modelMetadata: Record<string, unknown>
  versionId: number
  versionName: string
  baseModel: string | null
  file: {
    id?: number | string | null
    name: string
    type: string
    downloadUrl: string
    sizeKb?: number | null
    hashes?: Record<string, unknown> | null
    metadata?: Record<string, unknown> | null
  }
  trainedWords: string[]
  previewImage: CivitaiImage | null
  previewImages: CivitaiImage[]
}

type FetchLike = typeof fetch

export type CompanionDownloadStatusItem = {
  id: string
  state: string
  modelId: number
  modelName?: string
  modelType?: string
  versionId: number
  versionName?: string
  fileName?: string
  bytesDownloaded?: number
  totalBytes?: number | null
  progressPercent?: number | null
  error?: string | null
  updatedAt?: number
}

export type QueueCompanionResult = {
  ok: boolean
  status?: number
  payload?: unknown
  download?: CompanionDownloadStatusItem | null
  error?: string
  message?: string
}

export type DownloadStatusResult = {
  ok: boolean
  item?: CompanionDownloadStatusItem | null
  status?: number
  payload?: unknown
  error?: string
  message?: string
}

function parsePositiveInteger(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return value
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed !== '' && /^\d+$/.test(trimmed)) {
      const parsed = Number(trimmed)
      return Number.isInteger(parsed) && parsed > 0 ? parsed : null
    }
  }

  return null
}

function safeTrim(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function parseJsonText(text: string): unknown {
  const trimmed = text.trim()
  if (!trimmed) {
    return null
  }

  try {
    return JSON.parse(trimmed) as unknown
  } catch {
    return text
  }
}

async function fetchJson(fetchImpl: FetchLike, url: URL, init?: RequestInit): Promise<unknown> {
  const response = await fetchImpl(url, init)
  const payload = parseJsonText(await response.text())
  if (!response.ok || (isPlainObject(payload) && payload.ok === false)) {
    const message = isPlainObject(payload) && typeof payload.message === 'string'
      ? payload.message
      : `Request returned ${response.status}`
    const error = new Error(message)
    Object.assign(error, { status: response.status, payload })
    throw error
  }

  return payload
}

function isVersionDownloadable(version: CivitaiModelVersion): boolean {
  const availability = safeTrim(version.availability).toLowerCase()
  return availability === '' || availability === 'public' || (availability === 'earlyaccess' && version.covered === true)
}

function primaryFileForVersion(version: CivitaiModelVersion): CivitaiModelFile | null {
  const files = Array.isArray(version.files) ? version.files : []
  return files.find((file) => file.primary === true && file.type === 'Model' && safeTrim(file.downloadUrl) !== '')
    ?? files.find((file) => file.type === 'Model' && safeTrim(file.downloadUrl) !== '')
    ?? files.find((file) => file.primary === true && safeTrim(file.downloadUrl) !== '')
    ?? null
}

function resolveVersion(model: CivitaiModel, requestedVersionId: number | null): CivitaiModelVersion | null {
  const versions = Array.isArray(model.modelVersions) ? model.modelVersions : []

  if (requestedVersionId !== null) {
    return versions.find((version) => parsePositiveInteger(version.id) === requestedVersionId) ?? null
  }

  return versions.find((version) => isVersionDownloadable(version) && primaryFileForVersion(version) !== null) ?? null
}

function normalizeModelType(value: unknown): string {
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

  return safeTrim(value)
}

export function buildCompanionDownloadPayload(
  model: CivitaiModel,
  version: CivitaiModelVersion,
  file: CivitaiModelFile,
): QueueDownloadPayload | null {
  const modelId = parsePositiveInteger(model.id)
  const versionId = parsePositiveInteger(version.id)
  const fileName = safeTrim(file.name)
  const downloadUrl = safeTrim(file.downloadUrl)
  const modelType = normalizeModelType(model.type)

  if (!modelId || !versionId || !fileName || !downloadUrl || !modelType) {
    return null
  }

  const previewImages = Array.isArray(version.images) ? version.images.filter((image) => safeTrim(image.url) !== '') : []
  const nsfw = modelHasNsfwContent(model)

  return {
    modelId,
    modelName: safeTrim(model.name) || `Model ${modelId}`,
    modelType,
    modelNsfw: nsfw,
    modelMetadata: {
      id: modelId,
      name: safeTrim(model.name) || `Model ${modelId}`,
      type: modelType,
      nsfw,
      creator: isPlainObject(model.creator) ? model.creator : null,
      stats: isPlainObject(model.stats) ? model.stats : null,
      tags: Array.isArray(model.tags) ? model.tags.filter((tag) => typeof tag === 'string') : [],
    },
    versionId,
    versionName: safeTrim(version.name) || `Version ${versionId}`,
    baseModel: safeTrim(version.baseModel) || null,
    file: {
      id: file.id ?? null,
      name: fileName,
      type: safeTrim(file.type) || 'Model',
      downloadUrl,
      sizeKb: typeof file.sizeKb === 'number' ? file.sizeKb : file.sizeKB ?? null,
      hashes: isPlainObject(file.hashes) ? file.hashes : null,
      metadata: isPlainObject(file.metadata) ? file.metadata : null,
    },
    trainedWords: Array.isArray(version.trainedWords)
      ? version.trainedWords.filter((word) => typeof word === 'string')
      : [],
    previewImage: previewImages[0] ?? null,
    previewImages,
  }
}

async function fetchCivitaiModel(
  fetchImpl: FetchLike,
  baseUrl: string,
  modelId: number,
  modelVersionId: number | null,
): Promise<CivitaiModel | null> {
  const url = new URL('/api/civitai/models', baseUrl)
  if (modelVersionId !== null) {
    url.searchParams.set('modelVersionId', String(modelVersionId))
  } else {
    url.searchParams.set('modelId', String(modelId))
  }

  const payload = await fetchJson(fetchImpl, url, {
    headers: {
      Accept: 'application/json',
    },
  })

  if (!isPlainObject(payload)) {
    return null
  }

  const response = payload as CivitaiModelsResponse
  const items = Array.isArray(response.items) ? response.items : []
  return items.find((item) => parsePositiveInteger(item.id) === modelId) ?? items[0] ?? null
}

async function postCompanionDownload(fetchImpl: FetchLike, baseUrl: string, payload: QueueDownloadPayload): Promise<unknown> {
  return fetchJson(fetchImpl, new URL('/api/civitai/downloads', baseUrl), {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify(payload),
  })
}

function parseDownloadStatusItem(value: unknown): CompanionDownloadStatusItem | null {
  if (!isPlainObject(value)) {
    return null
  }

  const id = safeTrim(value.id)
  const state = safeTrim(value.state)
  const modelId = parsePositiveInteger(value.modelId)
  const versionId = parsePositiveInteger(value.versionId)

  if (!id || !state || !modelId || !versionId) {
    return null
  }

  return {
    id,
    state,
    modelId,
    modelName: safeTrim(value.modelName),
    modelType: safeTrim(value.modelType),
    versionId,
    versionName: safeTrim(value.versionName),
    fileName: safeTrim(value.fileName),
    bytesDownloaded: typeof value.bytesDownloaded === 'number' ? value.bytesDownloaded : 0,
    totalBytes: typeof value.totalBytes === 'number' ? value.totalBytes : null,
    progressPercent: typeof value.progressPercent === 'number' ? value.progressPercent : null,
    error: typeof value.error === 'string' ? value.error : null,
    updatedAt: typeof value.updatedAt === 'number' ? value.updatedAt : 0,
  }
}

function extractDownloadStatusItem(payload: unknown): CompanionDownloadStatusItem | null {
  return isPlainObject(payload) ? parseDownloadStatusItem(payload.item) : null
}

export async function getCompanionCivitaiDownloadStatus(
  message: DownloadStatusMessage,
  options: { fetchImpl?: FetchLike; baseUrl?: string } = {},
): Promise<DownloadStatusResult> {
  const downloadId = safeTrim(message.downloadId)
  const modelId = parsePositiveInteger(message.modelId)
  const modelVersionId = parsePositiveInteger(message.modelVersionId)

  if (!downloadId && !modelId) {
    return { ok: false, error: 'invalid-status-request', message: 'A download id or Civitai model id is required.' }
  }

  const fetchImpl = options.fetchImpl ?? fetch
  const baseUrl = options.baseUrl ?? COMPANION_BASE_URL
  const url = new URL('/api/civitai/downloads/status', baseUrl)
  if (downloadId) {
    url.searchParams.set('id', downloadId)
  } else if (modelId) {
    url.searchParams.set('modelId', String(modelId))
    if (modelVersionId) {
      url.searchParams.set('versionId', String(modelVersionId))
    }
  }

  try {
    const payload = await fetchJson(fetchImpl, url, { headers: { Accept: 'application/json' } })
    return { ok: true, item: extractDownloadStatusItem(payload), payload }
  } catch (error) {
    return createStatusFailure(error)
  }
}

function createFailure(error: unknown): QueueCompanionResult {
  return {
    ok: false,
    status: isPlainObject(error) && typeof error.status === 'number' ? error.status : 0,
    payload: isPlainObject(error) ? error.payload : null,
    message: error instanceof Error ? error.message : 'Could not queue the Civitai download.',
  }
}

function createStatusFailure(error: unknown): DownloadStatusResult {
  return {
    ok: false,
    status: isPlainObject(error) && typeof error.status === 'number' ? error.status : 0,
    payload: isPlainObject(error) ? error.payload : null,
    message: error instanceof Error ? error.message : 'Could not read the Civitai download status.',
  }
}

export async function queueCompanionCivitaiDownload(
  message: QueueCivitaiModelMessage,
  options: { fetchImpl?: FetchLike; baseUrl?: string } = {},
): Promise<QueueCompanionResult> {
  const modelId = parsePositiveInteger(message.modelId)
  const modelVersionId = parsePositiveInteger(message.modelVersionId)

  if (!modelId) {
    return { ok: false, error: 'invalid-model-id', message: 'A Civitai model id is required.' }
  }

  const fetchImpl = options.fetchImpl ?? fetch
  const baseUrl = options.baseUrl ?? COMPANION_BASE_URL

  try {
    const model = await fetchCivitaiModel(fetchImpl, baseUrl, modelId, modelVersionId)
    if (!model) {
      return { ok: false, error: 'model-not-found', message: 'Civitai model metadata was not found.' }
    }

    const version = resolveVersion(model, modelVersionId)
    if (!version) {
      return { ok: false, error: 'version-not-found', message: 'No downloadable Civitai model version was found.' }
    }

    if (!isVersionDownloadable(version)) {
      return { ok: false, error: 'version-unavailable', message: 'That Civitai model version is not available for download.' }
    }

    const file = primaryFileForVersion(version)
    if (!file) {
      return { ok: false, error: 'file-not-found', message: 'No primary model file was found for that Civitai version.' }
    }

    const downloadPayload = buildCompanionDownloadPayload(model, version, file)
    if (!downloadPayload) {
      return { ok: false, error: 'invalid-download', message: 'Civitai metadata could not be converted into a download.' }
    }

    const payload = await postCompanionDownload(fetchImpl, baseUrl, downloadPayload)
    return { ok: true, payload, download: extractDownloadStatusItem(payload) }
  } catch (error) {
    return createFailure(error)
  }
}

export function handleQueueRuntimeMessage(
  message: unknown,
  _sender: RuntimeMessageSender,
  sendResponse: (response?: unknown) => void,
): boolean {
  if (!isPlainObject(message)) {
    return false
  }

  if (message.type === QUEUE_MESSAGE_TYPE) {
    void queueCompanionCivitaiDownload(message as QueueCivitaiModelMessage)
      .then((response) => {
        sendResponse(response)
      })
      .catch((error) => {
        sendResponse(createFailure(error))
      })

    return true
  }

  if (message.type === STATUS_MESSAGE_TYPE) {
    void getCompanionCivitaiDownloadStatus(message as DownloadStatusMessage)
      .then((response) => {
        sendResponse(response)
      })
      .catch((error) => {
        sendResponse(createStatusFailure(error))
      })

    return true
  }

  return false
}
