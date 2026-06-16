import type {
  AtlasMediaStatus,
  CivitaiImage,
  CivitaiImagesResponse,
  CivitaiModelVersion,
} from './assetPreviewTypes'
import { imagesForVersion, previewSizedImageUrl } from './assetPreviewHelpers'
import { atlasMediaKey } from './assetPreviewAtlasMedia'

export const MEDIA_FEED_LIMIT = 20

type AtlasFeedWrappedItem = {
  media?: CivitaiImage | null
  atlas?: AtlasMediaStatus | null
  status?: AtlasMediaStatus | null
  atlasStatus?: AtlasMediaStatus | null
}

type AtlasFeedDirectItem = CivitaiImage & {
  atlas?: AtlasMediaStatus | null
  status?: AtlasMediaStatus | null
}

export type AtlasFeedResponse = {
  ok?: boolean
  configured?: boolean
  items?: Array<AtlasFeedDirectItem | AtlasFeedWrappedItem | null | undefined>
  metadata?: {
    nextCursor?: string | null
  }
  nextCursor?: string | null
  next_cursor?: string | null
}

export function normalizeFeedImages(items: CivitaiImage[] | null | undefined) {
  return (items ?? [])
    .filter((image) => Boolean(image?.url))
    .slice(0, MEDIA_FEED_LIMIT)
}

export function mergeFeedImages(currentImages: CivitaiImage[], nextImages: CivitaiImage[]) {
  const seen = new Set(currentImages.map(atlasMediaKey))
  const merged = [...currentImages]
  for (const image of nextImages) {
    const key = atlasMediaKey(image)
    if (!seen.has(key)) {
      seen.add(key)
      merged.push(image)
    }
  }

  return merged
}

export function normalizeNextCursor(payload: CivitaiImagesResponse | AtlasFeedResponse) {
  const cursor = payload.metadata?.nextCursor
    ?? ('nextCursor' in payload ? payload.nextCursor : null)
    ?? ('next_cursor' in payload ? payload.next_cursor : null)
  return typeof cursor === 'string' && cursor.trim() ? cursor.trim() : ''
}

export function normalizeAtlasFeedImages(items: AtlasFeedResponse['items']): CivitaiImage[] {
  const images: CivitaiImage[] = []

  for (const item of items ?? []) {
    if (!item || typeof item !== 'object') {
      continue
    }

    if ('media' in item) {
      const media = item.media
      if (!media?.url) {
        continue
      }

      images.push({
        ...media,
        atlasStatus: item.atlas ?? item.status ?? item.atlasStatus ?? media.atlasStatus ?? null,
      })
      continue
    }

    const image = item as AtlasFeedDirectItem
    if (!image.url) {
      continue
    }

    images.push({
      ...image,
      atlasStatus: image.atlasStatus ?? image.atlas ?? image.status ?? null,
    })
  }

  return images.slice(0, MEDIA_FEED_LIMIT)
}

export function versionUsesArchivedMedia(version: CivitaiModelVersion | null) {
  return imagesForVersion(version).some((image) => image.archiveSource === 'local' || Boolean(image.remoteUrl))
}

export function previewUrlFor(url: string, isVideo: boolean) {
  return isVideo ? url : previewSizedImageUrl(url)
}

export async function feedRequestErrorMessage(response: Response) {
  const payload = await response.json().catch(() => null) as {
    message?: string
    details?: { error?: string } | string | null
  } | null
  const message = typeof payload?.message === 'string' && payload.message.trim()
    ? payload.message.trim()
    : `Civitai returned ${response.status}`
  const detail = typeof payload?.details === 'string'
    ? payload.details.trim()
    : typeof payload?.details?.error === 'string'
      ? payload.details.error.trim()
      : ''

  return detail ? `${message} ${detail}` : message
}
