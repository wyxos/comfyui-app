import { computed, onBeforeUnmount, ref, watch, type ComputedRef, type Ref } from 'vue'

import { imagesForVersion, isVideoPreview, numberProp, previewSizedImageUrl } from './assetPreviewHelpers'
import type {
  CivitaiImage,
  CivitaiImagesResponse,
  CivitaiModel,
  CivitaiModelVersion,
  PreviewSlide,
} from './assetPreviewTypes'

const MEDIA_FEED_LIMIT = 20

type UseAssetPreviewMediaFeedOptions = {
  open: ComputedRef<boolean>
  model: ComputedRef<CivitaiModel | null | undefined>
  selectedVersion: ComputedRef<CivitaiModelVersion | null>
  includeNsfw: ComputedRef<boolean>
  previewUrl: string | null | undefined
  isVideo: boolean
  activeImageIndex: Ref<number>
}

function normalizeFeedImages(items: CivitaiImage[] | null | undefined) {
  return (items ?? [])
    .filter((image) => Boolean(image?.url))
    .slice(0, MEDIA_FEED_LIMIT)
}

function feedImageKey(image: CivitaiImage) {
  if (image.id !== undefined && image.id !== null && image.id !== '') {
    return `id:${image.id}`
  }

  return `url:${image.url ?? ''}`
}

function mergeFeedImages(currentImages: CivitaiImage[], nextImages: CivitaiImage[]) {
  const seen = new Set(currentImages.map(feedImageKey))
  const merged = [...currentImages]
  for (const image of nextImages) {
    const key = feedImageKey(image)
    if (!seen.has(key)) {
      seen.add(key)
      merged.push(image)
    }
  }

  return merged
}

function normalizeNextCursor(payload: CivitaiImagesResponse) {
  const cursor = payload.metadata?.nextCursor
  return typeof cursor === 'string' && cursor.trim() ? cursor.trim() : ''
}

function versionUsesArchivedMedia(version: CivitaiModelVersion | null) {
  return imagesForVersion(version).some((image) => image.archiveSource === 'local' || Boolean(image.remoteUrl))
}

function previewUrlFor(url: string, isVideo: boolean) {
  return isVideo ? url : previewSizedImageUrl(url)
}

