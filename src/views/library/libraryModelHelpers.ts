import { isVideoUrl } from '../../components/asset-preview/assetPreviewHelpers'
import type { AssetDownloadItem } from '../../composables/useAssetDownloads'
import type { ModelCompatibilityMetadata } from '../home/homeTypes'

export const typeFilters = [
  { label: 'All', value: 'all' },
  { label: 'Checkpoints', value: 'checkpoint' },
  { label: 'LoRAs', value: 'lora' },
  { label: 'ControlNets', value: 'controlnet' },
] as const

export type LibraryTypeFilter = (typeof typeFilters)[number]['value']
export type LibraryItemKind = Exclude<LibraryTypeFilter, 'all'>
export type ControlNetLibraryItem = {
  id: string
  itemKind: 'controlnet'
  modelName: string
  modelType: 'ControlNet'
  modelId: number | null
  versionId: number | null
  versionName: string
  baseModel: string
  fileName: string
  updatedAt: number
  previewUrl: null
  previewPaths: []
  compatibility: ModelCompatibilityMetadata | null
  controlType: string
  loaderType: string
}
export type LibraryModelItem =
  | (AssetDownloadItem & { itemKind: 'checkpoint' | 'lora'; compatibility?: ModelCompatibilityMetadata | null })
  | ControlNetLibraryItem
export type ControlNetResponse = {
  ok: boolean
  controlNets?: Array<{
    name: string
    displayName?: string
    compatibility?: ModelCompatibilityMetadata | null
    controlType?: string
    loaderType?: string
  }>
  message?: string
}

export function normalizedModelType(item: AssetDownloadItem): LibraryItemKind | '' {
  const normalized = item.modelType.trim().toLowerCase()
  if (normalized === 'checkpoint') {
    return 'checkpoint'
  }

  if (normalized === 'lora') {
    return 'lora'
  }

  if (normalized === 'controlnet' || normalized === 'control net') {
    return 'controlnet'
  }

  return ''
}

export function isCheckpointOrLora(item: AssetDownloadItem) {
  return Boolean(normalizedModelType(item))
}

export function modelTypeLabel(item: LibraryModelItem) {
  if (item.itemKind === 'controlnet') {
    return 'ControlNet'
  }

  return item.itemKind === 'lora' ? 'LoRA' : 'Checkpoint'
}

export function primaryPreviewPath(item: LibraryModelItem) {
  return item.previewPaths?.find((preview) => preview.url) ?? null
}

export function previewFor(item: LibraryModelItem) {
  return item.previewUrl ?? primaryPreviewPath(item)?.url ?? ''
}

export function isVideoPreview(item: LibraryModelItem) {
  const previewUrl = previewFor(item)
  return primaryPreviewPath(item)?.mediaType === 'video' || isVideoUrl(previewUrl)
}

export function normalizeSafetyValue(value: unknown): boolean | null {
  if (typeof value === 'boolean') {
    return value
  }

  if (typeof value === 'number') {
    return value > 0
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (!normalized) {
      return null
    }

    return !['false', '0', 'no', 'none', 'safe'].includes(normalized)
  }

  return null
}

export function compatibilityForDownload(item: AssetDownloadItem): ModelCompatibilityMetadata {
  const modelNsfwOverride = normalizeSafetyValue(item.modelNsfwOverride ?? item.modelMetadata?.modelNsfwOverride)
  return {
    modelId: item.modelId ?? null,
    versionId: item.versionId ?? null,
    modelName: item.modelName,
    versionName: item.versionName,
    modelType: item.modelType,
    modelNsfw: modelNsfwOverride ?? normalizeSafetyValue(item.modelNsfw ?? item.modelMetadata?.nsfw),
    modelNsfwOverride,
    imageSafetyOverrides: item.imageSafetyOverrides ?? item.modelMetadata?.imageSafetyOverrides ?? {},
    baseModel: item.baseModel ?? '',
  }
}

export function modelHasNsfw(item: LibraryModelItem) {
  if (item.compatibility?.modelNsfwOverride !== null && item.compatibility?.modelNsfwOverride !== undefined) {
    return item.compatibility.modelNsfwOverride === true
  }

  if (item.compatibility?.modelNsfw !== null && item.compatibility?.modelNsfw !== undefined) {
    return item.compatibility.modelNsfw === true
  }

  return 'modelNsfw' in item ? normalizeSafetyValue(item.modelNsfw ?? item.modelMetadata?.nsfw) === true : false
}

export function controlNetBaseModelLabel(compatibility: ModelCompatibilityMetadata | null | undefined) {
  const bases = compatibility?.compatibleBaseModels ?? []
  return bases.length ? bases.join(', ') : compatibility?.baseModel ?? ''
}

export function controlNetDisplayName(controlNet: NonNullable<ControlNetResponse['controlNets']>[number]) {
  return controlNet.displayName ?? controlNet.name
}
