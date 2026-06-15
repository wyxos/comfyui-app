<script setup lang="ts">
import { ChevronLeft, ChevronRight, LoaderCircle, X } from 'lucide-vue-next'

import AssetPreviewMediaStrip from './AssetPreviewMediaStrip.vue'
import AssetPreviewSidebar from './AssetPreviewSidebar.vue'
import type { AssetPreviewModalProps } from './assetPreviewTypes'
import { useAssetPreviewModal } from './useAssetPreviewModal'
import UiPreloadedMedia from '../ui/UiPreloadedMedia.vue'

const props = withDefaults(
  defineProps<AssetPreviewModalProps>(),
  {
    model: null,
    title: 'Preview',
    previewUrl: null,
    isVideo: false,
    includeNsfw: false,
    blurNsfwContent: false,
    subtitle: null,
    kindLabel: 'Preview',
    modelId: null,
    versionId: null,
    modelType: null,
    baseModel: null,
    trainedWords: () => [],
    fileName: null,
    compatibility: null,
    editableCompatibility: false,
    editableSafety: false,
    savingCompatibility: false,
    savingSafety: false,
    savingImageSafety: false,
    compatibilityError: '',
    safetyError: '',
    imageSafetyError: '',
    showDownloadActions: false,
    queuingDownloadKey: '',
    downloadForVersion: undefined,
    downloadStatusLabel: undefined,
    canQueueVersion: undefined,
    versionDownloadButtonLabel: undefined,
    queueAssetDownload: undefined,
    deleteAssetDownload: undefined,
    repairDownloadPreviews: undefined,
    modelDownloadKey: undefined,
    applyGenerationMetadata: undefined,
  },
)

const emit = defineEmits<{
  close: []
  'save-compatibility': [payload: {
    compatibleBaseModels: string[]
    controlType: string
    loaderType: string
  }]
  'save-safety': [payload: {
    modelNsfw: boolean | null
    modelNsfwOverride: boolean | null
  }]
  'save-image-safety': [payload: {
    imageKey: string
    imageNsfw: boolean | null
    imageNsfwOverride: boolean | null
  }]
}>()

const {
  civitaiModel,
  civitaiLoading,
  civitaiError,
  imageMetaLoading,
  imageMetaError,
  activeImageIndex,
  displayedImageUrl,
  mediaLoading,
  feedLoading,
  feedError,
  feedSlides,
  modelVersions,
  selectedVersion,
  previewSlides,
  activeSlide,
  activeImage,
  activeImageSafetyKey,
  activeImageNsfwOverride,
  activeImageDetectedNsfw,
  activeImageIsNsfw,
  activeImageSafetyLabel,
  activeImageMetaSource,
  activeImageMeta,
  normalizedImageMetaRows,
  activeTriggerWords,
  activePrimaryFile,
  modalTitle,
  modalSubtitle,
  civitaiModelUrl,
  shouldRenderModal,
  hasDownloadActions,
  close,
  selectVersion,
  showPreviousImage,
  showNextImage,
  selectPreviewImage,
  selectFeedImage,
  handleModalMediaReady,
  downloadForVersion,
  downloadStatusLabel,
  modelDownloadKey,
  canQueueVersion,
  canDeleteVersionDownload,
  versionDownloadButtonLabel,
  queueVersionDownload,
  deleteVersionDownload,
  imageDimensions,
} = useAssetPreviewModal(props, () => emit('close'))
</script>

