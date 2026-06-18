<script setup lang="ts">
import { computed } from 'vue'
import { ChevronLeft, ChevronRight, LoaderCircle, X } from 'lucide-vue-next'

import AssetPreviewAtlasReactionWidget from './AssetPreviewAtlasReactionWidget.vue'
import AssetPreviewFloatingMetadataAction from './AssetPreviewFloatingMetadataAction.vue'
import AssetPreviewImageMetadataSidebar from './AssetPreviewImageMetadataSidebar.vue'
import AssetPreviewMediaStrip from './AssetPreviewMediaStrip.vue'
import AssetPreviewSidebar from './AssetPreviewSidebar.vue'
import type { AssetPreviewModalProps } from './assetPreviewTypes'
import { atlasFileUrlForStatus, atlasMediaKey, type AtlasReactionType } from './assetPreviewAtlasMedia'
import { imageMatchesNsfwBlurLevel } from './assetPreviewHelpers'
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
    blurNsfwModels: true,
    blurNsfwMediaLevel: null,
    subtitle: null,
    kindLabel: 'Preview',
    modelId: null,
    versionId: null,
    fileId: null,
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
  feedLoadingMore,
  feedError,
  atlasActionError,
  atlasBaseUrl,
  atlasDeletePendingKey,
  atlasReactionPendingKey,
  atlasReactionPendingType,
  atlasConfigured,
  atlasOpenError,
  atlasOpening,
  canLoadMoreFeed,
  versionAtlasStatusesLoading,
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
  modelIdentifier,
  versionIdentifier,
  fileIdentifier,
  modalTitle,
  modalSubtitle,
  modelTypeLabel,
  civitaiModelUrl,
  shouldRenderModal,
  hasDownloadActions,
  close,
  openAtlasModelTab,
  selectVersion,
  showPreviousImage,
  showNextImage,
  selectPreviewImage,
  selectFeedImage,
  loadMoreFeed,
  retryFeed,
  reactToFeedImage,
  reactToActiveImage,
  deleteFeedAtlasImage,
  deleteActiveAtlasImage,
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

const activeMediaHasDimensions = computed(() => {
  const width = activeImage.value?.width
  const height = activeImage.value?.height
  return typeof width === 'number' && width > 0 && typeof height === 'number' && height > 0
})
const activeMediaFrameStyle = computed(() => {
  if (!activeMediaHasDimensions.value) {
    return {}
  }

  return {
    aspectRatio: `${activeImage.value?.width} / ${activeImage.value?.height}`,
  }
})

function canReactToActiveAtlasImage() {
  const image = activeSlide.value?.image
  return atlasConfigured.value && Boolean(image?.url && image.id) && !isActiveAtlasStatusLoading()
}

function canShowActiveAtlasWidget() {
  const image = activeSlide.value?.image
  return atlasConfigured.value && Boolean(image?.url && image.id)
}

function isActiveAtlasStatusLoading() {
  const image = activeSlide.value?.image
  return atlasConfigured.value &&
    Boolean(image?.url && image.id) &&
    (versionAtlasStatusesLoading.value || !activeAtlasStatusKnown())
}

function activeAtlasStatusKnown() {
  const image = activeSlide.value?.image
  return Boolean(image && Object.prototype.hasOwnProperty.call(image, 'atlasStatus'))
}

function activeAtlasStatus() {
  return activeSlide.value?.image?.atlasStatus ?? null
}

function activeAtlasPending() {
  const image = activeSlide.value?.image
  return image ? atlasReactionPendingKey.value === atlasMediaKey(image) : false
}

function activeAtlasPendingReactionType() {
  return activeAtlasPending() ? atlasReactionPendingType.value : null
}

function activeAtlasDeleting() {
  const image = activeSlide.value?.image
  return image ? atlasDeletePendingKey.value === atlasMediaKey(image) : false
}

function activeAtlasFileUrl() {
  return atlasFileUrlForStatus(activeAtlasStatus(), atlasBaseUrl.value)
}

function handleActiveAtlasReaction(type: AtlasReactionType) {
  if (canReactToActiveAtlasImage()) {
    void reactToActiveImage(type)
  }
}

function handleActiveAtlasDelete() {
  if (canReactToActiveAtlasImage()) {
    void deleteActiveAtlasImage()
  }
}

