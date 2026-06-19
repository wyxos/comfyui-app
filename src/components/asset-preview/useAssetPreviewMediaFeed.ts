import { computed, onBeforeUnmount, ref, watch, type ComputedRef, type Ref } from 'vue'

import { imagesForVersion, isVideoPreview, numberProp } from './assetPreviewHelpers'
import type {
  CivitaiImage,
  CivitaiImagesResponse,
  CivitaiModel,
  CivitaiModelVersion,
  PreviewSlide,
} from './assetPreviewTypes'
import { atlasRequestId, type AtlasReactionDownloadBehavior, type AtlasReactionType } from './assetPreviewAtlasMedia'
import {
  feedRequestErrorMessage,
  MEDIA_FEED_LIMIT,
  mergeFeedImages,
  normalizeAtlasFeedImages,
  normalizeFeedImages,
  normalizeNextCursor,
  previewUrlFor,
  versionUsesArchivedMedia,
  type AtlasFeedResponse,
} from './assetPreviewFeedRequests'
import { useAssetPreviewAtlasMediaActions } from './useAssetPreviewAtlasMediaActions'
import { useAssetPreviewAtlasStatusUpdates } from './useAssetPreviewAtlasStatusUpdates'

type UseAssetPreviewMediaFeedOptions = {
  open: ComputedRef<boolean>
  model: ComputedRef<CivitaiModel | null | undefined>
  selectedVersion: ComputedRef<CivitaiModelVersion | null>
  includeNsfw: ComputedRef<boolean>
  previewUrl: string | null | undefined
  isVideo: boolean
  activeImageIndex: Ref<number>
}

