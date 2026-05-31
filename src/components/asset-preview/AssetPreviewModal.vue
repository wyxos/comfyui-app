<script setup lang="ts">
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  LoaderCircle,
  X,
} from 'lucide-vue-next'
import { formatNumber } from './assetPreviewHelpers'
import AssetPreviewCompatibilityEditor from './AssetPreviewCompatibilityEditor.vue'
import AssetPreviewFileDetails from './AssetPreviewFileDetails.vue'
import AssetPreviewVersionList from './AssetPreviewVersionList.vue'
import type { AssetPreviewModalProps } from './assetPreviewTypes'
import { useAssetPreviewModal } from './useAssetPreviewModal'

const props = withDefaults(
  defineProps<AssetPreviewModalProps>(),
  {
    model: null,
    title: 'Preview',
    previewUrl: null,
    isVideo: false,
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
    savingCompatibility: false,
    compatibilityError: '',
    showDownloadActions: false,
    queuingDownloadKey: '',
    downloadForVersion: undefined,
    downloadStatusLabel: undefined,
    queueAssetDownload: undefined,
    deleteAssetDownload: undefined,
    modelDownloadKey: undefined,
  },
)

const emit = defineEmits<{
  close: []
  'save-compatibility': [payload: {
    compatibleBaseModels: string[]
    controlType: string
    loaderType: string
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
  modelVersions,
  selectedVersion,
  previewSlides,
  activeSlide,
  activeImage,
  activeImageMeta,
  normalizedImageMetaRows,
  activeTriggerWords,
  activePrimaryFile,
  modalTitle,
  modalSubtitle,
  modelTypeLabel,
  baseModelLabel,
  creatorLabel,
  creatorAssetsRoute,
  civitaiModelUrl,
  shouldRenderModal,
  hasDownloadActions,
  close,
  selectVersion,
  showPreviousImage,
  showNextImage,
  handleModalVideoReady,
  downloadForVersion,
  downloadStatusLabel,
  modelDownloadKey,
  canQueueVersion,
  canDeleteVersionDownload,
  versionDownloadButtonLabel,
  queueVersionDownload,
  deleteVersionDownload,
  imageDimensions,
  imageNsfwLabel,
  isImageNsfw,
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
            v-if="isImageNsfw(activeImage)"
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

        <div class="flex h-full min-h-0 items-center justify-center p-6 pt-20">
          <div
            v-if="mediaLoading || civitaiLoading"
            class="absolute inset-0 z-10 flex items-center justify-center bg-background/55 text-sm font-semibold text-foreground backdrop-blur-sm"
            aria-live="polite"
          >
            <LoaderCircle class="mr-2 h-5 w-5 animate-spin text-secondary" />
            Loading preview...
          </div>

          <video
            v-if="displayedImageUrl && activeSlide?.isVideo"
            class="max-h-full max-w-full object-contain"
            :src="displayedImageUrl"
            controls
            autoplay
            loop
            playsinline
            preload="auto"
            @loadeddata="handleModalVideoReady(displayedImageUrl)"
            @canplay="handleModalVideoReady(displayedImageUrl)"
          />
          <img
            v-else-if="displayedImageUrl"
            class="max-h-full max-w-full object-contain"
            :src="displayedImageUrl"
            :alt="`${modalTitle} preview image`"
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
      </section>

      <aside class="min-h-0 overflow-y-auto border-l border-border bg-card p-5">
        <div class="space-y-6">
          <section class="space-y-3">
            <div>
              <p class="text-xs font-semibold uppercase tracking-[0.22em] text-secondary">
                {{ props.kindLabel }}
              </p>
              <h2 class="mt-2 text-lg font-semibold leading-6 text-card-foreground">
                {{ modalTitle }}
              </h2>
              <p
                v-if="modalSubtitle"
                class="mt-1 break-words text-sm text-muted-foreground"
              >
                {{ modalSubtitle }}
              </p>
              <a
                v-if="civitaiModelUrl"
                :href="civitaiModelUrl"
                target="_blank"
                rel="noreferrer"
                class="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-secondary transition hover:text-accent"
              >
                Open on Civitai
                <ExternalLink class="h-3.5 w-3.5" />
              </a>
            </div>

            <p
              v-if="civitaiError"
              class="rounded-md border border-destructive/35 bg-destructive/10 px-3 py-2 text-xs font-semibold text-destructive"
            >
              {{ civitaiError }}
            </p>

            <dl class="grid gap-2 text-sm">
              <div class="rounded-md border border-border bg-background p-3">
                <dt class="text-xs uppercase tracking-[0.14em] text-muted-foreground">Type</dt>
                <dd class="mt-1 font-semibold text-card-foreground">{{ modelTypeLabel }}</dd>
              </div>
              <div class="rounded-md border border-border bg-background p-3">
                <dt class="text-xs uppercase tracking-[0.14em] text-muted-foreground">Base model</dt>
                <dd class="mt-1 font-semibold text-card-foreground">{{ baseModelLabel }}</dd>
              </div>
              <div class="rounded-md border border-border bg-background p-3">
                <dt class="text-xs uppercase tracking-[0.14em] text-muted-foreground">Creator</dt>
                <dd class="mt-1 font-semibold text-card-foreground">
                  <RouterLink
                    v-if="creatorAssetsRoute"
                    :to="creatorAssetsRoute"
                    class="inline-flex max-w-full text-secondary transition hover:text-accent"
                    :aria-label="`Show Assets filtered by creator ${creatorLabel}`"
                  >
                    <span class="truncate">{{ creatorLabel }}</span>
                  </RouterLink>
                  <span v-else>{{ creatorLabel }}</span>
                </dd>
              </div>
              <div
                v-if="civitaiModel?.stats"
                class="rounded-md border border-border bg-background p-3"
              >
                <dt class="text-xs uppercase tracking-[0.14em] text-muted-foreground">Civitai stats</dt>
                <dd class="mt-1 font-semibold text-card-foreground">
                  {{ formatNumber(civitaiModel.stats.downloadCount) }} downloads
                </dd>
              </div>
            </dl>
          </section>

          <AssetPreviewCompatibilityEditor
            v-if="props.editableCompatibility"
            :base-model="props.baseModel"
            :compatibility="props.compatibility"
            :error="props.compatibilityError"
            :saving="props.savingCompatibility"
            @save="emit('save-compatibility', $event)"
          />

          <AssetPreviewVersionList
            v-if="modelVersions.length"
            :model-versions="modelVersions"
            :selected-version="selectedVersion"
            :has-download-actions="hasDownloadActions"
            :civitai-model="civitaiModel"
            :queuing-download-key="props.queuingDownloadKey"
            :download-for-version="downloadForVersion"
            :download-status-label="downloadStatusLabel"
            :model-download-key="modelDownloadKey"
            :can-queue-version="canQueueVersion"
            :can-delete-version-download="canDeleteVersionDownload"
            :version-download-button-label="versionDownloadButtonLabel"
            @select="selectVersion"
            @queue-download="queueVersionDownload"
            @delete-download="deleteVersionDownload"
          />

          <section
            v-if="activeTriggerWords.length"
            class="space-y-3 border-t border-border pt-5"
          >
            <p class="text-xs font-semibold uppercase tracking-[0.22em] text-secondary">
              {{ modelTypeLabel === 'LORA' ? 'LoRA trigger words' : 'Trained words' }}
            </p>
            <div class="flex flex-wrap gap-2">
              <span
                v-for="word in activeTriggerWords"
                :key="word"
                class="rounded-sm border border-accent/30 bg-accent/10 px-2 py-1 text-xs text-accent"
              >
                {{ word }}
              </span>
            </div>
          </section>

          <AssetPreviewFileDetails
            v-if="activePrimaryFile"
            :file="activePrimaryFile"
            :fallback-file-name="props.fileName"
          />

          <section class="space-y-3 border-t border-border pt-5">
            <div>
              <p class="text-xs font-semibold uppercase tracking-[0.22em] text-secondary">Selected image</p>
              <p class="mt-2 text-sm font-semibold text-card-foreground">
                {{ previewSlides.length ? `${activeImageIndex + 1} of ${previewSlides.length}` : 'No image selected' }}
              </p>
            </div>

            <dl class="grid gap-2 text-sm">
              <div class="rounded-md border border-border bg-background p-3">
                <dt class="text-xs uppercase tracking-[0.14em] text-muted-foreground">Source</dt>
                <dd class="mt-1 font-semibold text-card-foreground">
                  {{ activeSlide?.source === 'civitai' ? 'Civitai API' : 'Local preview file' }}
                </dd>
              </div>
              <div class="rounded-md border border-border bg-background p-3">
                <dt class="text-xs uppercase tracking-[0.14em] text-muted-foreground">Dimensions</dt>
                <dd class="mt-1 font-semibold text-card-foreground">{{ imageDimensions(activeImage) }}</dd>
              </div>
              <div class="rounded-md border border-border bg-background p-3">
                <dt class="text-xs uppercase tracking-[0.14em] text-muted-foreground">NSFW</dt>
                <dd class="mt-1 font-semibold text-card-foreground">{{ imageNsfwLabel(activeImage) }}</dd>
              </div>
              <div
                v-if="activeImage?.id"
                class="rounded-md border border-border bg-background p-3"
              >
                <dt class="text-xs uppercase tracking-[0.14em] text-muted-foreground">Image ID</dt>
                <dd class="mt-1 break-all font-mono text-xs text-card-foreground">{{ activeImage.id }}</dd>
              </div>
              <div
                v-if="activeImage?.hash"
                class="rounded-md border border-border bg-background p-3"
              >
                <dt class="text-xs uppercase tracking-[0.14em] text-muted-foreground">Hash</dt>
                <dd class="mt-1 break-all font-mono text-xs text-card-foreground">{{ activeImage.hash }}</dd>
              </div>
            </dl>
          </section>

          <section
            v-if="imageMetaLoading || imageMetaError || activeImageMeta || normalizedImageMetaRows.length"
            class="space-y-3 border-t border-border pt-5"
          >
            <p class="text-xs font-semibold uppercase tracking-[0.22em] text-secondary">Image generation metadata</p>
            <div class="rounded-md border border-accent/35 bg-background p-3">
              <p
                v-if="imageMetaLoading"
                class="inline-flex items-center text-xs font-semibold text-muted-foreground"
              >
                <LoaderCircle class="mr-2 h-4 w-4 animate-spin text-secondary" />
                Loading prompt metadata...
              </p>
              <p
                v-else-if="imageMetaError && !activeImageMeta"
                class="text-xs font-semibold text-destructive"
              >
                {{ imageMetaError }}
              </p>
              <dl
                v-if="normalizedImageMetaRows.length"
                class="grid gap-3 text-xs"
              >
                <div
                  v-for="row in normalizedImageMetaRows"
                  :key="row.label"
                >
                  <dt class="font-semibold uppercase tracking-[0.12em] text-muted-foreground">{{ row.label }}</dt>
                  <dd
                    class="mt-1 whitespace-pre-wrap break-words text-card-foreground"
                    :class="row.mono ? 'font-mono leading-5' : 'font-semibold'"
                  >
                    {{ row.value }}
                  </dd>
                </div>
              </dl>
              <details
                v-if="activeImageMeta"
                class="mt-3"
                :open="!normalizedImageMetaRows.length"
              >
                <summary class="cursor-pointer text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Raw meta
                </summary>
                <pre class="mt-2 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-sm bg-primary p-3 text-xs leading-5 text-primary-foreground/85">{{ activeImageMeta }}</pre>
              </details>
            </div>
          </section>
        </div>
      </aside>
  </div>
</template>
