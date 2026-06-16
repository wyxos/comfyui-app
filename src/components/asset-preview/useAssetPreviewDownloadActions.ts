import { ref } from 'vue'
import {
  imagesForVersion,
  primaryFileForVersion,
  versionDownloadUnavailableLabel,
} from './assetPreviewHelpers'
import type {
  AssetPreviewDownload,
  CivitaiModel,
  CivitaiModelVersion,
} from './assetPreviewTypes'
import { useAssetDownloads } from '../../composables/useAssetDownloads'
import { useConfirmDialog } from '../../composables/useConfirmDialog'

export function useAssetPreviewDownloadActions(options: { autoStart?: boolean } = {}) {
  const confirm = useConfirmDialog()
  const {
    downloadByVersionId,
    queueDownload,
    deleteDownloadedFile,
    repairDownloadPreviews: postRepairDownloadPreviews,
    startPolling,
    stopPolling,
  } = useAssetDownloads(options)
  const queuingDownloadKey = ref('')
  const downloadActionError = ref('')

  function downloadForVersion(version: CivitaiModelVersion | null | undefined) {
    return version ? downloadByVersionId.value.get(version.id)?.[0] ?? null : null
  }

  function downloadStatusLabel(download: AssetPreviewDownload | null) {
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

  function modelDownloadKey(model: CivitaiModel, version: CivitaiModelVersion) {
    return `${model.id}:${version.id}`
  }

  async function queueAssetDownload(model: CivitaiModel, version: CivitaiModelVersion) {
    const file = primaryFileForVersion(version)
    const key = modelDownloadKey(model, version)
    if (!file?.downloadUrl || !file.name) {
      downloadActionError.value = 'No downloadable model file listed.'
      return
    }

    const unavailableLabel = versionDownloadUnavailableLabel(version)
    if (unavailableLabel) {
      downloadActionError.value = unavailableLabel === 'Early access locked'
        ? 'This Civitai version is early access and is not covered by the saved account API key.'
        : `This Civitai version is not downloadable: ${unavailableLabel}.`
      return
    }

    const existingDownload = downloadForVersion(version)
    const forceRedownload = existingDownload?.state === 'complete'
    if (forceRedownload) {
      const fileName = existingDownload.fileName || file.name
      const confirmed = await confirm({
        title: 'Re-download file?',
        description: `Re-download ${fileName}? This will replace the existing downloaded file.`,
        confirmLabel: 'Re-download',
        destructive: true,
      })
      if (!confirmed) {
        return
      }
    }

    queuingDownloadKey.value = key
    downloadActionError.value = ''

    try {
      await queueDownload({
        modelId: model.id,
        modelName: model.name,
        modelType: model.type,
        modelMetadata: {
          id: model.id,
          name: model.name,
          type: model.type,
          creator: model.creator ?? null,
          stats: model.stats ?? null,
        },
        versionId: version.id,
        versionName: version.name ?? `Version ${version.id}`,
        baseModel: version.baseModel,
        file: file as Record<string, unknown>,
        trainedWords: version.trainedWords ?? [],
        previewImage: (imagesForVersion(version)[0] ?? null) as Record<string, unknown> | null,
        previewImages: imagesForVersion(version) as Array<Record<string, unknown>>,
        force: forceRedownload,
      })
    } catch (caughtError) {
      downloadActionError.value = caughtError instanceof Error ? caughtError.message : 'Could not queue download.'
    } finally {
      if (queuingDownloadKey.value === key) {
        queuingDownloadKey.value = ''
      }
    }
  }

  async function deleteAssetDownload(download: AssetPreviewDownload) {
    if (!download.id) {
      downloadActionError.value = 'No download record was found for this file.'
      return
    }

    downloadActionError.value = ''
    try {
      await deleteDownloadedFile(download.id)
    } catch (caughtError) {
      downloadActionError.value = caughtError instanceof Error ? caughtError.message : 'Could not delete downloaded file.'
    }
  }

  async function repairDownloadPreviews(download: AssetPreviewDownload) {
    if (!download.id) {
      downloadActionError.value = 'No download record was found for this file.'
      return
    }

    downloadActionError.value = ''
    try {
      await postRepairDownloadPreviews(download.id)
    } catch (caughtError) {
      downloadActionError.value = caughtError instanceof Error ? caughtError.message : 'Could not backfill previews.'
    }
  }

  return {
    queuingDownloadKey,
    downloadActionError,
    downloadForVersion,
    downloadStatusLabel,
    queueAssetDownload,
    deleteAssetDownload,
    repairDownloadPreviews,
    modelDownloadKey,
    startPolling,
    stopPolling,
  }
}
