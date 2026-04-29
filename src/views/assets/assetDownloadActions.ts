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
  openDownloadMenuKey: Ref<string>
  queuingDownloadKey: Ref<string>
  queueDownload: (payload: QueueDownloadPayload) => Promise<unknown>
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

  async function queueAssetDownload(model: CivitaiModel, version: CivitaiModelVersion) {
    const file = primaryFileForVersion(version)
    const key = modelDownloadKey(model, version)
    if (!file?.downloadUrl || !file.name) {
      state.downloadActionError.value = 'No downloadable model file listed.'
      return
    }

    const unavailableLabel = versionDownloadUnavailableLabel(version)
    if (unavailableLabel) {
      state.downloadActionError.value = unavailableLabel === 'Early access locked'
        ? 'This Civitai version is early access and is not covered by the saved account API key.'
        : `This Civitai version is not downloadable: ${unavailableLabel}.`
      return
    }

    state.queuingDownloadKey.value = key
    state.downloadActionError.value = ''

    try {
      await state.queueDownload({
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
      state.openDownloadMenuKey.value = ''
    } catch (caughtError) {
      state.downloadActionError.value = caughtError instanceof Error ? caughtError.message : 'Could not queue download.'
    } finally {
      if (state.queuingDownloadKey.value === key) {
        state.queuingDownloadKey.value = ''
      }
    }
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
    queueAssetDownload,
    toggleDownloadMenu,
    versionDownloadButtonLabel,
  }
}