<template>
  <div
    v-if="shouldRenderModal"
    class="fixed inset-0 z-50 grid bg-background/96 text-foreground backdrop-blur-sm lg:grid-cols-[4fr_1fr]"
    role="dialog"
    aria-modal="true"
    :aria-label="`${modalTitle} image preview`"
  >
    <section
      class="relative min-h-0 overflow-hidden bg-black/35"
      @click.self="close"
    >
      <div class="absolute left-4 top-4 z-20 flex max-w-[calc(100%-8rem)] flex-wrap items-center gap-2">
        <span class="rounded-md border border-primary-foreground/10 bg-primary/80 px-3 py-1.5 text-sm font-semibold text-primary-foreground shadow-sm backdrop-blur">
          {{ modalTitle }}
        </span>
        <span
          v-if="activeImageIsNsfw"
          class="rounded-md border border-destructive/50 bg-destructive px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-destructive-foreground shadow-sm"
        >
          NSFW
        </span>
      </div>

      <div class="absolute right-4 top-4 z-20 flex items-center gap-2">
        <span
          v-if="previewSlides.length"
          class="rounded-md border border-primary-foreground/10 bg-primary/80 px-3 py-1.5 text-sm font-semibold text-primary-foreground shadow-sm backdrop-blur"
        >
          {{ activeImageIndex + 1 }} / {{ previewSlides.length }}
        </span>
        <button
          class="inline-flex h-10 w-10 items-center justify-center rounded-md border border-border bg-card text-muted-foreground transition hover:border-secondary/60 hover:bg-secondary hover:text-secondary-foreground"
          type="button"
          aria-label="Close image preview"
          @click="close"
        >
          <X class="h-4 w-4" />
        </button>
      </div>

      <button
        class="absolute left-4 top-1/2 z-20 inline-flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-md border border-primary-foreground/10 bg-primary/70 text-primary-foreground transition hover:bg-secondary hover:text-secondary-foreground disabled:cursor-not-allowed disabled:opacity-40"
        type="button"
        aria-label="Previous image"
        :disabled="previewSlides.length < 2"
        @click="showPreviousImage"
      >
        <ChevronLeft class="h-6 w-6" />
      </button>

      <div class="flex h-full min-h-0 items-center justify-center p-6 pb-28 pt-20">
        <div
          v-if="mediaLoading || civitaiLoading"
          class="absolute inset-0 z-10 flex items-center justify-center bg-background/55 text-sm font-semibold text-foreground backdrop-blur-sm"
          aria-live="polite"
        >
          <LoaderCircle class="mr-2 h-5 w-5 animate-spin text-secondary" />
          Loading preview...
        </div>

        <UiPreloadedMedia
          v-if="displayedImageUrl"
          :src="displayedImageUrl"
          :is-video="Boolean(activeSlide?.isVideo)"
          :alt="`${modalTitle} preview image`"
          label=""
          :media-class="props.blurNsfwContent && activeImageIsNsfw ? 'max-h-full max-w-full scale-105 object-contain blur-2xl' : 'max-h-full max-w-full object-contain'"
          loading-class="hidden"
          controls
          autoplay
          loop
          playsinline
          preload="auto"
          @ready="handleModalMediaReady"
          @error="handleModalMediaReady"
        />
        <div
          v-else-if="!civitaiLoading"
          class="rounded-md border border-primary-foreground/12 bg-primary/72 px-5 py-4 text-sm font-semibold text-primary-foreground/72"
        >
          No preview image available.
        </div>
      </div>

      <button
        class="absolute right-4 top-1/2 z-20 inline-flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-md border border-primary-foreground/10 bg-primary/70 text-primary-foreground transition hover:bg-secondary hover:text-secondary-foreground disabled:cursor-not-allowed disabled:opacity-40"
        type="button"
        aria-label="Next image"
        :disabled="previewSlides.length < 2"
        @click="showNextImage"
      >
        <ChevronRight class="h-6 w-6" />
      </button>

      <AssetPreviewMediaStrip
        :slides="previewSlides"
        :active-index="activeImageIndex"
        :blur-nsfw-content="props.blurNsfwContent"
        @select="selectPreviewImage"
      />
    </section>

    <AssetPreviewSidebar
      :kind-label="props.kindLabel"
      :modal-title="modalTitle"
      :modal-subtitle="modalSubtitle"
      :civitai-model="civitaiModel ?? null"
      :civitai-error="civitaiError"
      :civitai-model-url="civitaiModelUrl"
      :selected-version="selectedVersion"
      :model-versions="modelVersions"
      :has-download-actions="hasDownloadActions"
      :queuing-download-key="props.queuingDownloadKey"
      :editable-compatibility="props.editableCompatibility"
      :editable-safety="props.editableSafety"
      :saving-compatibility="props.savingCompatibility"
      :saving-safety="props.savingSafety"
      :saving-image-safety="props.savingImageSafety"
      :compatibility="props.compatibility"
      :compatibility-error="props.compatibilityError"
      :safety-error="props.safetyError"
      :image-safety-error="props.imageSafetyError"
      :active-trigger-words="activeTriggerWords"
      :active-primary-file="activePrimaryFile"
      :preview-slides="previewSlides"
      :feed-slides="feedSlides"
      :active-image-index="activeImageIndex"
      :active-slide="activeSlide"
      :active-image="activeImage"
      :active-image-safety-key="activeImageSafetyKey"
      :active-image-detected-nsfw="activeImageDetectedNsfw"
      :active-image-nsfw-override="activeImageNsfwOverride"
      :active-image-safety-label="activeImageSafetyLabel"
      :image-meta-loading="imageMetaLoading"
      :image-meta-error="imageMetaError"
      :active-image-meta="activeImageMeta"
      :normalized-image-meta-rows="normalizedImageMetaRows"
      :active-image-meta-source="activeImageMetaSource"
      :blur-nsfw-content="props.blurNsfwContent"
      :feed-loading="feedLoading"
      :feed-error="feedError"
      :apply-generation-metadata="props.applyGenerationMetadata"
      :repair-download-previews="props.repairDownloadPreviews"
      :download-for-version="downloadForVersion"
      :download-status-label="downloadStatusLabel"
      :model-download-key="modelDownloadKey"
      :can-queue-version="canQueueVersion"
      :can-delete-version-download="canDeleteVersionDownload"
      :version-download-button-label="versionDownloadButtonLabel"
      :image-dimensions="imageDimensions"
      @save-compatibility="emit('save-compatibility', $event)"
      @save-safety="emit('save-safety', $event)"
      @save-image-safety="emit('save-image-safety', $event)"
      @select-version="selectVersion"
      @queue-download="queueVersionDownload"
      @delete-download="deleteVersionDownload"
      @select-preview="selectPreviewImage"
      @select-feed-preview="selectFeedImage"
      @close="close"
    />
  </div>
</template>
