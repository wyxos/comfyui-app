import { isVideoPreview, numberProp } from './assetPreviewHelpers'
import type {
  AtlasMediaStatus,
  CivitaiImage,
  CivitaiModel,
  CivitaiModelVersion,
} from './assetPreviewTypes'

export type AtlasReactionType = 'love' | 'like' | 'blacklist' | 'funny'
export type AtlasReactionDownloadBehavior = 'queue' | 'skip' | 'force'

export type AtlasReverbConfig = {
  enabled?: boolean
  key?: string | null
  host?: string | null
  port?: number | string | null
  scheme?: string | null
  channel?: string | null
}

export type AtlasDownloadProgressEvent = {
  event: string
  fileId: number | null
  transferId: number | null
  sourceUrl: string | null
  referrerUrl: string | null
  status: string | null
  percent: number | null
  reaction: AtlasReactionType | null
  reactedAt: string | null | undefined
  downloadedAt: string | null | undefined
  blacklistedAt: string | null | undefined
  payload: Record<string, unknown>
}

export type AtlasReactionResponse = {
  configured?: boolean
  file?: {
    id?: number
    source_id?: string | number | null
    url?: string | null
    referrer_url?: string | null
  }
  reaction?: {
    type?: string | null
  } | null
  reacted_at?: string | null
  download?: AtlasMediaStatus['download']
  blacklisted_at?: string | null
  reverb?: AtlasReverbConfig | null
  message?: string
}

export type AtlasFileDeleteResponse = {
  configured?: boolean
  deleted?: boolean
  file_id?: number | null
  message?: string
}

export function atlasRequestId(image: CivitaiImage) {
  return `civitai:${image.id ?? image.url ?? ''}`
}

export function atlasMediaKey(image: CivitaiImage) {
  if (image.id !== undefined && image.id !== null && image.id !== '') {
    return `id:${image.id}`
  }

  return `url:${image.url ?? ''}`
}

export function atlasImagesShareIdentity(left: CivitaiImage, right: CivitaiImage) {
  if (atlasMediaKey(left) === atlasMediaKey(right)) {
    return true
  }

  const leftUrl = typeof left.url === 'string' ? left.url.trim() : ''
  const rightUrl = typeof right.url === 'string' ? right.url.trim() : ''
  return leftUrl !== '' && rightUrl !== '' && leftUrl === rightUrl
}

export function atlasFileUrlForStatus(status: AtlasMediaStatus | null | undefined, atlasBaseUrl: string | null | undefined) {
  const baseUrl = typeof atlasBaseUrl === 'string' ? atlasBaseUrl.trim().replace(/\/+$/, '') : ''
  if (!baseUrl || !status?.file_id || (status.downloaded !== true && !status.downloaded_at)) {
    return ''
  }

  return `${baseUrl}/browse/file/${status.file_id}`
}

function atlasResourceType(modelType: string | null | undefined) {
  return ['lora', 'lycoris'].includes(String(modelType ?? '').trim().toLowerCase()) ? 'LoRA' : 'Checkpoint'
}

function numericCivitaiId(value: string | number | null | undefined) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value)
  }

  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    return Number.parseInt(value.trim(), 10)
  }

  return null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? value as Record<string, unknown> : null
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value.trim())
    return Number.isFinite(parsed) ? parsed : null
  }

  return null
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null
}

function normalizeComparableUrl(value: string | null | undefined) {
  if (typeof value !== 'string') {
    return ''
  }

  const trimmed = value.trim()
  if (!trimmed) {
    return ''
  }

  try {
    const url = new URL(trimmed)
    url.hash = ''
    return url.toString()
  } catch {
    return trimmed
  }
}

function urlsMatch(left: string | null | undefined, right: string | null | undefined) {
  const normalizedLeft = normalizeComparableUrl(left)
  const normalizedRight = normalizeComparableUrl(right)
  return Boolean(normalizedLeft && normalizedRight && normalizedLeft === normalizedRight)
}

function asReaction(value: unknown): AtlasReactionType | null {
  return value === 'love' || value === 'like' || value === 'blacklist' || value === 'funny' ? value : null
}

function parseReaction(payload: Record<string, unknown>) {
  const direct = asReaction(payload.reaction)
  if (direct !== null) {
    return direct
  }

  const named = asReaction(payload.reactionType ?? payload.reaction_type)
  if (named !== null) {
    return named
  }

  return asReaction(asRecord(payload.reaction)?.type)
}

function parseOptionalString(payload: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    if (key in payload) {
      return asString(payload[key])
    }
  }

  return undefined
}

export function atlasItemFor(image: CivitaiImage, model: CivitaiModel, version: CivitaiModelVersion) {
  const modelId = numberProp(model.id)
  const versionId = numberProp(version.id)

  return {
    request_id: atlasRequestId(image),
    id: numericCivitaiId(image.id),
    url: image.url,
    type: isVideoPreview(image) ? 'video' : 'image',
    nsfwLevel: image.nsfwLevel,
    width: image.width,
    height: image.height,
    hash: image.hash,
    postId: image.postId,
    username: image.username ?? model.creator?.username,
    meta: image.meta,
    modelId,
    modelVersionId: versionId,
    modelType: model.type,
    resource_containers: modelId !== null && versionId !== null
      ? [{
          type: atlasResourceType(model.type),
          modelId,
          modelVersionId: versionId,
          referrerUrl: `https://civitai.com/models/${modelId}?modelVersionId=${versionId}`,
        }]
      : [],
  }
}

