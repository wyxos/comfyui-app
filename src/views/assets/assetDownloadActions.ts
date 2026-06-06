import type { ComputedRef, Ref } from 'vue'
import { versionDownloadUnavailableLabel } from '../../components/asset-preview/assetPreviewHelpers'
import type { AssetDownloadItem, QueueDownloadPayload } from '../../composables/useAssetDownloads'
import {
  canQueueVersion,
  modelDownloadKey,
  previewImageForVersion,
  previewImagesForVersion,
  primaryFileForVersion,
  versionsForModel,
} from './assetModelHelpers'
import type { CivitaiModel, CivitaiModelVersion } from './assetViewTypes'

type DownloadActionState = {
  downloadByVersionId: ComputedRef<Map<number, AssetDownloadItem[]>>
  downloadActionError: Ref<string>
  downloadActionNotice: Ref<string>
  openDownloadMenuKey: Ref<string>
  queuingDownloadKey: Ref<string>
  queueDownload: (payload: QueueDownloadPayload) => Promise<unknown>
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
    const unavailableLabel = versionDownloadUnavailableLabel(version)
    if (unavailableLabel) {
      return unavailableLabel
    }

    return downloadStatusLabel(downloadForVersion(version)) || 'Download'
  }

  function downloadButtonLabel(model: CivitaiModel) {
    const activeDownload = activeDownloadForModel(model)
    if (activeDownload) {
      return downloadStatusLabel(activeDownload)
    }

    if (versionsForModel(model).length === 1 && !canQueueVersion(versionsForModel(model)[0])) {
      return versionDownloadButtonLabel(versionsForModel(model)[0])
    }

    if (versionsForModel(model).length === 1 && hasDownloadedVersion(model)) {
      return 'Re-download'
    }

    return versionsForModel(model).length > 1 ? 'Versions' : 'Download'
  }

  function canQueueMissingVersion(version: CivitaiModelVersion | null | undefined) {
    if (!canQueueVersion(version)) {
      return false
    }

    const existingState = downloadForVersion(version)?.state
    return !existingState || existingState === 'error' || existingState === 'cancelled' || existingState === 'deleted'
  }

  function queueableMissingVersionsForModel(model: CivitaiModel) {
    return versionsForModel(model).filter((version) => canQueueMissingVersion(version))
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

  async function queueAssetDownload(
    model: CivitaiModel,
    version: CivitaiModelVersion,
    { closeMenu = true, showNotice = true }: QueueAssetDownloadOptions = {},
  ) {
    const file = primaryFileForVersion(version)
    const key = modelDownloadKey(model, version)
    if (!file?.downloadUrl || !file.name) {
      state.downloadActionError.value = 'No downloadable model file listed.'
      clearDownloadActionNotice()
      return false
    }

    const unavailableLabel = versionDownloadUnavailableLabel(version)
    if (unavailableLabel) {
      state.downloadActionError.value = unavailableLabel === 'Early access locked'
        ? 'This Civitai version is early access and is not covered by the saved account API key.'
        : `This Civitai version is not downloadable: ${unavailableLabel}.`
      clearDownloadActionNotice()
      return false
    }

    state.queuingDownloadKey.value = key
    clearDownloadActionError()
    if (showNotice) {
      clearDownloadActionNotice()
    }

    try {
      const payload = await state.queueDownload({
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
        file,
        trainedWords: version.trainedWords ?? [],
        previewImage: previewImageForVersion(version),
        previewImages: previewImagesForVersion(version),
        force: downloadForVersion(version)?.state === 'complete',
      })
      if (closeMenu) {
        state.openDownloadMenuKey.value = ''
      }
      if (showNotice) {
        state.downloadActionNotice.value = queueDownloadNotice(payload, file.name)
      }
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
    for (const version of versions) {
      if (await queueAssetDownload(model, version, { closeMenu: false, showNotice: false })) {
        queuedCount += 1
      }
    }
    if (queuedCount > 0) {
      state.downloadActionNotice.value = `Queued ${queuedCount} version${queuedCount === 1 ? '' : 's'} for ${model.name}.`
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
    queueAssetDownload,
    queueMissingVersionsForModel,
    queueableMissingVersionsForModel,
    toggleDownloadMenu,
    versionDownloadButtonLabel,
  }
}
