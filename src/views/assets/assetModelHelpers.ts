import {
  civitaiModelWebUrl,
  imageNsfwDetectedValue,
  isVersionDownloadable,
  modelHasNsfwContent,
  sortModelVersions,
} from '../../components/asset-preview/assetPreviewHelpers'
import type { CivitaiImage, CivitaiModel, CivitaiModelVersion } from './assetViewTypes'

export { imageNsfwDetectedValue }

export function formatNumber(value?: number) {
  if (!value) {
    return '0'
  }

  return new Intl.NumberFormat('en', {
    maximumFractionDigits: 1,
    notation: value >= 10000 ? 'compact' : 'standard',
  }).format(value)
}

export function firstVersion(model: CivitaiModel) {
  return versionsForModel(model)[0] ?? null
}

export function imagesForVersion(version: CivitaiModelVersion): CivitaiImage[] {
  return (version.images ?? []).filter((image) => Boolean(image.url))
}

export function imagesForModel(model: CivitaiModel): CivitaiImage[] {
  return (model.modelVersions ?? []).flatMap((version) => imagesForVersion(version))
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
  return (typeof image?.type === 'string' && image.type.toLowerCase().includes('video')) || isVideoUrl(image?.url)
}

export function thumbnailMediaFor(model: CivitaiModel) {
  const version = firstVersion(model)
  return version ? imagesForVersion(version)[0] ?? null : null
}

export function thumbnailFor(model: CivitaiModel) {
  return thumbnailMediaFor(model)?.url ?? null
}

export function versionLabel(model: CivitaiModel) {
  const version = firstVersion(model)

  if (!version) {
    return 'No public version listed'
  }

  if (version.baseModel) {
    return `${version.name ?? `Version ${version.id}`} - ${version.baseModel}`
  }

  return version.name ?? `Version ${version.id}`
}

export function modelVersionLabel(version: CivitaiModelVersion) {
  const name = version.name ?? `Version ${version.id}`
  return version.baseModel ? `${name} - ${version.baseModel}` : name
}

export function creatorLabel(model: CivitaiModel) {
  return model.creator?.username ?? 'Unknown creator'
}

export function favoriteCountFor(model: CivitaiModel) {
  return model.stats?.favoriteCount ?? model.stats?.thumbsUpCount
}

export function isImageNsfw(_model: CivitaiModel, image?: CivitaiImage) {
  return imageNsfwDetectedValue(image) === true
}

export function modelHasNsfw(model: CivitaiModel) {
  return modelHasNsfwContent(model)
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

export function versionsForModel(model: CivitaiModel) {
  return sortModelVersions(model.modelVersions)
}

export function primaryFileForVersion(version: CivitaiModelVersion | null | undefined) {
  return version?.files?.find((file) => file.primary === true && file.type === 'Model')
    ?? version?.files?.find((file) => file.type === 'Model')
    ?? version?.files?.find((file) => file.primary === true)
    ?? null
}

export function fileSizeFor(file: ReturnType<typeof primaryFileForVersion>) {
  return file?.sizeKb ?? file?.sizeKB
}

export function modelDownloadKey(model: CivitaiModel, version: CivitaiModelVersion) {
  const file = primaryFileForVersion(version)
  return [model.id, version.id, file?.id ?? file?.name ?? 'file'].join('__')
}

export function canQueueVersion(version: CivitaiModelVersion | null | undefined) {
  const file = primaryFileForVersion(version)
  return Boolean(file?.downloadUrl && file.name && isVersionDownloadable(version))
}

export function previewImageForVersion(version: CivitaiModelVersion) {
  const image = version.images?.find((item) => item.url) ?? null
  return image
    ? {
        id: image.id,
        url: image.url,
        width: image.width,
        height: image.height,
        hash: image.hash,
        type: image.type,
        nsfwLevel: image.nsfwLevel,
      }
    : null
}

export function previewImagesForVersion(version: CivitaiModelVersion) {
  return (version.images ?? [])
    .filter((image) => image.url)
    .map((image) => ({
      id: image.id,
      url: image.url,
      width: image.width,
      height: image.height,
      hash: image.hash,
      type: image.type,
      nsfwLevel: image.nsfwLevel,
    }))
}

export function safeCreatorUsername(value: string | null | undefined) {
  return typeof value === 'string' ? value.trim() : ''
}

export function modelUrl(model: CivitaiModel) {
  return civitaiModelWebUrl(model)
}