export function useAssetPreviewMediaFeed(options: UseAssetPreviewMediaFeedOptions) {
  const feedImages = ref<CivitaiImage[]>([])
  const feedLoading = ref(false)
  const feedLoadingMore = ref(false)
  const feedError = ref('')
  const feedNextCursor = ref('')
  const activeMediaSource = ref<'version' | 'feed'>('version')

  let feedController: AbortController | null = null
  let feedToken = 0

  const versionSlides = computed<PreviewSlide[]>(() => {
    if (!options.open.value) {
      return []
    }

    const civitaiSlides = imagesForVersion(options.selectedVersion.value).map((image, index) => {
      const url = image.url ?? ''
      const isVideo = isVideoPreview(image)

      return {
        key: `civitai:${image.id ?? index}:${image.url}`,
        url,
        previewUrl: previewUrlFor(url, isVideo),
        image,
        isVideo,
        source: image.archiveSource === 'local' || image.remoteUrl ? 'archive' as const : 'civitai' as const,
      }
    })

    if (civitaiSlides.length) {
      return civitaiSlides
    }

    return options.previewUrl
      ? [{
          key: `local:${options.previewUrl}`,
          url: options.previewUrl,
          previewUrl: previewUrlFor(options.previewUrl, options.isVideo),
          image: null,
          isVideo: options.isVideo,
          source: 'local' as const,
        }]
      : []
  })

  const feedSlides = computed<PreviewSlide[]>(() =>
    feedImages.value.map((image, index) => {
      const url = image.url ?? ''
      const isVideo = isVideoPreview(image)

      return {
        key: `feed:${image.id ?? index}:${image.url}`,
        url,
        previewUrl: previewUrlFor(url, isVideo),
        image,
        isVideo,
        source: image.archiveSource === 'local' || image.remoteUrl ? 'archive' as const : 'civitai' as const,
      }
    }),
  )

  const previewSlides = computed<PreviewSlide[]>(() => {
    return activeMediaSource.value === 'feed' && feedSlides.value.length
      ? feedSlides.value
      : versionSlides.value
  })

  const activeSlide = computed(() => previewSlides.value[options.activeImageIndex.value] ?? null)
  const canLoadMoreFeed = computed(() => Boolean(feedNextCursor.value) && !feedLoading.value)

  function selectPreviewImage(index: number) {
    if (index < 0 || index >= previewSlides.value.length) {
      return
    }

    options.activeImageIndex.value = index
  }

  function selectFeedImage(index: number) {
    if (index < 0 || index >= feedSlides.value.length) {
      return
    }

    activeMediaSource.value = 'feed'
    options.activeImageIndex.value = index
  }

  function resetFeed() {
    feedController?.abort()
    feedController = null
    feedToken += 1
    feedImages.value = []
    feedLoading.value = false
    feedLoadingMore.value = false
    feedError.value = ''
    feedNextCursor.value = ''
    activeMediaSource.value = 'version'
  }

  async function fetchFeed(modelId: number, versionId: number, cursor = '') {
    feedController?.abort()

    const controller = new AbortController()
    const requestToken = feedToken + 1
    const isLoadingMore = Boolean(cursor)
    feedController = controller
    feedToken = requestToken
    if (!isLoadingMore) {
      feedImages.value = []
    }
    feedLoading.value = !isLoadingMore
    feedLoadingMore.value = isLoadingMore
    feedError.value = ''

    const params = new URLSearchParams({
      limit: String(MEDIA_FEED_LIMIT),
      modelId: String(modelId),
      modelVersionId: String(versionId),
      sort: 'Newest',
    })
    if (options.includeNsfw.value) {
      params.set('nsfw', 'true')
    }
    if (cursor) {
      params.set('cursor', cursor)
    }

    try {
      const response = await fetch(`/api/civitai/images?${params.toString()}`, {
        headers: {
          Accept: 'application/json',
        },
        signal: controller.signal,
      })

      if (!response.ok) {
        throw new Error(`Civitai returned ${response.status}`)
      }

      const payload = (await response.json()) as CivitaiImagesResponse
      if (feedController !== controller || feedToken !== requestToken) {
        return
      }

      const nextImages = normalizeFeedImages(payload.items)
      feedImages.value = isLoadingMore
        ? mergeFeedImages(feedImages.value, nextImages)
        : nextImages
      feedNextCursor.value = normalizeNextCursor(payload)
    } catch (caughtError) {
      if (caughtError instanceof DOMException && caughtError.name === 'AbortError') {
        return
      }

      if (feedController === controller && feedToken === requestToken) {
        feedError.value = caughtError instanceof Error ? caughtError.message : 'Unable to load recent media.'
      }
    } finally {
      if (feedController === controller && feedToken === requestToken) {
        feedLoading.value = false
        feedLoadingMore.value = false
      }
    }
  }

  function loadMoreFeed() {
    const modelId = numberProp(options.model.value?.id)
    const versionId = numberProp(options.selectedVersion.value?.id)
    if (modelId === null || versionId === null || !feedNextCursor.value || feedLoading.value || feedLoadingMore.value) {
      return
    }

    void fetchFeed(modelId, versionId, feedNextCursor.value)
  }

  watch(
    () => [
      options.open.value,
      numberProp(options.model.value?.id),
      numberProp(options.selectedVersion.value?.id),
      options.includeNsfw.value,
    ] as const,
    ([isOpen, modelId, versionId]) => {
      if (!isOpen || modelId === null || versionId === null) {
        resetFeed()
        return
      }

      if (versionUsesArchivedMedia(options.selectedVersion.value)) {
        resetFeed()
        return
      }

      activeMediaSource.value = 'version'
      void fetchFeed(modelId, versionId)
    },
    { immediate: true },
  )

  watch(
    () => previewSlides.value.length,
    (count) => {
      if (count === 0) {
        options.activeImageIndex.value = 0
        return
      }

      options.activeImageIndex.value = Math.min(options.activeImageIndex.value, count - 1)
    },
    { immediate: true },
  )

  onBeforeUnmount(() => {
    feedController?.abort()
    feedController = null
    feedToken += 1
  })

  return {
    feedImages,
    feedLoading,
    feedLoadingMore,
    feedError,
    feedNextCursor,
    canLoadMoreFeed,
    feedSlides,
    previewSlides,
    activeSlide,
    selectPreviewImage,
    selectFeedImage,
    loadMoreFeed,
  }
}
