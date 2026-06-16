import type {
  Ref,
} from 'vue'
import type {
  CivitaiImage,
  CivitaiModel,
  CivitaiModelVersion,
  NormalizedMetaRow,
} from './assetPreviewTypes'

type NsfwMediaSource = Pick<CivitaiImage, 'nsfw' | 'nsfwLevel'> | null | undefined
type NsfwLevelSource = { nsfwLevel?: unknown } | null | undefined

export const NSFW_BLUR_LEVELS = [4, 8, 16, 32] as const
export type NsfwBlurLevel = (typeof NSFW_BLUR_LEVELS)[number]
export type NsfwMediaBlurLevel = NsfwBlurLevel | null

const NSFW_LEVEL_BITS = [32, 16, 8, 4, 2, 1] as const
const NSFW_LEVEL_LABELS: Record<number, string> = {
  1: 'PG',
  2: 'PG-13',
  4: 'R',
  8: 'X',
  16: 'XXX',
  32: 'Blocked',
}

const NSFW_LEVEL_ALIASES: Record<string, number> = {
  false: 0,
  none: 0,
  safe: 1,
  pg: 1,
  soft: 2,
  'pg-13': 2,
  pg13: 2,
  r: 4,
  mature: 7,
  x: 8,
  xxx: 16,
  blocked: 32,
  'not detected': 0,
  not_detected: 0,
}

export function modelVersionLabel(version: CivitaiModelVersion) {
  const name = version.name ?? `Version ${version.id}`
  return version.baseModel ? `${name} - ${version.baseModel}` : name
}

export function imagesForVersion(version: CivitaiModelVersion | null | undefined) {
  return (version?.images ?? []).filter((image) => Boolean(image.url))
}

export function previewSizedImageUrl(url: string) {
  return url.replace('original=true', 'width=450')
}

export function primaryFileForVersion(version: CivitaiModelVersion | null | undefined) {
  return version?.files?.find((file) => file.primary === true && file.type === 'Model')
    ?? version?.files?.find((file) => file.type === 'Model')
    ?? version?.files?.find((file) => file.primary === true)
    ?? null
}

export function numberProp(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value)
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? Math.trunc(parsed) : null
  }

  return null
}

export function selectedVersionFor(versions: Ref<CivitaiModelVersion[]>, activeVersionId: Ref<number | null>) {
  if (!versions.value.length) {
    return null
  }

  return versions.value.find((version) => version.id === activeVersionId.value)
    ?? versions.value[0]
    ?? null
}

function versionReleaseTimestamp(version: CivitaiModelVersion | null | undefined) {
  for (const value of [version?.publishedAt, version?.createdAt]) {
    if (!value) {
      continue
    }

    const timestamp = Date.parse(value)
    if (Number.isFinite(timestamp)) {
      return timestamp
    }
  }

  return null
}

export function sortModelVersions(versions: CivitaiModelVersion[] | null | undefined) {
  return (versions ?? [])
    .map((version, index) => ({
      version,
      index,
      timestamp: versionReleaseTimestamp(version),
    }))
    .sort((left, right) => {
      if (left.timestamp !== null && right.timestamp !== null && left.timestamp !== right.timestamp) {
        return right.timestamp - left.timestamp
      }

      if (left.timestamp !== null) {
        return -1
      }

      if (right.timestamp !== null) {
        return 1
      }

      return left.index - right.index
    })
    .map(({ version }) => version)
}

