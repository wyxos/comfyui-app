import type { ComputedRef } from 'vue'

import {
  modelVersionLabel,
  primaryFileForVersion,
  versionDownloadUnavailableLabel,
} from './assetPreviewHelpers'
import type {
  AssetPreviewDownload,
  AssetPreviewModalProps,
  CivitaiModel,
  CivitaiModelVersion,
} from './assetPreviewTypes'
import type { ConfirmDialogFn } from '../../composables/useConfirmDialog'

type UseAssetPreviewModalDownloadActionsOptions = {
  props: Readonly<AssetPreviewModalProps>
  civitaiModel: ComputedRef<CivitaiModel | null | undefined>
  confirm: ConfirmDialogFn
}

export function useAssetPreviewModalDownloadActions(options: UseAssetPreviewModalDownloadActionsOptions) {
  const { props, civitaiModel, confirm } = options

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

  return {
    downloadForVersion,
    downloadStatusLabel,
    modelDownloadKey,
    canQueueVersion,
    canDeleteVersionDownload,
    versionDownloadButtonLabel,
    queueVersionDownload,
    deleteVersionDownload,
  }
}
