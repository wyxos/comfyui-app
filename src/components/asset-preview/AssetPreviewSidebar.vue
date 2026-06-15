<script setup lang="ts">
import { ExternalLink } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'

import {
  formatNumber,
  imageDimensions as formatImageDimensions,
  imageNsfwDetectedValue,
  mediaExtensionFromUrl,
  modelVersionLabel,
} from './assetPreviewHelpers'
import AssetPreviewCompatibilityEditor from './AssetPreviewCompatibilityEditor.vue'
import AssetPreviewFileDetails from './AssetPreviewFileDetails.vue'
import AssetPreviewImageMetadataSection from './AssetPreviewImageMetadataSection.vue'
import AssetPreviewImageSafetyEditor from './AssetPreviewImageSafetyEditor.vue'
import AssetPreviewPreviewRepairAction from './AssetPreviewPreviewRepairAction.vue'
import AssetPreviewSafetyEditor from './AssetPreviewSafetyEditor.vue'
import AssetPreviewVersionList from './AssetPreviewVersionList.vue'
import type {
  AssetPreviewDownload,
  CivitaiModel,
  CivitaiModelFile,
  CivitaiModelVersion,
  NormalizedMetaRow,
  PreviewSlide,
} from './assetPreviewTypes'
import UiPreloadedMedia from '../ui/UiPreloadedMedia.vue'

type SidebarTab = 'model' | 'media' | 'feed'

const props = defineProps<{
  kindLabel: string
  modalTitle: string
  modalSubtitle: string
  civitaiModel: CivitaiModel | null
  civitaiError: string
  civitaiModelUrl: string
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
  feedError: string
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
  close: []
}>()

const activeTab = ref<SidebarTab>('model')

const creatorUsername = computed(() => props.civitaiModel?.creator?.username?.trim() ?? '')
const creatorLabel = computed(() => creatorUsername.value || 'Unknown creator')
const creatorAssetsRoute = computed(() => {
  return creatorUsername.value
    ? { name: 'assets', query: { username: creatorUsername.value } }
    : null
})

watch(
  () => props.selectedVersion?.id ?? null,
  () => {
    if (activeTab.value === 'feed' && props.previewSlides.length === 0) {
      activeTab.value = 'model'
    }
  },
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

function feedItemLabel(index: number) {
  return `Open feed media ${index + 1}`
}

function feedMediaClass(slide: PreviewSlide) {
  return props.blurNsfwContent === true && imageNsfwDetectedValue(slide.image) === true
    ? 'h-full w-full object-cover blur-sm saturate-50'
    : 'h-full w-full object-cover'
}
</script>

<template>
  <aside class="min-h-0 overflow-y-auto border-l border-border bg-card p-5">
    <div class="space-y-5">
      <section class="space-y-3">
        <div>
          <p class="text-xs font-semibold uppercase tracking-[0.22em] text-secondary">
            {{ kindLabel }}
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
        <dl class="grid gap-2 text-sm">
          <div class="rounded-md border border-border bg-background p-3">
            <dt class="text-xs uppercase tracking-[0.14em] text-muted-foreground">Type</dt>
            <dd class="mt-1 font-semibold text-card-foreground">{{ civitaiModel?.type ?? kindLabel }}</dd>
          </div>
          <div class="rounded-md border border-border bg-background p-3">
            <dt class="text-xs uppercase tracking-[0.14em] text-muted-foreground">Base model</dt>
            <dd class="mt-1 font-semibold text-card-foreground">{{ selectedVersion?.baseModel ?? 'Unknown' }}</dd>
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
                {{ activeSlide?.source === 'archive' ? 'Offline archive' : activeSlide?.source === 'civitai' ? 'Civitai API' : 'Local preview file' }}
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
          :apply-generation-metadata="applyGenerationMetadata"
          @applied="emit('close')"
        />
      </div>

      <div v-else class="space-y-4">
        <div class="space-y-3">
          <div class="flex flex-wrap gap-2">
            <button
              v-for="version in modelVersions"
              :key="version.id"
              data-test="asset-preview-feed-version-badge"
              type="button"
              :aria-label="`Filter feed to version ${modelVersionLabel(version)}`"
              :class="[
                'rounded-sm border px-2.5 py-1 text-xs font-semibold transition',
                version.id === selectedVersion?.id
                  ? 'border-secondary bg-secondary text-secondary-foreground'
                  : 'border-border bg-background text-muted-foreground hover:text-card-foreground',
              ]"
              @click="emit('select-version', version)"
            >
              {{ version.name ?? `Version ${version.id}` }}
            </button>
          </div>
          <p class="text-xs text-muted-foreground">
            Latest {{ feedSlides.length || 20 }} items for {{ selectedVersion ? modelVersionLabel(selectedVersion) : 'this model version' }}.
          </p>
        </div>

        <p
          v-if="feedError"
          class="rounded-md border border-destructive/35 bg-destructive/10 px-3 py-2 text-xs font-semibold text-destructive"
        >
          {{ feedError }}
        </p>

        <div
          v-if="feedLoading"
          class="rounded-md border border-border bg-background px-3 py-4 text-sm font-semibold text-muted-foreground"
        >
          Loading recent media…
        </div>

        <div
          v-else-if="feedSlides.length"
          class="space-y-3"
        >
          <button
            v-for="(slide, index) in feedSlides"
            :key="slide.key"
            data-test="asset-preview-feed-item"
            type="button"
            :aria-label="feedItemLabel(index)"
            :class="[
              'grid w-full grid-cols-[6rem_minmax(0,1fr)] gap-3 rounded-md border bg-background p-3 text-left transition',
              slide.key === activeSlide?.key
                ? 'border-secondary shadow-[0_0_0_1px_rgba(240,200,8,0.35)]'
                : 'border-border hover:border-accent/50',
            ]"
            @click="emit('select-feed-preview', index)"
          >
            <div class="h-24 overflow-hidden rounded-sm border border-border bg-card">
              <UiPreloadedMedia
                :src="slide.url"
                :is-video="slide.isVideo"
                :alt="`Feed preview ${index + 1}`"
                label=""
                :media-class="feedMediaClass(slide)"
                loading-class="bg-background/35"
                spinner-class="h-3 w-3"
                :autoplay="slide.isVideo"
                :loop="slide.isVideo"
                :muted="slide.isVideo"
                preload="metadata"
              />
            </div>
            <div class="min-w-0 space-y-2">
              <div class="flex items-center gap-2">
                <span class="rounded-sm bg-primary px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-primary-foreground">
                  {{ mediaKindLabel(slide) }}
                </span>
                <span class="text-xs text-muted-foreground">
                  {{ index + 1 }}
                </span>
              </div>
              <p class="truncate text-sm font-semibold text-card-foreground">
                {{ slide.url }}
              </p>
              <p class="text-xs text-muted-foreground">
                {{ slide.source === 'archive' ? 'Offline archive' : 'Civitai API' }}
              </p>
            </div>
          </button>
        </div>

        <div
          v-else
          class="rounded-md border border-border bg-background px-3 py-4 text-sm font-semibold text-muted-foreground"
        >
          No feed media available for this model version.
        </div>
      </div>
    </div>
  </aside>
</template>