function normalizedAvailability(value: string | null | undefined) {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

export function isVersionDownloadable(version: CivitaiModelVersion | null | undefined) {
  const availability = normalizedAvailability(version?.availability)
  return !availability || availability === 'public' || (availability === 'earlyaccess' && version?.covered === true)
}

export function versionDownloadUnavailableLabel(version: CivitaiModelVersion | null | undefined) {
  const file = primaryFileForVersion(version)
  if (!file?.name) {
    return 'No file'
  }

  if (!isVersionDownloadable(version)) {
    return normalizedAvailability(version?.availability) === 'earlyaccess'
      ? 'Early access locked'
      : 'Unavailable'
  }

  if (!file.downloadUrl) {
    return 'No file'
  }

  return ''
}

export function fileSizeKb(file: ReturnType<typeof primaryFileForVersion>) {
  return file?.sizeKb ?? file?.sizeKB
}

export function formatFileSize(sizeKb: number | undefined) {
  if (!sizeKb) {
    return 'Unknown'
  }

  if (sizeKb >= 1024 * 1024) {
    return `${(sizeKb / 1024 / 1024).toFixed(2)} GB`
  }

  if (sizeKb >= 1024) {
    return `${(sizeKb / 1024).toFixed(1)} MB`
  }

  return `${Math.round(sizeKb)} KB`
}

export function formatNumber(value?: number) {
  if (!value) {
    return '0'
  }

  return new Intl.NumberFormat('en', {
    maximumFractionDigits: 1,
    notation: value >= 10000 ? 'compact' : 'standard',
  }).format(value)
}

export function mediaExtensionFromUrl(url: string | null | undefined) {
  if (!url) {
    return ''
  }

  try {
    return new URL(url, window.location.href).pathname.split('.').pop()?.toLowerCase() ?? ''
  } catch {
    return url.split('?')[0]?.split('#')[0]?.split('.').pop()?.toLowerCase() ?? ''
  }
}

export function isVideoUrl(url: string | null | undefined) {
  return ['mp4', 'webm', 'mov', 'm4v'].includes(mediaExtensionFromUrl(url))
}

export function isVideoPreview(image: CivitaiImage | null | undefined) {
  return (typeof image?.mediaType === 'string' && image.mediaType.toLowerCase().includes('video')) ||
    (typeof image?.type === 'string' && image.type.toLowerCase().includes('video')) ||
    isVideoUrl(image?.url)
}

export function isImageNsfw(_model: CivitaiModel | null, image: NsfwMediaSource) {
  return imageNsfwDetectedValue(image) === true
}

function normalizeNsfwLevelNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value)
  }

  if (typeof value !== 'string') {
    return null
  }

  const normalized = value.trim().toLowerCase()
  if (!normalized) {
    return null
  }

  const numericLevel = Number(normalized)
  if (Number.isFinite(numericLevel)) {
    return Math.trunc(numericLevel)
  }

  return NSFW_LEVEL_ALIASES[normalized] ?? null
}

function highestNsfwLevel(value: unknown): number | null {
  const level = normalizeNsfwLevelNumber(value)
  if (level === null) {
    return null
  }

  for (const bit of NSFW_LEVEL_BITS) {
    if ((level & bit) === bit) {
      return bit
    }
  }

  return level >= 4 ? level : 0
}

function nsfwLevelDetectedValue(value: unknown): boolean | null {
  const highestLevel = highestNsfwLevel(value)
  if (highestLevel === null) {
    return null
  }

  return highestLevel >= 4
}

export function imageNsfwDetectedValue(image: NsfwMediaSource): boolean | null {
  return nsfwLevelDetectedValue(image?.nsfwLevel)
}

export function imageMatchesNsfwBlurLevel(image: NsfwMediaSource, blurLevel: NsfwMediaBlurLevel | number | undefined): boolean {
  if (!NSFW_BLUR_LEVELS.includes(blurLevel as NsfwBlurLevel)) {
    return false
  }

  const highestLevel = highestNsfwLevel(image?.nsfwLevel)
  return highestLevel !== null && highestLevel >= (blurLevel as NsfwBlurLevel)
}

export function nsfwLevelLabel(value: unknown): string {
  const highestLevel = highestNsfwLevel(value)
  if (highestLevel === null) {
    return 'Unknown'
  }

  return NSFW_LEVEL_LABELS[highestLevel] ?? `Level ${highestLevel}`
}

export function modelHasNsfwContent(
  model: Pick<CivitaiModel, 'id' | 'nsfw'> & NsfwLevelSource & {
    modelVersions?: Array<NsfwLevelSource & { images?: Array<Pick<CivitaiImage, 'nsfw' | 'nsfwLevel'>> }>
  },
) {
  const levels = [
    model,
    ...(model.modelVersions ?? []),
    ...(model.modelVersions ?? []).flatMap((version) => version.images ?? []),
  ]
  return levels.some((source) => nsfwLevelDetectedValue(source?.nsfwLevel) === true)
}

