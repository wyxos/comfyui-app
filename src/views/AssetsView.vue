<script setup lang="ts">
import AssetPreviewModal from '../components/asset-preview/AssetPreviewModal.vue'
import type { AssetPreviewDownload } from '../components/asset-preview/assetPreviewTypes'
import AssetsResults from './assets/AssetsResults.vue'
import AssetsToolbar from './assets/AssetsToolbar.vue'
import { provideAssetsView } from './assets/assetsViewContext'
import { useAssetsView } from './assets/useAssetsView'

const view = useAssetsView()
provideAssetsView(view)

const {
  activeImageModel,
  queuingDownloadKey,
  downloadForVersion,
  downloadStatusLabel,
  canQueueVersion,
  versionDownloadButtonLabel,
  queueAssetDownload,
  deleteAssetDownload,
  closeImageModal,
  modelDownloadKey,
} = view

function assetPreviewDownloadStatusLabel(download: AssetPreviewDownload | null) {
  return downloadStatusLabel(download as Parameters<typeof downloadStatusLabel>[0])
}
</script>

<template>
  <main class="flex h-full min-h-0 flex-col bg-background text-foreground">
    <AssetsToolbar />
    <AssetsResults />
  </main>

  <AssetPreviewModal
    :open="Boolean(activeImageModel)"
    :model="activeImageModel"
    :queuing-download-key="queuingDownloadKey"
    :download-for-version="downloadForVersion"
    :download-status-label="assetPreviewDownloadStatusLabel"
    :can-queue-version="canQueueVersion"
    :version-download-button-label="versionDownloadButtonLabel"
    :queue-asset-download="queueAssetDownload"
    :delete-asset-download="deleteAssetDownload"
    :model-download-key="modelDownloadKey"
    show-download-actions
    kind-label="Model"
    @close="closeImageModal"
  />
</template>

<style>
.asset-card-grid {
  grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr));
}

@media (min-width: 1800px) {
  .asset-card-grid {
    grid-template-columns: repeat(6, minmax(0, 1fr));
  }
}
</style>
