<script setup lang="ts">
import { Database, ExternalLink } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'

import {
  formatNumber,
  imageDimensions as formatImageDimensions,
  mediaExtensionFromUrl,
} from './assetPreviewHelpers'
import AssetPreviewCompatibilityEditor from './AssetPreviewCompatibilityEditor.vue'
import AssetPreviewFeedPanel from './AssetPreviewFeedPanel.vue'
import AssetPreviewFileDetails from './AssetPreviewFileDetails.vue'
import AssetPreviewImageMetadataSection from './AssetPreviewImageMetadataSection.vue'
import AssetPreviewImageSafetyEditor from './AssetPreviewImageSafetyEditor.vue'
import AssetPreviewPreviewRepairAction from './AssetPreviewPreviewRepairAction.vue'
import AssetPreviewSafetyEditor from './AssetPreviewSafetyEditor.vue'
import AssetPreviewVersionList from './AssetPreviewVersionList.vue'
import type { AtlasReactionType } from './assetPreviewAtlasMedia'
import type {
  AssetPreviewDownload,
  CivitaiModel,
  CivitaiModelFile,
  CivitaiModelVersion,
  NormalizedMetaRow,
  PreviewSlide,
} from './assetPreviewTypes'
import UiTooltip from '../ui/UiTooltip.vue'

type SidebarTab = 'model' | 'media' | 'feed'

const props = defineProps<{
  kindLabel: string
  modalTitle: string
  modalSubtitle: string
  modelTypeLabel: string
  civitaiModel: CivitaiModel | null
  civitaiError: string
  civitaiModelUrl: string
  atlasConfigured: boolean
  atlasOpenError: string
  atlasOpening: boolean
  selectedVersion: CivitaiModelVersion | null
  modelVersions: CivitaiModelVersion[]
  hasDownloadActions: boolean
  queuingDownloadKey: string
  editableCompatibility: boolean
  editableSafety: boolean
  savingCompatibility: boolean
  savingSafety: boolean
  savingImageSafety: boolean
  compatibility: {
    compatibleBaseModels?: string[]
    modelNsfw?: boolean | null
    modelNsfwOverride?: boolean | null
    imageSafetyOverrides?: Record<string, { imageNsfw?: boolean | null; imageNsfwOverride?: boolean | null }>
    controlType?: string
    loaderType?: string
    status?: string
  } | null
  compatibilityError: string
  safetyError: string
  imageSafetyError: string
  activeTriggerWords: string[]
  activePrimaryFile: CivitaiModelFile | null
  previewSlides: PreviewSlide[]
  feedSlides: PreviewSlide[]
  activeImageIndex: number
  activeSlide: PreviewSlide | null
  activeImage: PreviewSlide['image']
  activeImageSafetyKey: string
  activeImageDetectedNsfw: boolean | null
  activeImageNsfwOverride: boolean | null
  activeImageSafetyLabel: string
  imageMetaLoading: boolean
  imageMetaError: string
  activeImageMeta: string
  normalizedImageMetaRows: NormalizedMetaRow[]
  activeImageMetaSource: Record<string, unknown> | null
  blurNsfwContent?: boolean
  feedLoading: boolean
  feedLoadingMore: boolean
  feedError: string
  atlasBaseUrl: string
  atlasActionError: string
  atlasDeletePendingKey: string
  atlasReactionPendingKey: string
  canLoadMoreFeed: boolean
  applyGenerationMetadata?: (metadata: Record<string, unknown>) => void | Promise<void>
  repairDownloadPreviews?: (download: AssetPreviewDownload) => void | Promise<void>
  downloadForVersion: (version: CivitaiModelVersion | null | undefined) => AssetPreviewDownload | null
  downloadStatusLabel: (download: AssetPreviewDownload | null) => string
  modelDownloadKey: (model: CivitaiModel, version: CivitaiModelVersion) => string
  canQueueVersion: (version: CivitaiModelVersion) => boolean
  canDeleteVersionDownload: (version: CivitaiModelVersion) => boolean
  versionDownloadButtonLabel: (version: CivitaiModelVersion) => string
  imageDimensions: typeof formatImageDimensions
}>()

