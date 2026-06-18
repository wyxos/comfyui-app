import type { ComputedRef, Ref } from 'vue'

import { imagesForVersion } from './assetPreviewHelpers'
import {
  atlasDownloadProgressEventMatchesImage,
  atlasImagesShareIdentity,
  atlasMediaKey,
  atlasRequestId,
  statusFromAtlasDownloadProgressEvent,
  type AtlasReverbConfig,
} from './assetPreviewAtlasMedia'
import type { CivitaiImage, CivitaiModelVersion } from './assetPreviewTypes'
import {
  subscribeAtlasDownloadProgress,
  type AtlasDownloadProgressSubscription,
} from './assetPreviewAtlasDownloadProgress'

type UseAssetPreviewAtlasStatusUpdatesOptions = {
  feedImages: Ref<CivitaiImage[]>
  versionAtlasStatuses: Ref<Record<string, CivitaiImage['atlasStatus']>>
  selectedVersion: ComputedRef<CivitaiModelVersion | null>
}

export function useAssetPreviewAtlasStatusUpdates(options: UseAssetPreviewAtlasStatusUpdatesOptions) {
  const watchedImages = new Map<string, CivitaiImage>()
  let progressSubscription: AtlasDownloadProgressSubscription | null = null
  let progressSubscriptionKey = ''

  function updateFeedImageStatusFor(image: CivitaiImage, status: CivitaiImage['atlasStatus']) {
    options.feedImages.value = options.feedImages.value.map((candidate) => (
      atlasImagesShareIdentity(candidate, image)
        ? { ...candidate, atlasStatus: status }
        : candidate
    ))
  }

  function updateVersionImageStatusFor(image: CivitaiImage, status: CivitaiImage['atlasStatus']) {
    const nextStatuses = { ...options.versionAtlasStatuses.value }
    let matched = false

    for (const candidate of imagesForVersion(options.selectedVersion.value)) {
      if (atlasImagesShareIdentity(candidate, image)) {
        nextStatuses[atlasRequestId(candidate)] = status
        matched = true
      }
    }

    if (!matched) {
      nextStatuses[atlasRequestId(image)] = status
    }

    options.versionAtlasStatuses.value = nextStatuses
  }

  function updateSharedImageStatus(image: CivitaiImage, status: CivitaiImage['atlasStatus']) {
    updateFeedImageStatusFor(image, status)
    updateVersionImageStatusFor(image, status)
  }

  function statusForImage(image: CivitaiImage) {
    const requestId = atlasRequestId(image)
    if (requestId in options.versionAtlasStatuses.value) {
      return options.versionAtlasStatuses.value[requestId] ?? null
    }

    return options.feedImages.value.find((candidate) => atlasImagesShareIdentity(candidate, image))?.atlasStatus ??
      image.atlasStatus ??
      null
  }

  function progressConfigKey(config: AtlasReverbConfig) {
    return [
      config.scheme ?? '',
      config.host ?? '',
      config.port ?? '',
      config.key ?? '',
      config.channel ?? '',
    ].join('|')
  }

  function stopAtlasDownloadProgress() {
    progressSubscription?.close()
    progressSubscription = null
    progressSubscriptionKey = ''
    watchedImages.clear()
  }

  function watchAtlasDownloadProgress(image: CivitaiImage, reverb: AtlasReverbConfig | null | undefined) {
    if (reverb?.enabled !== true) {
      return
    }

    watchedImages.set(atlasMediaKey(image), image)
    const nextKey = progressConfigKey(reverb)
    if (progressSubscription && progressSubscriptionKey === nextKey) {
      return
    }

    progressSubscription?.close()
    progressSubscriptionKey = nextKey
    progressSubscription = subscribeAtlasDownloadProgress(reverb, (event) => {
      for (const watchedImage of watchedImages.values()) {
        const currentStatus = statusForImage(watchedImage)
        if (!atlasDownloadProgressEventMatchesImage(watchedImage, currentStatus, event)) {
          continue
        }

        updateSharedImageStatus(watchedImage, statusFromAtlasDownloadProgressEvent(currentStatus, event))
      }
    })
  }

  return {
    stopAtlasDownloadProgress,
    updateSharedImageStatus,
    watchAtlasDownloadProgress,
  }
}
