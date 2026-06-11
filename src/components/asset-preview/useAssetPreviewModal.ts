import { computed, onBeforeUnmount, ref, watch } from 'vue'
import {
  civitaiModelWebUrl,
  extractImageMeta,
  formatMeta,
  imageDimensions,
  imagesForVersion,
  isVideoPreview,
  modelVersionLabel,
  numberProp,
  normalizeImageMeta,
  preloadImage,
  primaryFileForVersion,
  selectedVersionFor,
  versionDownloadUnavailableLabel,
} from './assetPreviewHelpers'
import type {
  AssetPreviewDownload,
  AssetPreviewModalProps,
  CivitaiImage,
  CivitaiImagesResponse,
  CivitaiModel,
  CivitaiModelsResponse,
  CivitaiModelVersion,
  PreviewSlide,
} from './assetPreviewTypes'
import { useAssetPreviewArchiveFallback } from './useAssetPreviewArchiveFallback'
import { useAssetPreviewImageSafety } from './useAssetPreviewImageSafety'
import { useAssetPreviewNavigationEvents } from './useAssetPreviewNavigationEvents'
import { useConfirmDialog } from '../../composables/useConfirmDialog'

export function useAssetPreviewModal(props: Readonly<AssetPreviewModalProps>, emitClose: () => void) {
  const confirm = useConfirmDialog()
  const fetchedModel = ref<CivitaiModel | null>(null)
  const imageDetails = ref<Record<string, CivitaiImage>>({})
  const civitaiLoading = ref(false)
  const civitaiError = ref('')
  const imageMetaLoading = ref(false)
  const imageMetaError = ref('')
  const activeVersionId = ref<number | null>(null)
  const activeImageIndex = ref(0)
  const displayedImageUrl = ref('')
  const mediaLoading = ref(false)

  let civitaiController: AbortController | null = null
  let imageDetailsController: AbortController | null = null
  let mediaLoadToken = 0
  let imageDetailsToken = 0
  const normalizedModelId = computed(() => numberProp(props.modelId))
  const normalizedVersionId = computed(() => numberProp(props.versionId))
  const canLookupCivitai = computed(() => !props.model && normalizedModelId.value !== null)
  const { archiveModel, canLookupArchive, fetchLocalArchive, resetArchive } =
    useAssetPreviewArchiveFallback(props, setInitialVersion)
  const civitaiModel = computed(() => props.model ?? fetchedModel.value ?? archiveModel.value)
  const modelVersions = computed(() => civitaiModel.value?.modelVersions ?? [])
  const selectedVersion = computed(() => selectedVersionFor(modelVersions, activeVersionId))
  const selectedVersionImages = computed(() => imagesForVersion(selectedVersion.value))
  const previewSlides = computed<PreviewSlide[]>(() => {
    if (!props.open) {
      return []
    }

    const civitaiSlides = selectedVersionImages.value.map((image, index) => ({
      key: `civitai:${image.id ?? index}:${image.url}`,
      url: image.url ?? '',
      image,
      isVideo: isVideoPreview(image),
      source: image.archiveSource === 'local' || image.remoteUrl ? 'archive' as const : 'civitai' as const,
    }))

    if (civitaiSlides.length) {
      return civitaiSlides
    }
    return props.previewUrl
      ? [{
          key: `local:${props.previewUrl}`,
          url: props.previewUrl,
          image: null,
          isVideo: props.isVideo === true,
          source: 'local' as const,
        }]
      : []
  })
  const activeSlide = computed(() => previewSlides.value[activeImageIndex.value] ?? null)
  const activeImage = computed(() => activeSlide.value?.image ?? null)
  const activeDetailedImage = computed(() => {
    const id = activeImage.value?.id
    return id === undefined || id === null ? null : imageDetails.value[String(id)] ?? null
  })
  const imageSafety = useAssetPreviewImageSafety({
    activeDetailedImage,
    activeImage,
    activeSlide,
    civitaiModel,
    props,
  })
  const activeImageMetaSource = computed(() => {
    return extractImageMeta(activeDetailedImage.value?.meta ?? activeImage.value?.meta)
  })
  const activeImageMeta = computed(() => formatMeta(activeImageMetaSource.value))
  const normalizedImageMetaRows = computed(() => normalizeImageMeta(activeImageMetaSource.value))
  const activeTriggerWords = computed(() => {
    const words = selectedVersion.value?.trainedWords?.length
      ? selectedVersion.value.trainedWords
      : props.trainedWords ?? []

    return words.filter((word) => typeof word === 'string' && word.trim()).map((word) => word.trim())
  })
  const activePrimaryFile = computed(() => primaryFileForVersion(selectedVersion.value))
  const modalTitle = computed(() => civitaiModel.value?.name ?? props.title ?? 'Preview')
  const modalSubtitle = computed(() => {
    const versionLabel = selectedVersion.value ? modelVersionLabel(selectedVersion.value) : ''
    return versionLabel || props.subtitle || props.fileName || ''
  })
  const modelTypeLabel = computed(() => civitaiModel.value?.type ?? props.modelType ?? props.kindLabel ?? 'Preview')
  const baseModelLabel = computed(() => selectedVersion.value?.baseModel ?? props.baseModel ?? 'Unknown')
  const creatorUsername = computed(() => civitaiModel.value?.creator?.username?.trim() ?? '')
  const creatorLabel = computed(() => creatorUsername.value || 'Unknown creator')
  const creatorAssetsRoute = computed(() => {
    return creatorUsername.value
      ? { name: 'assets', query: { username: creatorUsername.value } }
      : null
  })
  const civitaiModelUrl = computed(() => {
    return civitaiModel.value ? civitaiModelWebUrl(civitaiModel.value) : ''
  })
  const shouldRenderModal = computed(() => {
    return props.open && (props.previewUrl || canLookupCivitai.value || canLookupArchive.value || Boolean(civitaiModel.value))
  })
  const hasDownloadActions = computed(() => props.showDownloadActions === true && Boolean(civitaiModel.value))

  async function fetchCivitaiModel() {
    civitaiController?.abort()
    fetchedModel.value = null
    resetArchive()
    civitaiError.value = ''
    if (!canLookupCivitai.value || !props.open) {
      civitaiLoading.value = canLookupArchive.value && props.open
      await fetchLocalArchive()
      civitaiLoading.value = false
      return
    }
    const controller = new AbortController()
    civitaiController = controller
    civitaiLoading.value = true

    const params = new URLSearchParams({
      ids: String(normalizedModelId.value),
      limit: '1',
      nsfw: 'true',
    })
    try {
      const response = await fetch(`/api/civitai/models?${params.toString()}`, {
        headers: {
          Accept: 'application/json',
        },
        signal: controller.signal,
      })

      if (!response.ok) {
        throw new Error(`Civitai returned ${response.status}`)
      }

      const payload = (await response.json()) as CivitaiModelsResponse
      const nextModel = payload.items?.find((model) => model.id === normalizedModelId.value) ?? payload.items?.[0] ?? null

      if (civitaiController !== controller) {
        return
      }

      fetchedModel.value = nextModel
      setInitialVersion(nextModel)
      if (!nextModel) {
        const loadedArchive = await fetchLocalArchive()
        if (civitaiController === controller && !loadedArchive) {
          civitaiError.value = 'No Civitai model was returned for this local asset.'
        }
      }
    } catch (caughtError) {
      if (caughtError instanceof DOMException && caughtError.name === 'AbortError') {
        return
      }

      if (civitaiController === controller) {
        const loadedArchive = await fetchLocalArchive()
        if (civitaiController === controller && !loadedArchive) {
          civitaiError.value = caughtError instanceof Error ? caughtError.message : 'Unable to load Civitai model data.'
        }
      }
    } finally {
      if (civitaiController === controller) {
        civitaiLoading.value = false
      }
    }
  }

  async function fetchImageDetails(imageId: string | number) {
    imageDetailsController?.abort()

    const controller = new AbortController()
    const requestToken = imageDetailsToken + 1
    imageDetailsController = controller
    imageDetailsToken = requestToken
    imageMetaLoading.value = true
    imageMetaError.value = ''

    const params = new URLSearchParams({
      imageId: String(imageId),
      limit: '1',
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
      const image = payload.items?.find((item) => String(item.id) === String(imageId)) ?? payload.items?.[0] ?? null

      if (imageDetailsController !== controller || imageDetailsToken !== requestToken) {
        return
      }

      if (image) {
        imageDetails.value = {
          ...imageDetails.value,
          [String(imageId)]: image,
        }
      }
    } catch (caughtError) {
      if (caughtError instanceof DOMException && caughtError.name === 'AbortError') {
        return
      }

      if (imageDetailsController === controller && imageDetailsToken === requestToken) {
        imageMetaError.value = caughtError instanceof Error ? caughtError.message : 'Unable to load image metadata.'
      }
    } finally {
      if (imageDetailsController === controller && imageDetailsToken === requestToken) {
        imageMetaLoading.value = false
      }
    }
  }

  function setInitialVersion(model: CivitaiModel | null | undefined) {
    const versionFromProps = model?.modelVersions?.find((version) => version.id === normalizedVersionId.value)
    activeVersionId.value = versionFromProps?.id ?? model?.modelVersions?.[0]?.id ?? null
    activeImageIndex.value = 0
  }

  function close() {
    emitClose()
  }
  function selectVersion(version: CivitaiModelVersion) {
    activeVersionId.value = version.id
    activeImageIndex.value = 0
  }

  function showPreviousImage() {
    const total = previewSlides.value.length
    if (total >= 2) {
      activeImageIndex.value = (activeImageIndex.value - 1 + total) % total
    }
  }

  function showNextImage() {
    const total = previewSlides.value.length
    if (total >= 2) {
      activeImageIndex.value = (activeImageIndex.value + 1) % total
    }
  }

  function handleModalVideoReady(url: string) {
    if (displayedImageUrl.value === url) {
      mediaLoading.value = false
    }
  }

  function downloadForVersion(version: CivitaiModelVersion | null | undefined) {
    return props.downloadForVersion?.(version) ?? null
  }

  function downloadStatusLabel(download: AssetPreviewDownload | null) {
    return props.downloadStatusLabel?.(download) ?? ''
  }

  function modelDownloadKey(model: CivitaiModel, version: CivitaiModelVersion) {
    return props.modelDownloadKey?.(model, version) ?? `${model.id}:${version.id}`
  }

  function canQueueVersion(version: CivitaiModelVersion) {
    if (props.canQueueVersion) {
      return props.canQueueVersion(version)
    }

    const file = primaryFileForVersion(version)
    return Boolean(props.queueAssetDownload && file?.downloadUrl && file.name && !versionDownloadUnavailableLabel(version))
  }

  function canDeleteVersionDownload(version: CivitaiModelVersion) {
    const download = downloadForVersion(version)
    return Boolean(props.deleteAssetDownload && download?.id && download.state === 'complete')
  }

  function versionDownloadButtonLabel(version: CivitaiModelVersion) {
    if (props.versionDownloadButtonLabel) {
      return props.versionDownloadButtonLabel(version)
    }

    const unavailableLabel = versionDownloadUnavailableLabel(version)
    if (unavailableLabel) {
      return unavailableLabel
    }

    return downloadForVersion(version)?.state === 'complete'
      ? 'Re-download'
      : downloadStatusLabel(downloadForVersion(version)) || 'Download'
  }

  function queueVersionDownload(version: CivitaiModelVersion) {
    if (!civitaiModel.value || !props.queueAssetDownload) {
      return
    }

    void props.queueAssetDownload(civitaiModel.value, version)
  }

  async function deleteVersionDownload(version: CivitaiModelVersion) {
    const download = downloadForVersion(version)
    if (!download || !props.deleteAssetDownload) {
      return
    }

    const fileName = download.fileName || primaryFileForVersion(version)?.name || modelVersionLabel(version)
    const confirmed = await confirm({ title: 'Delete downloaded file?', description: `Delete ${fileName} from disk? The download record will remain for redownload.`, confirmLabel: 'Delete file', destructive: true })
    if (!confirmed) {
      return
    }

    void props.deleteAssetDownload(download, version)
  }

  watch(
    () => [props.open, props.model?.id ?? null, normalizedModelId.value, normalizedVersionId.value, props.modelType, props.fileName],
    () => {
      if (props.open) {
        imageDetails.value = {}
        imageDetailsController?.abort()
        resetArchive()
        imageMetaLoading.value = false
        imageMetaError.value = ''

        if (props.model) {
          civitaiController?.abort()
          resetArchive()
          fetchedModel.value = null
          civitaiError.value = ''
          civitaiLoading.value = false
          setInitialVersion(props.model)
          return
        }

        void fetchCivitaiModel()
        return
      }

      civitaiController?.abort()
      resetArchive()
      imageDetailsController?.abort()
      fetchedModel.value = null
      civitaiError.value = ''
      civitaiLoading.value = false
      imageMetaLoading.value = false
      imageMetaError.value = ''
      activeVersionId.value = null
      activeImageIndex.value = 0
      displayedImageUrl.value = ''
      mediaLoading.value = false
    },
    { immediate: true },
  )

  watch(
    () => activeSlide.value?.url ?? '',
    async (url) => {
      const loadToken = mediaLoadToken + 1
      mediaLoadToken = loadToken

      if (!url) {
        displayedImageUrl.value = ''
        mediaLoading.value = false
        return
      }

      mediaLoading.value = true
      displayedImageUrl.value = ''

      if (activeSlide.value?.isVideo) {
        displayedImageUrl.value = url
        return
      }

      try {
        await preloadImage(url)
      } catch {
        // Let the native media element show its failure state.
      } finally {
        if (mediaLoadToken === loadToken) {
          displayedImageUrl.value = url
          mediaLoading.value = false
        }
      }
    },
    { immediate: true },
  )

  watch(
    () => activeImage.value?.id,
    (imageId) => {
      imageDetailsController?.abort()
      imageDetailsToken += 1
      imageMetaLoading.value = false
      imageMetaError.value = ''

      if (
        imageId === undefined ||
        imageId === null ||
        imageDetails.value[String(imageId)] ||
        activeSlide.value?.source === 'archive'
      ) {
        return
      }

      void fetchImageDetails(imageId)
    },
    { immediate: true },
  )

  useAssetPreviewNavigationEvents(() => props.open, { close, showNextImage, showPreviousImage })

  onBeforeUnmount(() => {
    civitaiController?.abort()
    resetArchive()
    imageDetailsController?.abort()
  })

  return {
    civitaiModel,
    civitaiLoading,
    civitaiError,
    imageMetaLoading,
    imageMetaError,
    activeImageIndex,
    displayedImageUrl,
    mediaLoading,
    modelVersions,
    selectedVersion,
    previewSlides,
    activeSlide,
    activeImage,
    ...imageSafety,
    activeImageMetaSource,
    activeImageMeta,
    normalizedImageMetaRows,
    activeTriggerWords,
    activePrimaryFile,
    modalTitle,
    modalSubtitle,
    modelTypeLabel,
    baseModelLabel,
    creatorLabel,
    creatorAssetsRoute,
    civitaiModelUrl,
    shouldRenderModal,
    hasDownloadActions,
    close,
    selectVersion,
    showPreviousImage,
    showNextImage,
    handleModalVideoReady,
    downloadForVersion,
    downloadStatusLabel,
    modelDownloadKey,
    canQueueVersion,
    canDeleteVersionDownload,
    versionDownloadButtonLabel,
    queueVersionDownload,
    deleteVersionDownload,
    imageDimensions,
  }
}
