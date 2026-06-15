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

export function modelVersionLabel(version: CivitaiModelVersion) {
  const name = version.name ?? `Version ${version.id}`
  return version.baseModel ? `${name} - ${version.baseModel}` : name
}

export function imagesForVersion(version: CivitaiModelVersion | null | undefined) {
  return (version?.images ?? []).filter((image) => Boolean(image.url))
}

export function primaryFileForVersion(version: CivitaiModelVersion | null | undefined) {
  return version?.files?.find((file) => file.primary === true && file.type === 'Model')
    ?? version?.files?.find((file) => file.type === 'Model')
    ?? version?.files?.find((file) => file.primary === true)
    ?? null
}

export function numberProp(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : null
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

function nsfwFlagDetectedValue(value: unknown): boolean | null {
  if (typeof value === 'boolean') {
    return value
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value > 0 : null
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (!normalized) {
      return null
    }

    return !['false', '0', 'none', 'safe', 'not detected', 'not_detected'].includes(normalized)
  }

  return null
}

function nsfwLevelDetectedValue(value: unknown): boolean | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value > 1 : null
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
    return numericLevel > 1
  }

  return !['false', '0', '1', 'none', 'safe', 'not detected', 'not_detected'].includes(normalized)
}

export function imageNsfwDetectedValue(image: NsfwMediaSource): boolean | null {
  const levelDetected = nsfwLevelDetectedValue(image?.nsfwLevel)
  const flagDetected = nsfwFlagDetectedValue(image?.nsfw)

  if (levelDetected === true || flagDetected === true) {
    return true
  }

  if (levelDetected !== null) {
    return levelDetected
  }

  return flagDetected
}

export function modelHasNsfwContent(
  model: Pick<CivitaiModel, 'id' | 'nsfw'> & {
    modelVersions?: Array<{ images?: Array<Pick<CivitaiImage, 'nsfw' | 'nsfwLevel'>> }>
  },
) {
  return model.nsfw === true
    || (model.modelVersions ?? []).some((version) =>
      (version.images ?? []).some((image) => isImageNsfw(null, image)),
    )
}

export function civitaiModelWebUrl(
  model: Pick<CivitaiModel, 'id' | 'nsfw'> & {
    modelVersions?: Array<{ images?: Array<Pick<CivitaiImage, 'nsfw' | 'nsfwLevel'>> }>
  },
) {
  const baseUrl = modelHasNsfwContent(model) ? 'https://civitai.red' : 'https://civitai.com'
  return `${baseUrl}/models/${model.id}`
}

export function imageNsfwLabel(model: CivitaiModel | null, image: CivitaiImage | null | undefined) {
  if (isImageNsfw(model, image)) {
    return 'Yes'
  }

  const imageDetected = imageNsfwDetectedValue(image)
  if (imageDetected === false) {
    return 'No'
  }

  if (typeof image?.nsfw === 'string' && image.nsfw.trim()) {
    return image.nsfw
  }

  return 'Unknown'
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