const emit = defineEmits<{
  'save-compatibility': [payload: { compatibleBaseModels: string[]; controlType: string; loaderType: string }]
  'save-safety': [payload: { modelNsfw: boolean | null; modelNsfwOverride: boolean | null }]
  'save-image-safety': [payload: { imageKey: string; imageNsfw: boolean | null; imageNsfwOverride: boolean | null }]
  'select-version': [version: CivitaiModelVersion]
  'queue-download': [version: CivitaiModelVersion]
  'delete-download': [version: CivitaiModelVersion]
  'select-preview': [index: number]
  'select-feed-preview': [index: number]
  'load-more-feed': []
  'retry-feed': []
  'atlas-react-feed-preview': [index: number, type?: AtlasReactionType]
  'atlas-delete-feed-preview': [index: number]
  'open-atlas-model': []
  'request-image-metadata': []
  close: []
}>()

const activeTab = ref<SidebarTab>('model')

const creatorUsername = computed(() => props.civitaiModel?.creator?.username?.trim() ?? '')
const creatorLabel = computed(() => creatorUsername.value || 'Unknown creator')
const modelTypeValue = computed(() => props.modelTypeLabel.trim() || props.kindLabel || 'Unknown')
const showModelTypeBadge = computed(() => !['model', 'preview'].includes(modelTypeValue.value.toLowerCase()))
const creatorAssetsRoute = computed(() => {
  return creatorUsername.value
    ? { name: 'assets', query: { username: creatorUsername.value } }
    : null
})
const hasActiveImage = computed(() => Boolean(props.activeImage))

watch(
  () => props.selectedVersion?.id ?? null,
  () => {
    if (activeTab.value === 'feed' && props.previewSlides.length === 0) {
      activeTab.value = 'model'
    }
  },
)

watch(
  () => [activeTab.value, props.activeImage?.id ?? null] as const,
  ([tab]) => {
    if (tab === 'media') {
      emit('request-image-metadata')
    }
  },
  { flush: 'post' },
)

function tabClasses(tab: SidebarTab) {
  return [
    'rounded-md px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] transition',
    activeTab.value === tab
      ? 'bg-secondary text-secondary-foreground'
      : 'bg-background text-muted-foreground hover:text-card-foreground',
  ]
}

function mediaKindLabel(slide: PreviewSlide) {
  if (slide.isVideo) {
    return 'Video'
  }

  return mediaExtensionFromUrl(slide.url) === 'gif' ? 'GIF' : 'Image'
}

function mediaSourceLabel(slide: PreviewSlide | null) {
  if (slide?.source === 'archive') {
    return 'Offline archive'
  }

  return slide?.source === 'civitai' ? 'Civitai API' : 'Local preview file'
}

</script>