function handleMainMediaClick(event: MouseEvent) {
  if (!event.altKey || event.button !== 0 || !canReactToActiveAtlasImage()) {
    return
  }

  event.preventDefault()
  event.stopPropagation()
  void reactToActiveImage('love')
}

function handleMainMediaMouseDown(event: MouseEvent) {
  if (!event.altKey || event.button !== 1 || !canReactToActiveAtlasImage()) {
    return
  }

  event.preventDefault()
  event.stopPropagation()
  void reactToActiveImage('like')
}

function handleMainMediaContextMenu(event: MouseEvent) {
  if (!event.altKey || !canReactToActiveAtlasImage()) {
    return
  }

  event.preventDefault()
  event.stopPropagation()
  void reactToActiveImage('blacklist')
}

function handleMainMediaAuxClick(event: MouseEvent) {
  if (event.button !== 1 || event.altKey || !activeSlide.value?.url) {
    return
  }

  event.preventDefault()
  event.stopPropagation()
  window.open(activeSlide.value.url, '_blank', 'noopener,noreferrer')
}

function shouldBlurActiveMedia() {
  return imageMatchesNsfwBlurLevel(activeImage.value, props.blurNsfwMediaLevel) ||
    (props.blurNsfwMediaLevel !== null && activeImageNsfwOverride.value === true)
}
</script>

