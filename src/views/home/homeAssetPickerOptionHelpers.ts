import { imageNsfwDetectedValue } from '../../components/asset-preview/assetPreviewHelpers'

export type AssetPickerPreviewMedia = {
  url: string
  mediaType?: 'image' | 'video' | string | null
  nsfw?: string | boolean | null
  nsfwLevel?: string | number | null
}

export type AssetPickerPreviewSource = {
  url?: string | null
  mediaType?: 'image' | 'video' | string | null
  type?: 'image' | 'video' | string | null
  nsfw?: string | boolean | null
  nsfwLevel?: string | number | null
}

export type AssetPickerOption = {
  label: string
  value: string
  previewUrl?: string | null
  previewMediaType?: 'image' | 'video' | string | null
  previewPaths?: AssetPickerPreviewSource[] | null
  previewImages?: AssetPickerPreviewSource[] | null
  family?: string | null
  baseModel?: string | null
  baseModelKey?: string | null
  compatibleBaseModels?: string[] | null
  compatibleBaseModelKeys?: string[] | null
  modelNsfw?: boolean | number | string | null
  modelMetadata?: {
    nsfw?: boolean | number | string | null
    family?: string | null
    baseModel?: string | null
    baseModelKey?: string | null
    compatibleBaseModels?: string[] | null
    compatibleBaseModelKeys?: string[] | null
  } | null
  typeLabel?: string | null
}

export type BaseModelFilterOption = {
  key: string
  label: string
  count: number
}

function isNsfwValue(value: unknown) {
  if (typeof value === 'boolean') {
    return value
  }

  if (typeof value === 'number') {
    return value > 0
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    return Boolean(normalized && !['false', '0', 'no', 'none', 'safe'].includes(normalized))
  }

  return false
}

export function optionHasNsfw(option: AssetPickerOption) {
  return isNsfwValue(option.modelNsfw ?? option.modelMetadata?.nsfw)
}

export function normalizeBaseModelFilterKey(value: unknown) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function addBaseModelLabel(labels: Map<string, string>, value: unknown) {
  const label = String(value ?? '').trim()
  const key = normalizeBaseModelFilterKey(label)
  if (key && !labels.has(key)) {
    labels.set(key, label)
  }
}

export function optionBaseModelLabels(option: AssetPickerOption) {
  const labels = new Map<string, string>()
  const metadata = option.modelMetadata

  addBaseModelLabel(labels, option.baseModel)
  addBaseModelLabel(labels, metadata?.baseModel)

  for (const baseModel of option.compatibleBaseModels ?? []) {
    addBaseModelLabel(labels, baseModel)
  }

  for (const baseModel of metadata?.compatibleBaseModels ?? []) {
    addBaseModelLabel(labels, baseModel)
  }

  if (!labels.size) {
    addBaseModelLabel(labels, option.family)
    addBaseModelLabel(labels, metadata?.family)
    addBaseModelLabel(labels, option.baseModelKey)
    addBaseModelLabel(labels, metadata?.baseModelKey)

    for (const baseModelKey of option.compatibleBaseModelKeys ?? []) {
      addBaseModelLabel(labels, baseModelKey)
    }

    for (const baseModelKey of metadata?.compatibleBaseModelKeys ?? []) {
      addBaseModelLabel(labels, baseModelKey)
    }
  }

  return Array.from(labels.values())
}

export function optionBaseModelBadgeLabel(option: AssetPickerOption) {
  return optionBaseModelLabels(option)[0] ?? ''
}

function addPreviewMedia(
  media: AssetPickerPreviewMedia[],
  seen: Set<string>,
  source: AssetPickerPreviewSource | null | undefined,
) {
  const url = String(source?.url ?? '').trim()
  if (!url || seen.has(url)) {
    return
  }

  seen.add(url)
  media.push({
    url,
    mediaType: source?.mediaType ?? source?.type ?? null,
    nsfw: source?.nsfw ?? null,
    nsfwLevel: source?.nsfwLevel ?? null,
  })
}

export function optionPreviewMedia(option: AssetPickerOption) {
  const media: AssetPickerPreviewMedia[] = []
  const seen = new Set<string>()

  for (const source of option.previewPaths ?? []) {
    addPreviewMedia(media, seen, source)
  }

  for (const source of option.previewImages ?? []) {
    addPreviewMedia(media, seen, source)
  }

  if (!media.length && option.previewUrl) {
    addPreviewMedia(media, seen, { url: option.previewUrl, mediaType: option.previewMediaType ?? null })
  }

  return media
}

export function optionPreviewCount(option: AssetPickerOption) {
  return optionPreviewMedia(option).length
}

export function activePreviewMediaFor(option: AssetPickerOption, index: number) {
  const media = optionPreviewMedia(option)
  if (!media.length) {
    return null
  }

  return media[((index % media.length) + media.length) % media.length] ?? null
}

export function optionHasVideoPreview(media: AssetPickerPreviewMedia | null | undefined) {
  const mediaType = String(media?.mediaType ?? '').toLowerCase()
  return mediaType.includes('video') || /\.(mp4|webm|mov|m4v)(?:[?#].*)?$/i.test(media?.url ?? '')
}

export function previewMediaHasNsfw(media: AssetPickerPreviewMedia | null | undefined) {
  return imageNsfwDetectedValue(media) === true
}
