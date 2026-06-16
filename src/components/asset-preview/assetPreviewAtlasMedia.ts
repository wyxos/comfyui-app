import { isVideoPreview, numberProp } from './assetPreviewHelpers'
import type {
  AtlasMediaStatus,
  CivitaiImage,
  CivitaiModel,
  CivitaiModelVersion,
} from './assetPreviewTypes'

export type AtlasReactionType = 'love' | 'like' | 'blacklist' | 'funny'

export type AtlasReactionResponse = {
  configured?: boolean
  file?: {
    id?: number
    source_id?: string | number | null
  }
  reaction?: {
    type?: string | null
  } | null
  reacted_at?: string | null
  download?: AtlasMediaStatus['download']
  blacklisted_at?: string | null
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

export function statusFromFileDeletePayload(
  currentStatus: AtlasMediaStatus | null | undefined,
): AtlasMediaStatus {
  return {
    ...(currentStatus ?? {}),
    exists: false,
    file_id: null,
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