<template>
  <div
    v-if="shouldRenderModal"
    class="fixed inset-0 z-50 grid grid-rows-[minmax(0,1fr)_minmax(0,45vh)] bg-background/96 text-foreground backdrop-blur-sm lg:grid-cols-[minmax(0,1fr)_minmax(38rem,44rem)] lg:grid-rows-none"
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

      <div class="flex h-full min-h-0 items-center justify-center p-6 pb-36 pt-20 sm:pb-40">
        <div
          v-if="mediaLoading || civitaiLoading"
          class="absolute inset-0 z-10 flex items-center justify-center bg-background/55 text-sm font-semibold text-foreground backdrop-blur-sm"
          aria-live="polite"
        >
          <LoaderCircle class="mr-2 h-5 w-5 animate-spin text-secondary" />
          Loading preview...
        </div>

        <div
          v-if="displayedImageUrl"
          data-test="asset-preview-main-media-shortcut-target"
          class="flex h-full min-h-0 w-full flex-col items-center justify-center gap-3"
          @click="handleMainMediaClick"
          @mousedown="handleMainMediaMouseDown"
          @contextmenu="handleMainMediaContextMenu"
          @auxclick="handleMainMediaAuxClick"
        >
          <div class="relative flex min-h-0 w-full flex-1 items-center justify-center">
            <div
              class="relative h-full max-h-full max-w-full"
              :class="activeMediaHasDimensions ? '' : 'w-full'"
              :style="activeMediaFrameStyle"
            >
              <UiPreloadedMedia
                :src="displayedImageUrl"
                :is-video="Boolean(activeSlide?.isVideo)"
                :alt="`${modalTitle} preview image`"
                label=""
                :media-class="shouldBlurActiveMedia() ? 'max-h-full max-w-full scale-105 object-contain blur-2xl' : 'max-h-full max-w-full object-contain'"
                loading-class="hidden"
                controls
                autoplay
                loop
                playsinline
                preload="auto"
                @ready="handleModalMediaReady"
                @error="handleModalMediaReady"
              />
              <AssetPreviewFloatingMetadataAction
                :loading="imageMetaLoading"
                :metadata-source="activeImageMetaSource"
                :apply-generation-metadata="props.applyGenerationMetadata"
                @applied="close"
              />
            </div>
          </div>
          <AssetPreviewAtlasReactionWidget
            v-if="canShowActiveAtlasWidget()"
            data-test="asset-preview-main-atlas-reactions"
            class="relative z-30"
            :status="activeAtlasStatus()"
            :checking="isActiveAtlasStatusLoading()"
            :pending="activeAtlasPending()"
            :pending-reaction-type="activeAtlasPendingReactionType()"
            :deleting="activeAtlasDeleting()"
            :atlas-file-url="activeAtlasFileUrl()"
            @react="handleActiveAtlasReaction"
            @delete="handleActiveAtlasDelete"
          />
        </div>
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
        :blur-nsfw-media-level="props.blurNsfwMediaLevel"
        @select="selectPreviewImage"
      />
    </section>

    <div
      class="min-h-0 grid overflow-hidden border-t border-border bg-card sm:grid-cols-2 lg:border-l lg:border-t-0"
      data-test="asset-preview-side-sheets"
    >
      <AssetPreviewSidebar
        :kind-label="props.kindLabel"
        :modal-title="modalTitle"
        :modal-subtitle="modalSubtitle"
        :model-type-label="modelTypeLabel"
        :model-identifier="modelIdentifier"
        :version-identifier="versionIdentifier"
        :file-identifier="fileIdentifier"
        :civitai-model="civitaiModel ?? null"
        :civitai-error="civitaiError"
        :civitai-model-url="civitaiModelUrl"
        :atlas-configured="atlasConfigured"
        :atlas-open-error="atlasOpenError"
        :atlas-opening="atlasOpening"
        :selected-version="selectedVersion"
        :model-versions="modelVersions"
        :has-download-actions="hasDownloadActions"
        :queuing-download-key="props.queuingDownloadKey"
        :editable-compatibility="props.editableCompatibility"
        :editable-safety="props.editableSafety"
        :saving-compatibility="props.savingCompatibility"
        :saving-safety="props.savingSafety"
        :compatibility="props.compatibility"
        :compatibility-error="props.compatibilityError"
        :safety-error="props.safetyError"
        :active-trigger-words="activeTriggerWords"
        :active-primary-file="activePrimaryFile"
        :preview-slides="previewSlides"
        :feed-slides="feedSlides"
        :active-slide="activeSlide"
        :blur-nsfw-media-level="props.blurNsfwMediaLevel"
        :feed-loading="feedLoading"
        :feed-loading-more="feedLoadingMore"
        :feed-error="feedError"
        :atlas-base-url="atlasBaseUrl"
        :atlas-action-error="atlasActionError"
        :atlas-delete-pending-key="atlasDeletePendingKey"
        :atlas-reaction-pending-key="atlasReactionPendingKey"
        :atlas-reaction-pending-type="atlasReactionPendingType"
        :can-load-more-feed="canLoadMoreFeed"
        :repair-download-previews="props.repairDownloadPreviews"
        :download-for-version="downloadForVersion"
        :download-status-label="downloadStatusLabel"
        :model-download-key="modelDownloadKey"
        :can-queue-version="canQueueVersion"
        :can-delete-version-download="canDeleteVersionDownload"
        :version-download-button-label="versionDownloadButtonLabel"
        @save-compatibility="emit('save-compatibility', $event)"
        @save-safety="emit('save-safety', $event)"
        @select-version="selectVersion"
        @queue-download="queueVersionDownload"
        @delete-download="deleteVersionDownload"
        @select-feed-preview="selectFeedImage"
        @load-more-feed="loadMoreFeed"
        @retry-feed="retryFeed"
        @atlas-react-feed-preview="reactToFeedImage"
        @atlas-delete-feed-preview="deleteFeedAtlasImage"
        @open-atlas-model="openAtlasModelTab"
      />

      <AssetPreviewImageMetadataSidebar
        :active-image-index="activeImageIndex"
        :active-slide="activeSlide"
        :active-image="activeImage"
        :active-image-safety-key="activeImageSafetyKey"
        :active-image-detected-nsfw="activeImageDetectedNsfw"
        :active-image-nsfw-override="activeImageNsfwOverride"
        :active-image-safety-label="activeImageSafetyLabel"
        :preview-slides="previewSlides"
        :editable-safety="props.editableSafety"
        :saving-image-safety="props.savingImageSafety"
        :image-safety-error="props.imageSafetyError"
        :image-meta-loading="imageMetaLoading"
        :image-meta-error="imageMetaError"
        :active-image-meta="activeImageMeta"
        :normalized-image-meta-rows="normalizedImageMetaRows"
        :active-image-meta-source="activeImageMetaSource"
        :apply-generation-metadata="props.applyGenerationMetadata"
        :image-dimensions="imageDimensions"
        @save-image-safety="emit('save-image-safety', $event)"
        @applied="close"
      />
    </div>
  </div>
</template>