export function civitaiModelWebUrl(
  model: Pick<CivitaiModel, 'id' | 'nsfw'> & NsfwLevelSource & {
    modelVersions?: Array<NsfwLevelSource & { images?: Array<Pick<CivitaiImage, 'nsfw' | 'nsfwLevel'>> }>
  },
) {
  const baseUrl = modelHasNsfwContent(model) ? 'https://civitai.red' : 'https://civitai.com'
  return `${baseUrl}/models/${model.id}`
}

export function imageNsfwLabel(model: CivitaiModel | null, image: CivitaiImage | null | undefined) {
  return nsfwLevelLabel(image?.nsfwLevel)
}

export function imageSafetyKeyFor(image: CivitaiImage | null | undefined, fallbackUrl = '') {
  if (image?.id !== undefined && image.id !== null) {
    return `id:${image.id}`
  }

  if (image?.hash) {
    return `hash:${image.hash}`
  }

  const url = image?.url ?? fallbackUrl
  return url ? `url:${url}` : ''
}

export function imageDimensions(image: CivitaiImage | null | undefined) {
  if (!image?.width || !image.height) {
    return 'Unknown'
  }

  return `${image.width} x ${image.height}`
}

export function extractImageMeta(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  const objectValue = value as Record<string, unknown>
  const nestedMeta = objectValue.meta
  if (nestedMeta && typeof nestedMeta === 'object' && !Array.isArray(nestedMeta)) {
    return nestedMeta as Record<string, unknown>
  }

  return objectValue
}

export function formatMeta(meta: Record<string, unknown> | null | undefined) {
  if (!meta || Object.keys(meta).length === 0) {
    return ''
  }

  return JSON.stringify(meta, null, 2)
}

function stringifyMetaValue(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim()
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }

  if (Array.isArray(value)) {
    return value.map((entry) => stringifyMetaValue(entry)).filter(Boolean).join(', ')
  }

  if (value && typeof value === 'object') {
    return JSON.stringify(value)
  }

  return ''
}

function firstMetaValue(meta: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = stringifyMetaValue(meta[key])
    if (value) {
      return value
    }
  }

  return ''
}

export function normalizeImageMeta(meta: Record<string, unknown> | null | undefined): NormalizedMetaRow[] {
  if (!meta || Object.keys(meta).length === 0) {
    return []
  }

  const rowDefinitions: Array<{ label: string; keys: string[]; mono?: boolean }> = [
    { label: 'Prompt', keys: ['prompt', 'Prompt'], mono: true },
    {
      label: 'Negative prompt',
      keys: ['negativePrompt', 'negative_prompt', 'Negative prompt', 'Negative Prompt'],
      mono: true,
    },
    { label: 'Seed', keys: ['seed', 'Seed'] },
    { label: 'Steps', keys: ['steps', 'Steps'] },
    { label: 'CFG scale', keys: ['cfgScale', 'cfg_scale', 'cfg', 'CFG scale', 'Cfg Scale'] },
    { label: 'Denoise', keys: ['denoise', 'Denoise', 'Denoising strength', 'Denoising Strength'] },
    { label: 'Sampler', keys: ['sampler', 'Sampler', 'samplerName', 'sampler_name'] },
    { label: 'Scheduler', keys: ['scheduler', 'Scheduler'] },
    { label: 'Model', keys: ['Model', 'model', 'modelName', 'model_name'] },
  ]

  return rowDefinitions.flatMap(({ label, keys, mono }) => {
    const value = firstMetaValue(meta, keys)
    return value ? [{ label, value, mono }] : []
  })
}

export function preloadImage(url: string) {
  return new Promise<void>((resolve, reject) => {
    const image = new window.Image()
    image.onload = () => resolve()
    image.onerror = () => reject(new Error('Image failed to load.'))
    image.src = url
  })
}
