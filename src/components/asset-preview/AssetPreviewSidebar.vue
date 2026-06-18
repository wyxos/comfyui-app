<script setup lang="ts">
import { Database, ExternalLink } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'

import {
  formatNumber,
} from './assetPreviewHelpers'
import AssetPreviewCompatibilityEditor from './AssetPreviewCompatibilityEditor.vue'
import AssetPreviewFeedPanel from './AssetPreviewFeedPanel.vue'
import AssetPreviewFileDetails from './AssetPreviewFileDetails.vue'
import AssetPreviewPreviewRepairAction from './AssetPreviewPreviewRepairAction.vue'
import AssetPreviewSafetyEditor from './AssetPreviewSafetyEditor.vue'
import AssetPreviewVersionList from './AssetPreviewVersionList.vue'
import type { AtlasReactionType } from './assetPreviewAtlasMedia'
import type {
  AssetPreviewDownload,
  CivitaiModel,
  CivitaiModelFile,
  CivitaiModelVersion,
  PreviewSlide,
} from './assetPreviewTypes'
import UiTooltip from '../ui/UiTooltip.vue'

type SidebarTab = 'model' | 'feed'

const props = defineProps<{
  kindLabel: string
  modalTitle: string
  modalSubtitle: string
  modelTypeLabel: string
  modelIdentifier: number | null
  versionIdentifier: number | null
  fileIdentifier: number | null
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
  activeTriggerWords: string[]
  activePrimaryFile: CivitaiModelFile | null
  previewSlides: PreviewSlide[]
  feedSlides: PreviewSlide[]
  activeSlide: PreviewSlide | null
  blurNsfwMediaLevel?: 4 | 8 | 16 | 32 | null
  feedLoading: boolean
  feedLoadingMore: boolean
  feedError: string
  atlasBaseUrl: string
  atlasActionError: string
  atlasDeletePendingKey: string
  atlasReactionPendingKey: string
  atlasReactionPendingType: AtlasReactionType | null
  canLoadMoreFeed: boolean
  repairDownloadPreviews?: (download: AssetPreviewDownload) => void | Promise<void>
  downloadForVersion: (version: CivitaiModelVersion | null | undefined) => AssetPreviewDownload | null
  downloadStatusLabel: (download: AssetPreviewDownload | null) => string
  modelDownloadKey: (model: CivitaiModel, version: CivitaiModelVersion) => string
  canQueueVersion: (version: CivitaiModelVersion) => boolean
  canDeleteVersionDownload: (version: CivitaiModelVersion) => boolean
  versionDownloadButtonLabel: (version: CivitaiModelVersion) => string
}>()

const emit = defineEmits<{
  'save-compatibility': [payload: { compatibleBaseModels: string[]; controlType: string; loaderType: string }]
  'save-safety': [payload: { modelNsfw: boolean | null; modelNsfwOverride: boolean | null }]
  'select-version': [version: CivitaiModelVersion]
  'queue-download': [version: CivitaiModelVersion]
  'delete-download': [version: CivitaiModelVersion]
  'select-feed-preview': [index: number]
  'load-more-feed': []
  'retry-feed': []
  'atlas-react-feed-preview': [index: number, type?: AtlasReactionType]
  'atlas-delete-feed-preview': [index: number]
  'open-atlas-model': []
}>()

const activeTab = ref<SidebarTab>('model')

const creatorUsername = computed(() => props.civitaiModel?.creator?.username?.trim() ?? '')
const creatorLabel = computed(() => creatorUsername.value || 'Unknown creator')
const modelTypeValue = computed(() => props.modelTypeLabel.trim() || props.kindLabel || 'Unknown')
const showModelTypeBadge = computed(() => !['model', 'preview'].includes(modelTypeValue.value.toLowerCase()))
const modelIdentifierRows = computed(() => [
  { label: 'Model ID', value: props.modelIdentifier },
  { label: 'Version ID', value: props.versionIdentifier },
  { label: 'File ID', value: props.fileIdentifier },
].filter((row): row is { label: string; value: number } => row.value !== null))
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
    'inline-flex h-8 items-center justify-center rounded-sm px-2 text-[11px] font-semibold uppercase tracking-[0.14em] transition focus:outline-none focus:ring-2 focus:ring-ring/25',
    activeTab.value === tab
      ? 'bg-secondary text-secondary-foreground shadow-sm'
      : 'text-muted-foreground hover:bg-card hover:text-card-foreground',
  ]
}