<template>
  <aside class="min-h-0 overflow-y-auto border-l border-border bg-card p-5">
    <div class="space-y-5">
      <section class="space-y-3">
        <div class="flex min-w-0 items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="flex min-w-0 flex-wrap items-center gap-2">
              <h2 class="min-w-0 text-lg font-semibold leading-6 text-card-foreground">
                {{ modalTitle }}
              </h2>
              <span
                v-if="showModelTypeBadge"
                class="inline-flex h-6 shrink-0 items-center rounded-sm border border-secondary/30 bg-secondary/10 px-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-secondary"
                data-test="asset-preview-model-type-badge"
              >
                {{ modelTypeValue }}
              </span>
            </div>
            <p
              v-if="modalSubtitle"
              class="mt-1 break-words text-sm text-muted-foreground"
              data-test="asset-preview-modal-subtitle"
            >
              {{ modalSubtitle }}
            </p>
          </div>

          <UiTooltip
            v-if="civitaiModelUrl"
            content="Open on Civitai"
          >
            <a
              :href="civitaiModelUrl"
              target="_blank"
              rel="noreferrer"
              class="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-background text-secondary transition hover:border-secondary hover:text-accent focus:outline-none focus:ring-2 focus:ring-ring/25"
              :aria-label="`Open ${modalTitle} on Civitai`"
              data-test="asset-preview-civitai-link"
            >
              <ExternalLink class="h-3.5 w-3.5" />
            </a>
          </UiTooltip>
          <UiTooltip
            v-if="atlasConfigured && civitaiModel"
            content="Open in Atlas"
          >
            <button
              type="button"
              class="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-background text-secondary transition hover:border-secondary hover:text-accent focus:outline-none focus:ring-2 focus:ring-ring/25 disabled:cursor-wait disabled:opacity-60"
              :disabled="atlasOpening"
              :aria-label="`Open ${modalTitle} in Atlas`"
              data-test="asset-preview-atlas-link"
              @click="emit('open-atlas-model')"
            >
              <Database class="h-3.5 w-3.5" />
            </button>
          </UiTooltip>
        </div>

        <p
          v-if="civitaiError"
          class="rounded-md border border-destructive/35 bg-destructive/10 px-3 py-2 text-xs font-semibold text-destructive"
        >
          {{ civitaiError }}
        </p>
        <p
          v-if="atlasOpenError"
          class="rounded-md border border-destructive/35 bg-destructive/10 px-3 py-2 text-xs font-semibold text-destructive"
          data-test="asset-preview-atlas-open-error"
        >
          {{ atlasOpenError }}
        </p>
        <AssetPreviewPreviewRepairAction
          :download="downloadForVersion(selectedVersion)"
          :repair-download-previews="repairDownloadPreviews"
        />
      </section>

      <nav class="flex flex-wrap gap-2 border-t border-border pt-5">
        <button type="button" :class="tabClasses('model')" aria-label="Show model details" @click="activeTab = 'model'">
          Model
        </button>
        <button type="button" :class="tabClasses('media')" aria-label="Show image and video details" @click="activeTab = 'media'">
          Image/Video
        </button>
        <button type="button" :class="tabClasses('feed')" aria-label="Show feed" @click="activeTab = 'feed'">
          Feed
        </button>
      </nav>

      <div v-if="activeTab === 'model'" class="space-y-6">
        <dl class="grid gap-2 text-xs text-card-foreground">
          <div
            class="flex items-center justify-between gap-3 rounded-md border border-border bg-background p-3"
            data-test="asset-preview-model-detail-row"
          >
            <dt class="text-muted-foreground">Type</dt>
            <dd class="min-w-0 truncate font-semibold">{{ modelTypeValue }}</dd>
          </div>
          <div
            class="flex items-center justify-between gap-3 rounded-md border border-border bg-background p-3"
            data-test="asset-preview-model-detail-row"
          >
            <dt class="text-muted-foreground">Base model</dt>
            <dd class="min-w-0 truncate font-semibold">{{ selectedVersion?.baseModel ?? 'Unknown' }}</dd>
          </div>
          <div
            class="flex items-center justify-between gap-3 rounded-md border border-border bg-background p-3"
            data-test="asset-preview-model-detail-row"
          >
            <dt class="text-muted-foreground">Creator</dt>
            <dd class="min-w-0 truncate font-semibold">
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
            class="flex items-center justify-between gap-3 rounded-md border border-border bg-background p-3"
            data-test="asset-preview-model-detail-row"
          >
            <dt class="text-muted-foreground">Stats</dt>
            <dd class="min-w-0 truncate font-semibold">
              {{ formatNumber(civitaiModel.stats.downloadCount) }} downloads
            </dd>
          </div>
        </dl>

        <AssetPreviewSafetyEditor
          v-if="editableSafety"
          :model-nsfw="compatibility?.modelNsfw ?? null"
          :model-nsfw-override="compatibility?.modelNsfwOverride ?? null"
          :error="safetyError"
          :saving="savingSafety"
          @save="emit('save-safety', $event)"
        />

        <AssetPreviewCompatibilityEditor
          v-if="editableCompatibility"
          :base-model="selectedVersion?.baseModel ?? null"
          :compatibility="compatibility"
          :error="compatibilityError"
          :saving="savingCompatibility"
          @save="emit('save-compatibility', $event)"
        />

        <AssetPreviewVersionList
          v-if="modelVersions.length"
          :model-versions="modelVersions"
          :selected-version="selectedVersion"
          :has-download-actions="hasDownloadActions"
          :civitai-model="civitaiModel"
          :queuing-download-key="queuingDownloadKey"
          :download-for-version="downloadForVersion"
          :download-status-label="downloadStatusLabel"
          :model-download-key="modelDownloadKey"
          :can-queue-version="canQueueVersion"
          :can-delete-version-download="canDeleteVersionDownload"
          :version-download-button-label="versionDownloadButtonLabel"
          @select="emit('select-version', $event)"
          @queue-download="emit('queue-download', $event)"
          @delete-download="emit('delete-download', $event)"
        />

        <section
          v-if="activeTriggerWords.length"
          class="space-y-3 border-t border-border pt-5"
        >
          <p class="text-xs font-semibold uppercase tracking-[0.22em] text-secondary">
            {{ civitaiModel?.type === 'LORA' ? 'LoRA trigger words' : 'Trained words' }}
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
          :fallback-file-name="activePrimaryFile?.name ?? null"
        />

        <AssetPreviewImageMetadataSection
          :loading="imageMetaLoading"
          :error="imageMetaError"
          :metadata-text="activeImageMeta"
          :rows="normalizedImageMetaRows"
          :metadata-source="activeImageMetaSource"
          :apply-generation-metadata="applyGenerationMetadata"
          @applied="emit('close')"
        />
      </div>

      <div v-else-if="activeTab === 'media'" class="space-y-6">
        <section class="space-y-3">
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
                {{ mediaSourceLabel(activeSlide) }}
              </dd>
            </div>
            <div class="rounded-md border border-border bg-background p-3">
              <dt class="text-xs uppercase tracking-[0.14em] text-muted-foreground">Type</dt>
              <dd class="mt-1 font-semibold text-card-foreground">
                {{ activeSlide ? mediaKindLabel(activeSlide) : 'Unknown' }}
              </dd>
            </div>
            <div class="rounded-md border border-border bg-background p-3">
              <dt class="text-xs uppercase tracking-[0.14em] text-muted-foreground">Dimensions</dt>
              <dd class="mt-1 font-semibold text-card-foreground">{{ imageDimensions(activeImage) }}</dd>
            </div>
            <div class="rounded-md border border-border bg-background p-3">
              <dt class="text-xs uppercase tracking-[0.14em] text-muted-foreground">NSFW</dt>
              <dd class="mt-1 font-semibold text-card-foreground">{{ activeImageSafetyLabel }}</dd>
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

        <AssetPreviewImageSafetyEditor
          :editable="editableSafety"
          :image-key="activeImageSafetyKey"
          :detected-nsfw="activeImageDetectedNsfw"
          :override-nsfw="activeImageNsfwOverride"
          :error="imageSafetyError"
          :saving="savingImageSafety"
          @save="emit('save-image-safety', $event)"
        />

        <AssetPreviewImageMetadataSection
          :loading="imageMetaLoading"
          :error="imageMetaError"
          :metadata-text="activeImageMeta"
          :rows="normalizedImageMetaRows"
          :metadata-source="activeImageMetaSource"
          :show-empty="hasActiveImage"
          :apply-generation-metadata="applyGenerationMetadata"
          @applied="emit('close')"
        />
      </div>

      <AssetPreviewFeedPanel
        v-else
        :model-versions="modelVersions"
        :selected-version="selectedVersion"
        :feed-slides="feedSlides"
        :active-slide="activeSlide"
        :blur-nsfw-content="blurNsfwContent"
        :feed-loading="feedLoading"
        :feed-loading-more="feedLoadingMore"
        :feed-error="feedError"
        :atlas-base-url="atlasBaseUrl"
        :atlas-action-error="atlasActionError"
        :atlas-delete-pending-key="atlasDeletePendingKey"
        :atlas-reaction-pending-key="atlasReactionPendingKey"
        :atlas-configured="atlasConfigured"
        :can-load-more-feed="canLoadMoreFeed"
        @select-version="emit('select-version', $event)"
        @select-feed-preview="emit('select-feed-preview', $event)"
        @load-more="emit('load-more-feed')"
        @retry="emit('retry-feed')"
        @atlas-react="(index, type) => emit('atlas-react-feed-preview', index, type)"
        @atlas-delete="(index) => emit('atlas-delete-feed-preview', index)"
      />
    </div>
  </aside>
</template>