export function useAssetPreviewMediaFeed(options: UseAssetPreviewMediaFeedOptions) {
  const feedImages = ref<CivitaiImage[]>([])
  const versionAtlasStatuses = ref<Record<string, CivitaiImage['atlasStatus']>>({})
  const feedLoading = ref(false)
  const feedLoadingMore = ref(false)
  const feedError = ref('')
  const feedNextCursor = ref('')
  const versionAtlasStatusesLoading = ref(false)
  const activeMediaSource = ref<'version' | 'feed'>('version')
  const {
    atlasActionError,
    atlasConfigured,
    atlasDeletePendingKey,
    atlasReactionPendingKey,
    atlasReactionPendingType,
    deleteAtlasFile,
    fetchAtlasStatuses,
    reactToAtlasImage,
  } = useAssetPreviewAtlasMediaActions({
    model: options.model,
    selectedVersion: options.selectedVersion,
  })

  let feedController: AbortController | null = null
  let versionStatusController: AbortController | null = null
  let feedToken = 0
  let feedRetryCursor = ''
  const { stopAtlasDownloadProgress, updateSharedImageStatus, watchAtlasDownloadProgress } =
    useAssetPreviewAtlasStatusUpdates({
      feedImages,
      versionAtlasStatuses,
      selectedVersion: options.selectedVersion,
      refreshAtlasStatuses: (images, signal) => fetchAtlasStatuses(images, signal, false),
    })

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
        : Object.prototype.hasOwnProperty.call(image, 'atlasStatus') ? image.atlasStatus ?? null : undefined
      const slideImage = atlasStatus === undefined ? { ...image } : { ...image, atlasStatus }

      return {
        key: `civitai:${image.id ?? index}:${image.url}`,
        url,
        previewUrl: previewUrlFor(url, isVideo),
        image: slideImage,
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
    atlasReactionPendingType.value = null
    atlasDeletePendingKey.value = ''
    atlasConfigured.value = false
    activeMediaSource.value = 'version'
    feedRetryCursor = ''
    stopAtlasDownloadProgress()
  }

  function resetVersionAtlasStatuses() {
    versionStatusController?.abort()
    stopAtlasDownloadProgress()
    versionStatusController = null
    versionAtlasStatuses.value = {}
    versionAtlasStatusesLoading.value = false
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
    feedRetryCursor = cursor
    if (!isLoadingMore) {
      feedImages.value = []
    }
    feedLoading.value = !isLoadingMore
    feedLoadingMore.value = isLoadingMore
    feedError.value = ''

    try {
      const atlasFeed = await fetchAtlasFeed(modelId, versionId, cursor, controller.signal)
      if (feedController !== controller || feedToken !== requestToken) {
        return
      }

      if (atlasFeed) {
        feedImages.value = isLoadingMore
          ? mergeFeedImages(feedImages.value, atlasFeed.images)
          : atlasFeed.images
        feedNextCursor.value = atlasFeed.nextCursor
        feedRetryCursor = ''
        return
      }

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

      const response = await fetch(`/api/civitai/images?${params.toString()}`, {
        headers: {
          Accept: 'application/json',
        },
        signal: controller.signal,
      })

      if (!response.ok) {
        throw new Error(await feedRequestErrorMessage(response))
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
      feedRetryCursor = ''
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

  async function fetchAtlasFeed(modelId: number, versionId: number, cursor: string, signal: AbortSignal) {
    const response = await fetch('/api/atlas/civitai/feed', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({
        limit: MEDIA_FEED_LIMIT,
        modelId,
        modelVersionId: versionId,
        modelType: options.model.value?.type ?? null,
        sort: 'Newest',
        ...(options.includeNsfw.value ? { nsfw: true } : {}),
        ...(cursor ? { cursor } : {}),
      }),
      signal,
    })

    if (response.status === 409) {
      atlasConfigured.value = false
      return null
    }

    if (!response.ok) {
      throw new Error(await feedRequestErrorMessage(response))
    }

    const payload = (await response.json().catch(() => null)) as AtlasFeedResponse | null
    if (payload?.configured !== true) {
      atlasConfigured.value = false
      return null
    }

    atlasConfigured.value = true
    return {
      images: normalizeAtlasFeedImages(payload.items),
      nextCursor: normalizeNextCursor(payload),
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

  function retryFeed() {
    const modelId = numberProp(options.model.value?.id)
    const versionId = numberProp(options.selectedVersion.value?.id)
    if (modelId === null || versionId === null || feedLoading.value || feedLoadingMore.value) {
      return
    }

    void fetchFeed(modelId, versionId, feedRetryCursor)
  }

  async function reactToFeedImage(
    index: number,
    type: AtlasReactionType = 'love',
    downloadBehavior: AtlasReactionDownloadBehavior = 'queue',
  ) {
    const image = feedSlides.value[index]?.image
    if (!image) {
      return
    }

    const result = await reactToAtlasImage(image, type, downloadBehavior)
    if (result) {
      updateSharedImageStatus(image, result.status)
      watchAtlasDownloadProgress(image, result.reverb)
    }
  }

  async function reactToActiveImage(
    type: AtlasReactionType = 'love',
    downloadBehavior: AtlasReactionDownloadBehavior = 'queue',
  ) {
    const image = activeSlide.value?.image
    if (!image) {
      return
    }

    const result = await reactToAtlasImage(image, type, downloadBehavior)
    if (!result) {
      return
    }

    updateSharedImageStatus(image, result.status)
    watchAtlasDownloadProgress(image, result.reverb)
  }

  async function deleteFeedAtlasImage(index: number) {
    const image = feedSlides.value[index]?.image
    if (!image) {
      return
    }

    const result = await deleteAtlasFile(image)
    if (result) {
      updateSharedImageStatus(image, result.status)
    }
  }

  async function deleteActiveAtlasImage() {
    const image = activeSlide.value?.image
    if (!image) {
      return
    }

    const result = await deleteAtlasFile(image)
    if (result) {
      updateSharedImageStatus(image, result.status)
    }
  }

  async function fetchVersionAtlasStatuses() {
    versionStatusController?.abort()
    stopAtlasDownloadProgress()
    const images = imagesForVersion(options.selectedVersion.value)
    if (!options.open.value || images.length === 0) {
      versionAtlasStatuses.value = {}
      versionAtlasStatusesLoading.value = false
      return
    }

    const controller = new AbortController()
    versionStatusController = controller
    versionAtlasStatusesLoading.value = true
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
    } finally {
      if (versionStatusController === controller) {
        versionAtlasStatusesLoading.value = false
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
    stopAtlasDownloadProgress()
    feedController = null
    versionStatusController = null
    feedToken += 1
  })

  return {
    feedImages, feedLoading, feedLoadingMore, feedError, atlasActionError, atlasDeletePendingKey,
    atlasReactionPendingKey, atlasReactionPendingType, atlasConfigured, feedNextCursor, versionAtlasStatusesLoading,
    canLoadMoreFeed, feedSlides, previewSlides, activeSlide, selectPreviewImage, selectFeedImage,
    loadMoreFeed, retryFeed, reactToFeedImage, reactToActiveImage, deleteFeedAtlasImage, deleteActiveAtlasImage,
  }
}
