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
  const imageUrl = item.previewImage?.url
  if (typeof imageUrl === 'string' && imageUrl.trim()) {
    return imageUrl
  }

  const preview = item.previewImages?.find((image) => typeof image?.url === 'string' && image.url.trim())
  return typeof preview?.url === 'string' ? preview.url : ''
}

export function watchedDownloadToRowItem(item: WatchedAssetDownloadItem): DownloadViewRowItem {
  const previewUrl = watchedPreviewUrl(item)
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
    previewUrl: previewUrl || null,
    previewPaths: previewUrl ? [{ url: previewUrl, mediaType: 'image' }] : [],
    targetPath: item.lastStatus || 'Waiting for Civitai',
    error: item.lastError,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt ?? item.lastCheckedAt ?? item.createdAt ?? 0,
  }
}

export function itemHasNsfw(item: DownloadViewRowItem) {
  return isNsfwValue(item.modelNsfwOverride ?? item.modelMetadata?.modelNsfwOverride ?? item.modelNsfw ?? item.modelMetadata?.nsfw)
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
  return item?.previewUrl ?? item?.previewPaths?.find((preview) => preview.url)?.url ?? null
}

export function isVideoPreviewDownload(item: DownloadViewRowItem | null) {
  const previewUrl = previewForDownload(item)
  return item?.previewPaths?.some((preview) => preview.url === previewUrl && preview.mediaType === 'video') ?? false
}

export function rowModelTypeLabel(item: DownloadViewRowItem | null) {
  if (!item) {
    return 'Preview'
  }

  return normalizedModelType(item) === 'lora' ? 'LoRA' : 'Checkpoint'
}
