import type { ComputedRef, Ref } from 'vue'
import { versionDownloadUnavailableLabel } from '../../components/asset-preview/assetPreviewHelpers'
import type { ConfirmDialogFn } from '../../composables/useConfirmDialog'
import type {
  AssetDownloadItem,
  QueueDownloadPayload,
  WatchDownloadPayload,
  WatchedAssetDownloadItem,
} from '../../composables/useAssetDownloads'
import {
  canQueueVersion as canQueueCivitaiVersion,
  modelDownloadKey,
  previewImageForVersion,
  previewImagesForVersion,
  primaryFileForVersion,
  versionsForModel,
} from './assetModelHelpers'
import type { CivitaiModel, CivitaiModelVersion } from './assetViewTypes'

type DownloadActionState = {
  downloadByVersionId: ComputedRef<Map<number, AssetDownloadItem[]>>
  watchedByVersionId?: ComputedRef<Map<number, WatchedAssetDownloadItem[]>>
  downloadActionError: Ref<string>
  downloadActionNotice: Ref<string>
  openDownloadMenuKey: Ref<string>
  queuingDownloadKey: Ref<string>
  queueDownload: (payload: QueueDownloadPayload) => Promise<unknown>
  watchDownload?: (payload: WatchDownloadPayload) => Promise<unknown>
  unwatchDownload?: (id: string) => Promise<unknown>
  confirm: ConfirmDialogFn
  onDownloadQueued?: (model: CivitaiModel) => void
}

type QueueAssetDownloadOptions = {
  closeMenu?: boolean
  showNotice?: boolean
}

