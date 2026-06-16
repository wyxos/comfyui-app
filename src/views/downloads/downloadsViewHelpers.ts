import { imageNsfwDetectedValue } from '../../components/asset-preview/assetPreviewHelpers'
import type { AssetDownloadItem, WatchedAssetDownloadItem } from '../../composables/useAssetDownloads'

export type DownloadViewRowItem = Omit<AssetDownloadItem, 'state'> & { state: AssetDownloadItem['state'] | 'watched' }
export type DownloadStatusGroup = 'downloaded' | 'active' | 'watched' | 'attention' | 'deleted'

export function normalizedModelType(item: DownloadViewRowItem) {
  const normalized = item.modelType.trim().toLowerCase()
  return normalized === 'checkpoint' ? 'checkpoint' : normalized === 'lora' ? 'lora' : ''
}

export function isCheckpointOrLora(item: AssetDownloadItem) {
  return Boolean(normalizedModelType(item as DownloadViewRowItem))
}

export function normalizedWatchedModelType(item: WatchedAssetDownloadItem) {
  const normalized = item.modelType.trim().toLowerCase()
  return normalized === 'checkpoint' ? 'checkpoint' : normalized === 'lora' ? 'lora' : ''
}

export function isWatchedCheckpointOrLora(item: WatchedAssetDownloadItem) {
  return Boolean(normalizedWatchedModelType(item))
}

export function watchedPreviewUrl(item: WatchedAssetDownloadItem) {
  return watchedPreviewPaths(item)[0]?.url ?? ''
}

function watchedPreviewPath(image: Record<string, unknown> | null | undefined) {
  const url = typeof image?.url === 'string' ? image.url.trim() : ''
  if (!url) {
    return null
  }

  const mediaType = typeof image?.mediaType === 'string'
    ? image.mediaType
    : typeof image?.type === 'string'
      ? image.type
      : null
  return {
    url,
    mediaType,
    nsfwLevel: typeof image?.nsfwLevel === 'string' || typeof image?.nsfwLevel === 'number' ? image.nsfwLevel : null,
  }
}

function watchedPreviewPaths(item: WatchedAssetDownloadItem) {
  const seen = new Set<string>()
  return [
    watchedPreviewPath(item.previewImage),
    ...(item.previewImages ?? []).map((image) => watchedPreviewPath(image)),
  ].filter((path): path is NonNullable<ReturnType<typeof watchedPreviewPath>> => {
    const url = path?.url ?? ''
    if (!url || seen.has(url)) {
      return false
    }

    seen.add(url)
    return true
  })
}

function previewPathForDownload(item: DownloadViewRowItem | null | undefined) {
  return item?.previewPaths?.find((preview) => preview.url) ?? watchedPreviewPath(item?.previewImage) ?? null
}

export function previewHasNsfw(item: DownloadViewRowItem | null | undefined) {
  return imageNsfwDetectedValue(previewPathForDownload(item)) === true
}

export function watchedDownloadToRowItem(item: WatchedAssetDownloadItem): DownloadViewRowItem {
  const previewUrl = watchedPreviewUrl(item)
  const previewPaths = watchedPreviewPaths(item)
  return {
    id: item.id,
    state: 'watched',
    modelId: item.modelId,
    modelName: item.modelName,
    modelType: item.modelType,
    modelNsfw: item.modelNsfw,
    modelMetadata: item.modelMetadata as AssetDownloadItem['modelMetadata'],
    versionId: item.versionId,
    versionName: item.versionName,
    baseModel: item.baseModel,
    fileId: item.fileId,
    fileName: item.fileName,
    previewImage: item.previewImage,
    previewUrl: previewUrl || null,
    previewPaths,
    targetPath: item.lastStatus || 'Waiting for Civitai',
    error: item.lastError,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt ?? item.lastCheckedAt ?? item.createdAt ?? 0,
  }
}

export function itemHasNsfw(item: DownloadViewRowItem) {
  const override = item.modelNsfwOverride ?? item.modelMetadata?.modelNsfwOverride
  if (override !== null && override !== undefined) {
    return isNsfwValue(override)
  }

  return [
    watchedPreviewPath(item.previewImage),
    ...(item.previewPaths ?? []),
  ].some((preview) => imageNsfwDetectedValue(preview) === true)
}

export function isNsfwValue(value: unknown) {
  if (typeof value === 'boolean') {
    return value
  }

  if (typeof value === 'number') {
    return value > 0
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    return Boolean(normalized && !['false', '0', 'no', 'n', 'none', 'safe', 'not detected', 'not_detected'].includes(normalized))
  }

  return false
}

export function statusGroup(item: DownloadViewRowItem): DownloadStatusGroup {
  if (item.state === 'complete') {
    return 'downloaded'
  }

  if (item.state === 'watched') {
    return 'watched'
  }

  if (item.state === 'queued' || item.state === 'downloading' || item.state === 'paused') {
    return 'active'
  }

  return item.state === 'deleted' ? 'deleted' : 'attention'
}

export function previewForDownload(item: DownloadViewRowItem | null) {
  return item?.previewUrl ?? previewPathForDownload(item)?.url ?? null
}

export function isVideoPreviewDownload(item: DownloadViewRowItem | null) {
  const previewUrl = previewForDownload(item)
  return previewPathForDownload(item)?.url === previewUrl && previewPathForDownload(item)?.mediaType === 'video'
}

export function rowModelTypeLabel(item: DownloadViewRowItem | null) {
  if (!item) {
    return 'Preview'
  }

  return normalizedModelType(item) === 'lora' ? 'LoRA' : 'Checkpoint'
}