</script>

<template>
  <aside
    class="min-h-0 overflow-y-auto bg-card p-5"
    data-test="asset-preview-model-sidebar"
  >
    <div class="space-y-5">
      <section class="space-y-3">
        <div class="min-w-0">
          <h2 class="min-w-0 text-lg font-semibold leading-6 text-card-foreground">
            {{ modalTitle }}
          </h2>
          <div class="mt-2 flex min-w-0 flex-wrap items-center gap-2">
            <span
              v-if="showModelTypeBadge"
              class="inline-flex h-6 shrink-0 items-center rounded-sm border border-secondary/30 bg-secondary/10 px-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-secondary"
              data-test="asset-preview-model-type-badge"
            >
              {{ modelTypeValue }}
            </span>
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
            <p
              v-if="modalSubtitle"
              class="min-w-0 break-words text-sm text-muted-foreground"
              data-test="asset-preview-modal-subtitle"
            >
              {{ modalSubtitle }}
            </p>
          </div>
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
      </section>

      <nav class="grid grid-cols-2 rounded-md border border-border bg-background p-1">
        <button type="button" :class="tabClasses('model')" aria-label="Show model details" @click="activeTab = 'model'">
          Model
        </button>
        <button type="button" :class="tabClasses('feed')" aria-label="Show feed" @click="activeTab = 'feed'">
          Feed
        </button>
      </nav>

      <div v-if="activeTab === 'model'" class="space-y-6">
        <dl
          class="overflow-hidden rounded-md border border-border bg-background text-xs text-card-foreground divide-y divide-border/70"
          data-test="asset-preview-model-detail-group"
        >
          <div
            class="flex items-center justify-between gap-3 px-3 py-2.5"
            data-test="asset-preview-model-detail-row"
          >
            <dt class="text-muted-foreground">Type</dt>
            <dd class="min-w-0 truncate font-semibold">{{ modelTypeValue }}</dd>
          </div>
          <div
            class="flex items-center justify-between gap-3 px-3 py-2.5"
            data-test="asset-preview-model-detail-row"
          >
            <dt class="text-muted-foreground">Base model</dt>
            <dd class="min-w-0 truncate font-semibold">{{ selectedVersion?.baseModel ?? 'Unknown' }}</dd>
          </div>
          <div
            v-for="row in modelIdentifierRows"
            :key="row.label"
            class="flex items-center justify-between gap-3 px-3 py-2.5"
            data-test="asset-preview-model-detail-row"
          >
            <dt class="text-muted-foreground">{{ row.label }}</dt>
            <dd class="min-w-0 truncate font-mono text-xs font-semibold">{{ row.value }}</dd>
          </div>
          <div
            class="flex items-center justify-between gap-3 px-3 py-2.5"
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
            class="flex items-center justify-between gap-3 px-3 py-2.5"
            data-test="asset-preview-model-detail-row"
          >
            <dt class="text-muted-foreground">Stats</dt>
            <dd class="min-w-0 truncate font-semibold">
              {{ formatNumber(civitaiModel.stats.downloadCount) }} downloads
            </dd>
          </div>
        </dl>

        <AssetPreviewPreviewRepairAction
          :download="downloadForVersion(selectedVersion)"
          :repair-download-previews="repairDownloadPreviews"
        />

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
            Trigger words
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

      <AssetPreviewFeedPanel
        v-else
        :model-versions="modelVersions"
        :selected-version="selectedVersion"
        :feed-slides="feedSlides"
        :active-slide="activeSlide"
        :blur-nsfw-media-level="blurNsfwMediaLevel"
        :feed-loading="feedLoading"
        :feed-loading-more="feedLoadingMore"
        :feed-error="feedError"
        :atlas-base-url="atlasBaseUrl"
        :atlas-action-error="atlasActionError"
        :atlas-delete-pending-key="atlasDeletePendingKey"
        :atlas-reaction-pending-key="atlasReactionPendingKey"
        :atlas-reaction-pending-type="atlasReactionPendingType"
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
