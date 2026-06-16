import {
  imageMatchesNsfwBlurLevel,
  imageNsfwDetectedValue,
  imagesForVersion,
  isVideoUrl,
  modelVersionLabel,
  primaryFileForVersion,
} from '../../components/asset-preview/assetPreviewHelpers'
import type { CivitaiModel } from '../../components/asset-preview/assetPreviewTypes'
import type { AssetDownloadItem, WatchedAssetDownloadItem } from '../../composables/useAssetDownloads'
import type { ModelCompatibilityMetadata } from '../home/homeTypes'

export const typeFilters = [
  { label: 'All', value: 'all' },
  { label: 'Checkpoints', value: 'checkpoint' },
  { label: 'LoRAs', value: 'lora' },
  { label: 'ControlNets', value: 'controlnet' },
] as const

export const sourceFilters = [
  { label: 'All', value: 'all', ariaLabel: 'Show all library items' },
  { label: 'Watching', value: 'watched', ariaLabel: 'Show watched library items only' },
  { label: 'Hidden', value: 'hidden', ariaLabel: 'Show hidden library items only' },
] as const

export type LibraryTypeFilter = (typeof typeFilters)[number]['value']
export type LibraryItemKind = Exclude<LibraryTypeFilter, 'all'>
export type LibrarySource = 'downloaded' | 'watched' | 'hidden' | 'controlnet'
export type LibrarySourceFilter = (typeof sourceFilters)[number]['value']
export type LibraryPreviewPath = {
  id?: string | number | null
  url?: string | null
  type?: 'image' | 'video' | string | null
  mediaType?: 'image' | 'video' | string | null
  nsfw?: string | boolean | null
  nsfwLevel?: string | number | null
  width?: number | null
  height?: number | null
  hash?: string | null
}
export type ControlNetLibraryItem = {
  id: string
  itemKind: 'controlnet'
  librarySource: 'controlnet'
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
export type DownloadedLibraryItem = AssetDownloadItem & {
  itemKind: 'checkpoint' | 'lora'
  librarySource: 'downloaded'
  compatibility?: ModelCompatibilityMetadata | null
}
export type WatchedLibraryItem = WatchedAssetDownloadItem & {
  itemKind: 'checkpoint' | 'lora'
  librarySource: 'watched'
  compatibility?: ModelCompatibilityMetadata | null
  previewUrl?: string | null
  previewPaths?: LibraryPreviewPath[]
}
export type HiddenLibraryItem = {
  id: string
  itemKind: 'checkpoint' | 'lora' | 'controlnet'
  librarySource: 'hidden'
  civitaiModel: CivitaiModel
  modelName: string
  modelType: string
  modelId: number
  versionId: number | null
  versionName: string
  baseModel: string
  fileName: string
  updatedAt: number
  previewUrl: string | null
  previewPaths: LibraryPreviewPath[]
  compatibility: ModelCompatibilityMetadata
}
export type LibraryModelItem =
  | DownloadedLibraryItem
  | WatchedLibraryItem
  | HiddenLibraryItem
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

type ModelTypeLike = Pick<AssetDownloadItem | WatchedAssetDownloadItem, 'modelType'>

export function normalizedModelType(item: ModelTypeLike): LibraryItemKind | '' {
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

export function isCheckpointOrLora(item: ModelTypeLike) {
  const modelType = normalizedModelType(item)
  return modelType === 'checkpoint' || modelType === 'lora'
}

export function modelTypeLabel(item: LibraryModelItem) {
  if (item.itemKind === 'controlnet') {
    return 'ControlNet'
  }

  return item.itemKind === 'lora' ? 'LoRA' : 'Checkpoint'
}

export function parseLibrarySourceFilter(value: unknown): LibrarySourceFilter {
  const rawValue = Array.isArray(value) ? value[0] : value
  const normalized = typeof rawValue === 'string' ? rawValue.trim() : ''
  return sourceFilters.find((option) => option.value === normalized)?.value ?? 'all'
}

function appendBaseModelLabels(target: string[], values: unknown[]) {
  const seen = new Set(target.map((value) => value.toLowerCase()))

  for (const value of values) {
    if (Array.isArray(value)) {
      appendBaseModelLabels(target, value)
      continue
    }

    if (typeof value !== 'string') {
      continue
    }

    for (const entry of value.split(/[\r\n,|]+/g)) {
      const label = entry.trim()
      const key = label.toLowerCase()
      if (!label || seen.has(key)) {
        continue
      }

      seen.add(key)
      target.push(label)
    }
  }
}

export function baseModelLabelsFor(item: LibraryModelItem) {
  const labels: string[] = []
  appendBaseModelLabels(labels, [
    item.compatibility?.compatibleBaseModels,
    item.compatibility?.baseModel,
    item.baseModel,
  ])

  return labels
}

export function primaryPreviewPath(item: LibraryModelItem) {
  return item.previewPaths?.find((preview) => preview.url) ?? null
}

function previewImagePathForItem(item: LibraryModelItem) {
  if (!('previewImage' in item)) {
    return null
  }

  return watchedPreviewPathFromImage(item.previewImage)
}

function previewSafetyPathsForItem(item: LibraryModelItem) {
  return [
    previewImagePathForItem(item),
    ...(item.previewPaths ?? []),
  ].filter((preview): preview is LibraryPreviewPath => Boolean(preview))
}

function previewSafetyPathsForDownload(item: AssetDownloadItem | WatchedAssetDownloadItem) {
  const previewPaths = 'previewPaths' in item && Array.isArray(item.previewPaths) ? item.previewPaths : []
  return [
    'previewImage' in item ? watchedPreviewPathFromImage(item.previewImage) : null,
    ...previewPaths,
  ].filter((preview): preview is LibraryPreviewPath => Boolean(preview))
}

export function previewFor(item: LibraryModelItem) {
  return item.previewUrl ?? primaryPreviewPath(item)?.url ?? previewImagePathForItem(item)?.url ?? ''
}

export function isVideoPreview(item: LibraryModelItem) {
  const previewUrl = previewFor(item)
  return primaryPreviewPath(item)?.mediaType === 'video' || isVideoUrl(previewUrl)
}

function previewIdentity(value: unknown) {
  if (value === null || value === undefined) {
    return ''
  }

  return String(value).trim().toLowerCase()
}

function previewsMatch(left: LibraryPreviewPath | null, right: LibraryPreviewPath | null) {
  if (!left || !right) {
    return false
  }

  const leftId = previewIdentity(left.id)
  const rightId = previewIdentity(right.id)
  if (leftId && rightId && leftId === rightId) {
    return true
  }

  const leftHash = previewIdentity(left.hash)
  const rightHash = previewIdentity(right.hash)
  return Boolean(leftHash && rightHash && leftHash === rightHash)
}

function displayedPreviewSafetyPath(item: LibraryModelItem) {
  const primaryPreview = primaryPreviewPath(item)
  if (imageNsfwDetectedValue(primaryPreview) !== null) {
    return primaryPreview
  }

  const previewImage = previewImagePathForItem(item)
  if (
    imageNsfwDetectedValue(previewImage) !== null &&
    (!primaryPreview || previewsMatch(primaryPreview, previewImage) || (item.previewPaths?.length ?? 0) <= 1)
  ) {
    return previewImage
  }

  return primaryPreview ?? previewImage
}

export function previewHasNsfw(item: LibraryModelItem) {
  return imageNsfwDetectedValue(displayedPreviewSafetyPath(item)) === true
}

export function previewHasCurrentSafetyMetadata(item: LibraryModelItem) {
  return previewSafetyPathsForItem(item).some((preview) => imageNsfwDetectedValue(preview) !== null)
}

export function previewNeedsBackfill(item: LibraryModelItem) {
  return !previewFor(item) || !previewHasCurrentSafetyMetadata(item)
}

export function previewMatchesNsfwBlurLevel(item: LibraryModelItem, blurLevel: 4 | 8 | 16 | 32 | null | undefined) {
  return imageMatchesNsfwBlurLevel(displayedPreviewSafetyPath(item), blurLevel)
}

function previewPathsNsfwDetectedValue(previewPaths: LibraryPreviewPath[] | null | undefined) {
  let hasCurrentSafePreview = false
  for (const preview of previewPaths ?? []) {
    const detected = imageNsfwDetectedValue(preview)
    if (detected === true) {
      return true
    }
    if (detected === false) {
      hasCurrentSafePreview = true
    }
  }

  return hasCurrentSafePreview ? false : null
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

function metadataRecordFor(
  item: Pick<AssetDownloadItem | WatchedAssetDownloadItem, 'modelMetadata'>,
): Record<string, unknown> {
  return item.modelMetadata && typeof item.modelMetadata === 'object' && !Array.isArray(item.modelMetadata)
    ? item.modelMetadata as Record<string, unknown>
    : {}
}

export function compatibilityForDownload(item: AssetDownloadItem | WatchedAssetDownloadItem): ModelCompatibilityMetadata {
  const metadata = metadataRecordFor(item)
  const modelNsfwOverride = normalizeSafetyValue(
    ('modelNsfwOverride' in item ? item.modelNsfwOverride : undefined) ?? metadata.modelNsfwOverride,
  )
  const imageSafetyOverrides =
    ('imageSafetyOverrides' in item ? item.imageSafetyOverrides : undefined)
      ?? metadata.imageSafetyOverrides
      ?? {}
  return {
    modelId: item.modelId ?? null,
    versionId: item.versionId ?? null,
    modelName: item.modelName,
    versionName: item.versionName,
    modelType: item.modelType,
    modelNsfw: previewPathsNsfwDetectedValue(previewSafetyPathsForDownload(item)),
    modelNsfwOverride,
    imageSafetyOverrides: imageSafetyOverrides as ModelCompatibilityMetadata['imageSafetyOverrides'],
    baseModel: item.baseModel ?? '',
  }
}

export function modelHasNsfw(item: LibraryModelItem) {
  if (item.compatibility?.modelNsfwOverride !== null && item.compatibility?.modelNsfwOverride !== undefined) {
    return item.compatibility.modelNsfwOverride === true
  }

  return previewPathsNsfwDetectedValue(previewSafetyPathsForItem(item)) === true
}

export function controlNetBaseModelLabel(compatibility: ModelCompatibilityMetadata | null | undefined) {
  const bases = compatibility?.compatibleBaseModels ?? []
  return bases.length ? bases.join(', ') : compatibility?.baseModel ?? ''
}

export function controlNetDisplayName(controlNet: NonNullable<ControlNetResponse['controlNets']>[number]) {
  return controlNet.displayName ?? controlNet.name
}

function watchedPreviewPathFromImage(image: Record<string, unknown> | null | undefined): LibraryPreviewPath | null {
  const url = typeof image?.url === 'string' ? image.url : ''
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

export function watchedPreviewPathsFor(item: WatchedAssetDownloadItem): LibraryPreviewPath[] {
  const paths = [
    watchedPreviewPathFromImage(item.previewImage),
    ...(item.previewImages ?? []).map((image) => watchedPreviewPathFromImage(image)),
  ].filter((path): path is LibraryPreviewPath => Boolean(path?.url))
  const seen = new Set<string>()

  return paths.filter((path) => {
    const url = path.url ?? ''
    if (!url || seen.has(url)) {
      return false
    }

    seen.add(url)
    return true
  })
}

export function watchedPreviewUrlFor(item: WatchedAssetDownloadItem) {
  return watchedPreviewPathsFor(item)[0]?.url ?? null
}

export function hiddenLibraryItemForModel(model: CivitaiModel): HiddenLibraryItem | null {
  const itemKind = normalizedModelType({ modelType: model.type })
  if (itemKind !== 'checkpoint' && itemKind !== 'lora' && itemKind !== 'controlnet') {
    return null
  }

  const version = model.modelVersions?.[0] ?? null
  const file = primaryFileForVersion(version)
  const previewPaths = version
    ? imagesForVersion(version).map((image) => ({
      url: image.url,
      mediaType: image.mediaType ?? image.type ?? null,
      nsfwLevel: image.nsfwLevel ?? null,
      }))
    : []

  return {
    id: `hidden:${model.id}`,
    itemKind,
    librarySource: 'hidden',
    civitaiModel: model,
    modelName: model.name,
    modelType: model.type,
    modelId: model.id,
    versionId: version?.id ?? null,
    versionName: version ? modelVersionLabel(version) : 'No public version listed',
    baseModel: version?.baseModel ?? '',
    fileName: file?.name ?? '',
    updatedAt: version?.publishedAt ? Date.parse(version.publishedAt) || 0 : 0,
    previewUrl: previewPaths[0]?.url ?? null,
    previewPaths,
    compatibility: {
      modelId: model.id,
      versionId: version?.id ?? null,
      modelName: model.name,
      versionName: version?.name ?? undefined,
      modelType: model.type,
      modelNsfw: previewPathsNsfwDetectedValue(previewPaths),
      modelNsfwOverride: null,
      imageSafetyOverrides: {},
      baseModel: version?.baseModel ?? '',
    },
  }
}
