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

const atlasStatusPollDelayMs = 2500
const atlasStatusPollMaxMs = 120000

type UseAssetPreviewAtlasStatusUpdatesOptions = {
  feedImages: Ref<CivitaiImage[]>
  versionAtlasStatuses: Ref<Record<string, CivitaiImage['atlasStatus']>>
  selectedVersion: ComputedRef<CivitaiModelVersion | null>
  refreshAtlasStatuses?: (images: CivitaiImage[], signal: AbortSignal) => Promise<CivitaiImage[]>
}

export function useAssetPreviewAtlasStatusUpdates(options: UseAssetPreviewAtlasStatusUpdatesOptions) {
  const watchedImages = new Map<string, CivitaiImage>()
  let progressSubscription: AtlasDownloadProgressSubscription | null = null
  let progressSubscriptionKey = ''
  let statusPollTimer: number | undefined
  let statusPollController: AbortController | null = null
  let statusPollStartedAt = 0
  let statusPollInFlight = false

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

  function statusIsTerminal(status: CivitaiImage['atlasStatus']) {
    const downloadStatus = String(status?.download?.status ?? '').trim().toLowerCase()
    return status?.downloaded === true ||
      Boolean(status?.downloaded_at || status?.download?.downloaded_at) ||
      downloadStatus === 'completed' ||
      downloadStatus === 'complete' ||
      downloadStatus === 'failed' ||
      downloadStatus === 'canceled' ||
      downloadStatus === 'cancelled'
  }

  function clearStatusPollingFallback() {
    if (statusPollTimer !== undefined) {
      window.clearTimeout(statusPollTimer)
      statusPollTimer = undefined
    }

    statusPollController?.abort()
    statusPollController = null
    statusPollInFlight = false
    statusPollStartedAt = 0
  }

  function shouldContinueStatusPolling() {
    if (!watchedImages.size || !options.refreshAtlasStatuses) {
      return false
    }

    const elapsedMs = statusPollStartedAt ? Date.now() - statusPollStartedAt : 0
    if (elapsedMs > atlasStatusPollMaxMs) {
      return false
    }

    return [...watchedImages.values()].some((image) => !statusIsTerminal(statusForImage(image)))
  }

  function scheduleStatusPollingFallback(delayMs = atlasStatusPollDelayMs) {
    if (statusPollTimer !== undefined || !shouldContinueStatusPolling()) {
      return
    }

    statusPollTimer = window.setTimeout(() => {
      statusPollTimer = undefined
      void pollAtlasStatusesFallback()
    }, delayMs)
  }

  async function pollAtlasStatusesFallback() {
    if (statusPollInFlight || !shouldContinueStatusPolling() || !options.refreshAtlasStatuses) {
      return
    }

    statusPollInFlight = true
    const controller = new AbortController()
    statusPollController = controller
    const images = [...watchedImages.values()]

    try {
      const refreshedImages = await options.refreshAtlasStatuses(images, controller.signal)
      if (statusPollController !== controller) {
        return
      }

      refreshedImages.forEach((image, index) => {
        if (image.atlasStatus !== undefined) {
          updateSharedImageStatus(images[index] ?? image, image.atlasStatus ?? null)
        }
      })
    } catch (caughtError) {
      if (caughtError instanceof DOMException && caughtError.name === 'AbortError') {
        return
      }
    } finally {
      if (statusPollController === controller) {
        statusPollController = null
        statusPollInFlight = false
        scheduleStatusPollingFallback()
      }
    }
  }

  function stopAtlasDownloadProgress() {
    progressSubscription?.close()
    progressSubscription = null
    progressSubscriptionKey = ''
    watchedImages.clear()
    clearStatusPollingFallback()
  }

  function watchAtlasDownloadProgress(image: CivitaiImage, reverb: AtlasReverbConfig | null | undefined) {
    watchedImages.set(atlasMediaKey(image), image)
    if (!statusPollStartedAt) {
      statusPollStartedAt = Date.now()
    }
    scheduleStatusPollingFallback()

    if (reverb?.enabled !== true) {
      return
    }

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