export function statusFromReactionPayload(
  currentStatus: AtlasMediaStatus | null | undefined,
  payload: AtlasReactionResponse | null,
  type: AtlasReactionType,
): AtlasMediaStatus {
  const blacklistedAt = payload?.blacklisted_at ?? currentStatus?.blacklisted_at ?? null
  const isBlacklist = type === 'blacklist'

  return {
    ...(currentStatus ?? {}),
    exists: true,
    file_id: payload?.file?.id ?? currentStatus?.file_id ?? null,
    source_url: payload?.file?.url ?? currentStatus?.source_url ?? null,
    referrer_url: payload?.file?.referrer_url ?? currentStatus?.referrer_url ?? null,
    reaction: isBlacklist ? currentStatus?.reaction ?? null : payload?.reaction?.type ?? type,
    downloaded: currentStatus?.downloaded === true || Boolean(payload?.download?.downloaded_at),
    downloaded_at: payload?.download?.downloaded_at ?? currentStatus?.downloaded_at ?? null,
    blacklisted: isBlacklist || currentStatus?.blacklisted === true,
    blacklisted_at: isBlacklist ? blacklistedAt ?? new Date().toISOString() : blacklistedAt,
    reacted_at: payload?.reacted_at ?? currentStatus?.reacted_at ?? null,
    download: payload?.download ?? currentStatus?.download ?? null,
    filtered: false,
    ignored: false,
  }
}

export function atlasDownloadProgressEventFromPayload(event: string, payload: unknown): AtlasDownloadProgressEvent | null {
  const data = asRecord(payload)
  if (!data) {
    return null
  }

  return {
    event,
    fileId: asNumber(data.fileId ?? data.file_id),
    transferId: asNumber(data.downloadTransferId ?? data.id),
    sourceUrl: asString(data.original ?? data.url ?? data.file_url),
    referrerUrl: asString(data.referrer_url ?? data.referrerUrl ?? data.page_url),
    status: asString(data.status),
    percent: asNumber(data.percent),
    reaction: parseReaction(data),
    reactedAt: parseOptionalString(data, 'reacted_at', 'reactedAt'),
    downloadedAt: parseOptionalString(data, 'downloaded_at', 'downloadedAt'),
    blacklistedAt: parseOptionalString(data, 'blacklisted_at', 'blacklistedAt'),
    payload: data,
  }
}

export function atlasDownloadProgressEventMatchesImage(
  image: CivitaiImage,
  status: AtlasMediaStatus | null | undefined,
  event: AtlasDownloadProgressEvent,
) {
  return (event.fileId !== null && status?.file_id === event.fileId) ||
    (event.transferId !== null && status?.download?.transfer_id === event.transferId) ||
    urlsMatch(event.sourceUrl, image.url) ||
    urlsMatch(event.sourceUrl, status?.source_url) ||
    urlsMatch(event.referrerUrl, status?.referrer_url)
}

export function statusFromAtlasDownloadProgressEvent(
  currentStatus: AtlasMediaStatus | null | undefined,
  event: AtlasDownloadProgressEvent,
): AtlasMediaStatus {
  const status = event.status ?? currentStatus?.download?.status ?? null
  const completed = status === 'complete' || status === 'completed' || Boolean(event.downloadedAt)
  const downloadedAt = event.downloadedAt ?? currentStatus?.downloaded_at ?? currentStatus?.download?.downloaded_at ?? null

  return {
    ...(currentStatus ?? {}),
    exists: true,
    file_id: event.fileId ?? currentStatus?.file_id ?? null,
    source_url: event.sourceUrl ?? currentStatus?.source_url ?? null,
    referrer_url: event.referrerUrl ?? currentStatus?.referrer_url ?? null,
    downloaded: currentStatus?.downloaded === true || completed,
    downloaded_at: downloadedAt,
    reaction: event.reaction ?? currentStatus?.reaction ?? null,
    reacted_at: event.reactedAt ?? currentStatus?.reacted_at ?? null,
    blacklisted: currentStatus?.blacklisted === true || Boolean(event.blacklistedAt),
    blacklisted_at: event.blacklistedAt ?? currentStatus?.blacklisted_at ?? null,
    download: {
      ...(currentStatus?.download ?? {}),
      requested: true,
      transfer_id: event.transferId ?? currentStatus?.download?.transfer_id ?? null,
      status,
      progress_percent: event.percent ?? currentStatus?.download?.progress_percent ?? (completed ? 100 : null),
      downloaded_at: downloadedAt,
    },
    filtered: false,
    ignored: false,
  }
}

export function statusFromFileDeletePayload(
  currentStatus: AtlasMediaStatus | null | undefined,
): AtlasMediaStatus {
  return {
    ...(currentStatus ?? {}),
    exists: false,
    file_id: null,
    source_url: null,
    referrer_url: null,
    downloaded: false,
    downloaded_at: null,
    reaction: null,
    reacted_at: null,
    blacklisted: false,
    blacklisted_at: null,
    auto_blacklisted: false,
    download: null,
    filtered: false,
    ignored: false,
  }
}
