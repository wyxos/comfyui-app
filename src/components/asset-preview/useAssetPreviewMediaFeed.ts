import { computed, onBeforeUnmount, ref, watch, type ComputedRef, type Ref } from 'vue'

import { imagesForVersion, isVideoPreview, numberProp, previewSizedImageUrl } from './assetPreviewHelpers'
import type {
  CivitaiImage,
  CivitaiImagesResponse,
  CivitaiModel,
  CivitaiModelVersion,
  PreviewSlide,
} from './assetPreviewTypes'
import {
  atlasMediaKey,
  atlasRequestId,
  type AtlasReactionType,
} from './assetPreviewAtlasMedia'
import { useAssetPreviewAtlasMediaActions } from './useAssetPreviewAtlasMediaActions'

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

function mergeFeedImages(currentImages: CivitaiImage[], nextImages: CivitaiImage[]) {
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
  const versionAtlasStatuses = ref<Record<string, CivitaiImage['atlasStatus']>>({})
  const feedLoading = ref(false)
  const feedLoadingMore = ref(false)
  const feedError = ref('')
  const feedNextCursor = ref('')
  const activeMediaSource = ref<'version' | 'feed'>('version')
  const {
    atlasActionError,
    atlasConfigured,
    atlasReactionPendingKey,
    fetchAtlasStatuses,
    reactToAtlasImage,
  } = useAssetPreviewAtlasMediaActions({
    model: options.model,
    selectedVersion: options.selectedVersion,
  })

  let feedController: AbortController | null = null
  let versionStatusController: AbortController | null = null
  let feedToken = 0

  const versionSlides = computed<PreviewSlide[]>(() => {
    if (!options.open.value) {
      return []
    }

    const civitaiSlides = imagesForVersion(options.selectedVersion.value).map((image, index) => {
      const url = image.url ?? ''
      const isVideo = isVideoPreview(image)
      const requestId = atlasRequestId(image)
      const atlasStatus = requestId in versionAtlasStatuses.value
        ? versionAtlasStatuses.value[requestId] ?? null
        : image.atlasStatus ?? null

      return {
        key: `civitai:${image.id ?? index}:${image.url}`,
        url,
        previewUrl: previewUrlFor(url, isVideo),
        image: { ...image, atlasStatus },
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
    atlasActionError.value = ''
    atlasReactionPendingKey.value = ''
    atlasConfigured.value = false
    activeMediaSource.value = 'version'
  }

  function resetVersionAtlasStatuses() {
    versionStatusController?.abort()
    versionStatusController = null
    versionAtlasStatuses.value = {}
  }

  function storeVersionAtlasStatuses(images: CivitaiImage[]) {
    versionAtlasStatuses.value = Object.fromEntries(
      images.map((image) => [atlasRequestId(image), image.atlasStatus ?? null]),
    )
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

      const nextImages = await fetchAtlasStatuses(normalizeFeedImages(payload.items), controller.signal, true)
      if (feedController !== controller || feedToken !== requestToken) {
        return
      }

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

  function updateFeedImageStatus(key: string, status: CivitaiImage['atlasStatus']) {
    feedImages.value = feedImages.value.map((candidate) => (
      atlasMediaKey(candidate) === key
        ? { ...candidate, atlasStatus: status }
        : candidate
    ))
  }

  async function reactToFeedImage(index: number, type: AtlasReactionType = 'love') {
    const image = feedSlides.value[index]?.image
    if (!image) {
      return
    }

    const result = await reactToAtlasImage(image, type)
    if (result) {
      updateFeedImageStatus(result.key, result.status)
    }
  }

  async function reactToActiveImage(type: AtlasReactionType = 'love') {
    const image = activeSlide.value?.image
    if (!image) {
      return
    }

    const result = await reactToAtlasImage(image, type)
    if (!result) {
      return
    }

    if (activeMediaSource.value === 'feed') {
      updateFeedImageStatus(result.key, result.status)
      return
    }

    versionAtlasStatuses.value = {
      ...versionAtlasStatuses.value,
      [atlasRequestId(image)]: result.status,
    }
  }

  async function fetchVersionAtlasStatuses() {
    versionStatusController?.abort()
    const images = imagesForVersion(options.selectedVersion.value)
    if (!options.open.value || images.length === 0) {
      versionAtlasStatuses.value = {}
      return
    }

    const controller = new AbortController()
    versionStatusController = controller
    try {
      const imagesWithStatuses = await fetchAtlasStatuses(images, controller.signal, false)
      if (versionStatusController === controller) {
        storeVersionAtlasStatuses(imagesWithStatuses)
      }
    } catch (caughtError) {
      if (caughtError instanceof DOMException && caughtError.name === 'AbortError') {
        return
      }

      if (versionStatusController === controller) {
        storeVersionAtlasStatuses(images)
      }
    }
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
        resetVersionAtlasStatuses()
        return
      }

      void fetchVersionAtlasStatuses()

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
    versionStatusController?.abort()
    feedController = null
    versionStatusController = null
    feedToken += 1
  })

  return {
    feedImages,
    feedLoading,
    feedLoadingMore,
    feedError,
    atlasActionError,
    atlasReactionPendingKey,
    atlasConfigured,
    feedNextCursor,
    canLoadMoreFeed,
    feedSlides,
    previewSlides,
    activeSlide,
    selectPreviewImage,
    selectFeedImage,
    loadMoreFeed,
    reactToFeedImage,
    reactToActiveImage,
  }
}