export function createAssetDownloadActions(state: DownloadActionState) {
  function downloadsForVersion(version: CivitaiModelVersion | null | undefined) {
    if (!version) {
      return []
    }

    return state.downloadByVersionId.value.get(version.id) ?? []
  }

  function downloadForVersion(version: CivitaiModelVersion | null | undefined) {
    return downloadsForVersion(version)[0] ?? null
  }

  function watchedDownloadsForVersion(version: CivitaiModelVersion | null | undefined) {
    if (!version) {
      return []
    }

    return state.watchedByVersionId?.value.get(version.id) ?? []
  }

  function watchedDownloadForVersion(version: CivitaiModelVersion | null | undefined) {
    return watchedDownloadsForVersion(version)
      .find((item) => item.state !== 'cancelled') ?? null
  }

  function canWatchVersion(version: CivitaiModelVersion | null | undefined) {
    const file = primaryFileForVersion(version)
    return Boolean(
      state.watchDownload &&
      file?.name &&
      versionDownloadUnavailableLabel(version) === 'Early access locked',
    )
  }

  function canUnwatchVersion(version: CivitaiModelVersion | null | undefined) {
    const watchedDownload = watchedDownloadForVersion(version)
    return Boolean(
      state.unwatchDownload &&
      watchedDownload?.id &&
      (watchedDownload.state === 'watching' || watchedDownload.state === 'attention'),
    )
  }

  function canActOnVersionDownload(version: CivitaiModelVersion | null | undefined) {
    return canQueueCivitaiVersion(version) || canWatchVersion(version) || canUnwatchVersion(version)
  }

  function hasDownloadedVersion(model: CivitaiModel) {
    return versionsForModel(model).some((version) =>
      downloadsForVersion(version).some((download) => download.state === 'complete'),
    )
  }

  function activeDownloadForModel(model: CivitaiModel) {
    return versionsForModel(model)
      .flatMap((version) => downloadsForVersion(version))
      .find((download) => ['queued', 'downloading', 'paused'].includes(download.state)) ?? null
  }

  function isVersionQueuing(model: CivitaiModel, version: CivitaiModelVersion | null | undefined) {
    return version ? state.queuingDownloadKey.value === modelDownloadKey(model, version) : false
  }

  function isModelDownloadQueuing(model: CivitaiModel) {
    return versionsForModel(model).some((version) => isVersionQueuing(model, version))
  }

  function downloadStatusLabel(download: AssetDownloadItem | null) {
    if (!download) {
      return ''
    }

    if (download.state === 'complete') {
      return 'Downloaded'
    }

    if (download.state === 'downloading') {
      return download.progressPercent === null || download.progressPercent === undefined
        ? 'Downloading'
        : `${Math.round(download.progressPercent)}%`
    }

    if (download.state === 'queued') {
      return 'Queued'
    }

    if (download.state === 'paused') {
      return 'Paused'
    }

    return download.state === 'error' ? 'Retry' : 'Cancelled'
  }

  function versionDownloadButtonLabel(version: CivitaiModelVersion | null | undefined) {
    const download = downloadForVersion(version)
    if (download) {
      return download.state === 'complete' ? 'Re-download' : downloadStatusLabel(download)
    }

    const watchedDownload = watchedDownloadForVersion(version)
    if (watchedDownload) {
      if (watchedDownload.state === 'queued') {
        return 'Queued'
      }

      if (watchedDownload.state === 'attention') {
        return 'Retry watch'
      }

      return 'Watching'
    }

    const unavailableLabel = versionDownloadUnavailableLabel(version)
    if (unavailableLabel === 'Early access locked' && canWatchVersion(version)) {
      return 'Watch'
    }

    if (unavailableLabel) {
      return unavailableLabel
    }

    return 'Download'
  }

  function downloadButtonLabel(model: CivitaiModel) {
    const versions = versionsForModel(model)
    const activeDownload = activeDownloadForModel(model)
    if (activeDownload) {
      return downloadStatusLabel(activeDownload)
    }

    if (versions.length === 1 && versions[0]) {
      return versionDownloadButtonLabel(versions[0])
    }

    return versions.length > 1 ? 'Versions' : 'Download'
  }

  function canQueueMissingVersion(version: CivitaiModelVersion | null | undefined) {
    if (!canQueueCivitaiVersion(version)) {
      return false
    }

    const existingState = downloadForVersion(version)?.state
    return !existingState || existingState === 'error' || existingState === 'cancelled' || existingState === 'deleted'
  }

  function canWatchMissingVersion(version: CivitaiModelVersion | null | undefined) {
    return canWatchVersion(version) && !watchedDownloadForVersion(version)
  }

  function queueableMissingVersionsForModel(model: CivitaiModel) {
    return versionsForModel(model).filter((version) =>
      canQueueMissingVersion(version) || canWatchMissingVersion(version),
    )
  }

  function clearDownloadActionNotice() {
    state.downloadActionNotice.value = ''
  }

  function clearDownloadActionError() {
    state.downloadActionError.value = ''
  }

  function queueDownloadNotice(payload: unknown, fallbackFileName: string) {
    const item = typeof payload === 'object' && payload !== null && 'item' in payload
      ? (payload as { item?: Partial<AssetDownloadItem> }).item
      : null
    const fileName = item?.fileName || fallbackFileName

    if (item?.state === 'complete') {
      return `Downloaded ${fileName}.`
    }

    if (item?.state === 'downloading') {
      return `Started ${fileName}.`
    }

    return `Queued ${fileName}.`
  }

  function watchedDownloadNotice(payload: unknown, fallbackFileName: string) {
    const item = typeof payload === 'object' && payload !== null && 'item' in payload
      ? (payload as { item?: Partial<WatchedAssetDownloadItem> }).item
      : null
    const fileName = item?.fileName || fallbackFileName

    if (item?.state === 'queued') {
      return `Queued ${fileName}.`
    }

    return `Watching ${fileName}.`
  }

  function bulkQueueNotice(queuedCount: number, watchCount: number, modelName: string) {
    if (queuedCount > 0 && watchCount > 0) {
      return `Queued ${queuedCount} download${queuedCount === 1 ? '' : 's'} and watching ${watchCount} version${watchCount === 1 ? '' : 's'} for ${modelName}.`
    }

    if (watchCount > 0) {
      return `Watching ${watchCount} version${watchCount === 1 ? '' : 's'} for ${modelName}.`
    }

    return `Queued ${queuedCount} version${queuedCount === 1 ? '' : 's'} for ${modelName}.`
  }

  function downloadPayloadForVersion(
    model: CivitaiModel,
    version: CivitaiModelVersion,
    file: ReturnType<typeof primaryFileForVersion>,
  ): WatchDownloadPayload {
    return {
      modelId: model.id,
      modelName: model.name,
      modelType: model.type,
      modelNsfw: model.nsfw ?? null,
      modelMetadata: {
        id: model.id,
        name: model.name,
        type: model.type,
        nsfw: model.nsfw ?? null,
        creator: model.creator ?? null,
        stats: model.stats ?? null,
        tags: model.tags ?? [],
      },
      versionId: version.id,
      versionName: version.name ?? `Version ${version.id}`,
      baseModel: version.baseModel,
      file: (file ?? {}) as Record<string, unknown>,
      trainedWords: version.trainedWords ?? [],
      previewImage: previewImageForVersion(version),
      previewImages: previewImagesForVersion(version),
    }
  }

  async function watchAssetDownload(
    model: CivitaiModel,
    version: CivitaiModelVersion,
    file: ReturnType<typeof primaryFileForVersion>,
    key: string,
    { closeMenu = true, showNotice = true }: QueueAssetDownloadOptions = {},
  ) {
    if (!state.watchDownload) {
      state.downloadActionError.value = 'This Civitai version is early access and is not covered by the saved account API key.'
      clearDownloadActionNotice()
      return false
    }

    state.queuingDownloadKey.value = key
    clearDownloadActionError()
    if (showNotice) {
      clearDownloadActionNotice()
    }

    try {
      const payload = await state.watchDownload(downloadPayloadForVersion(model, version, file))
      if (closeMenu) {
        state.openDownloadMenuKey.value = ''
      }
      if (showNotice) {
        state.downloadActionNotice.value = watchedDownloadNotice(payload, file?.name ?? version.name ?? `Version ${version.id}`)
      }
      state.onDownloadQueued?.(model)
      return true
    } catch (caughtError) {
      state.downloadActionError.value = caughtError instanceof Error ? caughtError.message : 'Could not watch download.'
      clearDownloadActionNotice()
      return false
    } finally {
      if (state.queuingDownloadKey.value === key) {
        state.queuingDownloadKey.value = ''
      }
    }
  }

  async function unwatchAssetDownload(
    version: CivitaiModelVersion,
    watchedDownload: WatchedAssetDownloadItem,
    key: string,
    { closeMenu = true, showNotice = true }: QueueAssetDownloadOptions = {},
  ) {
    if (!state.unwatchDownload) {
      return false
    }

    state.queuingDownloadKey.value = key
    clearDownloadActionError()
    if (showNotice) {
      clearDownloadActionNotice()
    }

    try {
      await state.unwatchDownload(watchedDownload.id)
      if (closeMenu) {
        state.openDownloadMenuKey.value = ''
      }
      if (showNotice) {
        state.downloadActionNotice.value = `Stopped watching ${watchedDownload.fileName || version.name || `Version ${version.id}`}.`
      }
      return true
    } catch (caughtError) {
      state.downloadActionError.value = caughtError instanceof Error ? caughtError.message : 'Could not stop watching download.'
      clearDownloadActionNotice()
      return false
    } finally {
      if (state.queuingDownloadKey.value === key) {
        state.queuingDownloadKey.value = ''
      }
    }
  }

  async function queueAssetDownload(
    model: CivitaiModel,
    version: CivitaiModelVersion,
    { closeMenu = true, showNotice = true }: QueueAssetDownloadOptions = {},
  ) {
    const file = primaryFileForVersion(version)
    const key = modelDownloadKey(model, version)
    if (!file?.name) {
      state.downloadActionError.value = 'No model file listed.'
      clearDownloadActionNotice()
      return false
    }

    const watchedDownload = watchedDownloadForVersion(version)
    if (
      watchedDownload &&
      (watchedDownload.state === 'watching' || watchedDownload.state === 'attention') &&
      state.unwatchDownload
    ) {
      return unwatchAssetDownload(version, watchedDownload, key, { closeMenu, showNotice })
    }

    const unavailableLabel = versionDownloadUnavailableLabel(version)
    if (unavailableLabel === 'Early access locked') {
      return watchAssetDownload(model, version, file, key, { closeMenu, showNotice })
    }

    if (!file.downloadUrl) {
      state.downloadActionError.value = 'No downloadable model file listed.'
      clearDownloadActionNotice()
      return false
    }

    if (unavailableLabel) {
      state.downloadActionError.value = `This Civitai version is not downloadable: ${unavailableLabel}.`
      clearDownloadActionNotice()
      return false
    }

    const existingDownload = downloadForVersion(version)
    const forceRedownload = existingDownload?.state === 'complete'
    if (forceRedownload) {
      const fileName = existingDownload.fileName || file.name
      const confirmed = await state.confirm({
        title: 'Re-download file?',
        description: `Re-download ${fileName}? This will replace the existing downloaded file.`,
        confirmLabel: 'Re-download',
        destructive: true,
      })
      if (!confirmed) {
        return false
      }
    }

    state.queuingDownloadKey.value = key
    clearDownloadActionError()
    if (showNotice) {
      clearDownloadActionNotice()
    }

    try {
      const payload = await state.queueDownload({
        ...downloadPayloadForVersion(model, version, file),
        force: forceRedownload,
      })
      if (closeMenu) {
        state.openDownloadMenuKey.value = ''
      }
      if (showNotice) {
        state.downloadActionNotice.value = queueDownloadNotice(payload, file.name)
      }
      state.onDownloadQueued?.(model)
      return true
    } catch (caughtError) {
      state.downloadActionError.value = caughtError instanceof Error ? caughtError.message : 'Could not queue download.'
      clearDownloadActionNotice()
      return false
    } finally {
      if (state.queuingDownloadKey.value === key) {
        state.queuingDownloadKey.value = ''
      }
    }
  }

  async function queueMissingVersionsForModel(model: CivitaiModel) {
    const versions = queueableMissingVersionsForModel(model)
    if (!versions.length) {
      state.downloadActionError.value = 'No missing downloadable versions found.'
      clearDownloadActionNotice()
      return
    }

    clearDownloadActionError()
    clearDownloadActionNotice()
    let queuedCount = 0
    let watchCount = 0
    for (const version of versions) {
      const isWatchAction = canWatchMissingVersion(version) && !canQueueMissingVersion(version)
      if (await queueAssetDownload(model, version, { closeMenu: false, showNotice: false })) {
        if (isWatchAction) {
          watchCount += 1
        } else {
          queuedCount += 1
        }
      }
    }
    if (queuedCount > 0 || watchCount > 0) {
      state.downloadActionNotice.value = bulkQueueNotice(queuedCount, watchCount, model.name)
    }
    state.openDownloadMenuKey.value = ''
  }

  function toggleDownloadMenu(model: CivitaiModel) {
    const key = String(model.id)
    state.openDownloadMenuKey.value = state.openDownloadMenuKey.value === key ? '' : key
  }

  async function handleDownloadClick(model: CivitaiModel) {
    const versions = versionsForModel(model)
    if (versions.length === 1 && versions[0]) {
      await queueAssetDownload(model, versions[0])
      return
    }

    toggleDownloadMenu(model)
  }

  return {
    activeDownloadForModel,
    downloadButtonLabel,
    downloadForVersion,
    downloadStatusLabel,
    handleDownloadClick,
    hasDownloadedVersion,
    isModelDownloadQueuing,
    isVersionQueuing,
    canQueueVersion: canActOnVersionDownload,
    watchedDownloadForVersion,
    queueAssetDownload,
    queueMissingVersionsForModel,
    queueableMissingVersionsForModel,
    toggleDownloadMenu,
    versionDownloadButtonLabel,
  }
}
