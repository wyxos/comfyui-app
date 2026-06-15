import { computed, onBeforeUnmount, ref, watch, type ComputedRef, type Ref } from 'vue'

import { imagesForVersion, isVideoPreview, numberProp } from './assetPreviewHelpers'
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
  previewUrl: string | null | undefined
  isVideo: boolean
  activeImageIndex: Ref<number>
}

function normalizeFeedImages(items: CivitaiImage[] | null | undefined) {
  return (items ?? [])
    .filter((image) => Boolean(image?.url))
    .slice(0, MEDIA_FEED_LIMIT)
}

export function useAssetPreviewMediaFeed(options: UseAssetPreviewMediaFeedOptions) {
  const feedImages = ref<CivitaiImage[]>([])
  const feedLoading = ref(false)
  const feedError = ref('')
  const activeMediaSource = ref<'version' | 'feed'>('version')

  let feedController: AbortController | null = null
  let feedToken = 0

  const versionSlides = computed<PreviewSlide[]>(() => {
    if (!options.open.value) {
      return []
    }

    const civitaiSlides = imagesForVersion(options.selectedVersion.value).map((image, index) => ({
      key: `civitai:${image.id ?? index}:${image.url}`,
      url: image.url ?? '',
      image,
      isVideo: isVideoPreview(image),
      source: image.archiveSource === 'local' || image.remoteUrl ? 'archive' as const : 'civitai' as const,
    }))

    if (civitaiSlides.length) {
      return civitaiSlides
    }

    return options.previewUrl
      ? [{
          key: `local:${options.previewUrl}`,
          url: options.previewUrl,
          image: null,
          isVideo: options.isVideo,
          source: 'local' as const,
        }]
      : []
  })

  const feedSlides = computed<PreviewSlide[]>(() =>
    feedImages.value.map((image, index) => ({
      key: `feed:${image.id ?? index}:${image.url}`,
      url: image.url ?? '',
      image,
      isVideo: isVideoPreview(image),
      source: image.archiveSource === 'local' || image.remoteUrl ? 'archive' as const : 'civitai' as const,
    })),
  )

  const previewSlides = computed<PreviewSlide[]>(() => {
    return activeMediaSource.value === 'feed' && feedSlides.value.length
      ? feedSlides.value
      : versionSlides.value
  })

  const activeSlide = computed(() => previewSlides.value[options.activeImageIndex.value] ?? null)

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
    feedError.value = ''
    activeMediaSource.value = 'version'
  }

  async function fetchFeed(modelId: number, versionId: number) {
    feedController?.abort()

    const controller = new AbortController()
    const requestToken = feedToken + 1
    feedController = controller
    feedToken = requestToken
    feedImages.value = []
    feedLoading.value = true
    feedError.value = ''

    const params = new URLSearchParams({
      limit: String(MEDIA_FEED_LIMIT),
      modelId: String(modelId),
      modelVersionId: String(versionId),
      sort: 'Newest',
    })

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

      feedImages.value = normalizeFeedImages(payload.items)
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
      }
    }
  }

  watch(
    () => [
      options.open.value,
      numberProp(options.model.value?.id),
      numberProp(options.selectedVersion.value?.id),
    ] as const,
    ([isOpen, modelId, versionId]) => {
      if (!isOpen || modelId === null || versionId === null) {
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
    feedError,
    feedSlides,
    previewSlides,
    activeSlide,
    selectPreviewImage,
    selectFeedImage,
  }
}
