<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { ChevronDown, LoaderCircle, X } from 'lucide-vue-next'
import AssetPreviewModal from '../../components/asset-preview/AssetPreviewModal.vue'
import UiPreloadedMedia from '../../components/ui/UiPreloadedMedia.vue'
import UiTooltip from '../../components/ui/UiTooltip.vue'
import { useProvidedHomeView } from './homeViewContext'
import HomeCheckpointControlNetPicker from './HomeCheckpointControlNetPicker.vue'
import HomeCheckpointLoraPicker from './HomeCheckpointLoraPicker.vue'
import type { HomeCheckpointEntry } from './useHomeView'

const props = defineProps<{
  checkpoint: HomeCheckpointEntry
}>()

const {
  isVideoPreview,
  removeSelectedCheckpoint,
  toggleSelectedCheckpoint,
  assetPreviewDownloadActions,
  applyGenerationMetadataFromSource,
  saveModelSafetyOverride,
  saveModelImageSafetyOverride,
  loadingCheckpoints,
} = useProvidedHomeView()
const {
  queuingDownloadKey,
  downloadForVersion,
  downloadStatusLabel,
  queueAssetDownload,
  deleteAssetDownload,
  repairDownloadPreviews,
  modelDownloadKey,
  startPolling,
  stopPolling,
} = assetPreviewDownloadActions

const isCheckpointPreviewOpen = ref(false)
const isAssetsExpanded = ref(true)
const savingSafety = ref(false)
const safetyError = ref('')
const savingImageSafety = ref(false)
const imageSafetyError = ref('')
const loraCount = computed(() => props.checkpoint.loras.length)
const controlNetCount = computed(() => props.checkpoint.controlNets?.length ?? 0)
const checkpointPreviewIsVideo = computed(() =>
  isVideoPreview(props.checkpoint.previewUrl, props.checkpoint.previewMediaType),
)
const checkpointPreviewSubtitle = computed(() =>
  props.checkpoint.displayName !== props.checkpoint.name
    ? props.checkpoint.name
    : `${props.checkpoint.family.toUpperCase()} checkpoint`,
)
const checkpointCivitaiModelId = computed(() => props.checkpoint.compatibility?.modelId ?? null)
const checkpointCivitaiVersionId = computed(() => props.checkpoint.compatibility?.versionId ?? null)
const canOpenCheckpointPreview = computed(() => Boolean(props.checkpoint.previewUrl || checkpointCivitaiModelId.value))
const assetDetailsId = computed(() => `checkpoint-assets-${props.checkpoint.name.replace(/[^a-zA-Z0-9_-]/g, '-')}`)

function assetCountLabel(count: number, singular: string) {
  return `${count} ${singular}${count === 1 ? '' : 's'}`
}

function openCheckpointPreview() {
  if (canOpenCheckpointPreview.value) {
    safetyError.value = ''
    imageSafetyError.value = ''
    isCheckpointPreviewOpen.value = true
  }
}

async function saveCheckpointSafety(payload: { modelNsfwOverride: boolean | null }) {
  if (savingSafety.value) {
    return
  }

  savingSafety.value = true
  safetyError.value = ''
  try {
    await saveModelSafetyOverride({
      modelName: props.checkpoint.name,
      modelType: 'checkpoint',
      modelNsfwOverride: payload.modelNsfwOverride,
    })
  } catch (error) {
    safetyError.value = error instanceof Error ? error.message : 'Could not save safety override.'
  } finally {
    savingSafety.value = false
  }
}

async function saveCheckpointImageSafety(payload: { imageKey: string; imageNsfwOverride: boolean | null }) {
  if (savingImageSafety.value) {
    return
  }

  savingImageSafety.value = true
  imageSafetyError.value = ''
  try {
    await saveModelImageSafetyOverride({
      modelName: props.checkpoint.name,
      modelType: 'checkpoint',
      imageKey: payload.imageKey,
      imageNsfwOverride: payload.imageNsfwOverride,
    })
  } catch (error) {
    imageSafetyError.value = error instanceof Error ? error.message : 'Could not save image safety override.'
  } finally {
    savingImageSafety.value = false
  }
}

watch(isCheckpointPreviewOpen, (isOpen) => {
  if (isOpen) {
    startPolling()
    return
  }

  stopPolling()
})

onBeforeUnmount(() => {
  if (isCheckpointPreviewOpen.value) {
    stopPolling()
  }
})
</script>

<template>
  <div
    class="rounded-md border px-3 py-3 transition-colors"
    :class="
      checkpoint.enabled
        ? 'border-primary-foreground/12 bg-primary'
        : 'border-primary-foreground/20 bg-primary-foreground/6'
    "
  >
    <div class="flex items-start gap-3">
      <button
        v-if="checkpoint.previewUrl"
        type="button"
        class="h-14 w-14 shrink-0 overflow-hidden rounded-sm border border-primary-foreground/12 transition hover:border-accent focus:outline-none focus:ring-2 focus:ring-ring/25"
        :aria-label="`Open ${checkpoint.name} preview`"
        @click="openCheckpointPreview"
      >
        <UiPreloadedMedia
          :src="checkpoint.previewUrl"
          :is-video="checkpointPreviewIsVideo"
          :alt="`${checkpoint.name} preview`"
          label=""
          media-class="h-full w-full object-cover"
          loading-class="bg-primary/80 text-primary-foreground"
          spinner-class="mr-0 h-4 w-4"
          muted
          loop
          autoplay
          playsinline
          preload="metadata"
          :aria-label="checkpointPreviewIsVideo ? `${checkpoint.name} video preview` : undefined"
          :loading="checkpointPreviewIsVideo ? undefined : 'lazy'"
        />
      </button>
      <div
        v-else-if="loadingCheckpoints"
        role="status"
        :aria-label="`Loading ${checkpoint.name} preview`"
        class="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-sm border border-primary-foreground/12 bg-primary-foreground/6 text-primary-foreground/64"
      >
        <LoaderCircle class="h-4 w-4 animate-spin text-secondary" />
      </div>

      <div class="min-w-0 flex-1">
        <button
          v-if="canOpenCheckpointPreview"
          type="button"
          class="block max-w-full truncate text-left text-sm font-semibold text-primary-foreground transition hover:text-secondary focus:outline-none focus:ring-2 focus:ring-ring/25"
          @click="openCheckpointPreview"
        >
          {{ checkpoint.displayName }}
        </button>
        <p
          v-else
          class="truncate text-sm font-semibold text-primary-foreground"
        >
          {{ checkpoint.displayName }}
        </p>
        <p
          v-if="checkpoint.displayName !== checkpoint.name"
          class="mt-0.5 truncate text-[11px] text-primary-foreground/48"
        >
          {{ checkpoint.name }}
        </p>
        <div class="mt-1 flex flex-wrap items-center gap-2">
          <span class="rounded-sm border border-primary-foreground/12 bg-primary-foreground/8 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-primary-foreground/70">
            {{ checkpoint.family }}
          </span>
          <span class="rounded-sm border border-primary-foreground/12 bg-primary-foreground/8 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-primary-foreground/58">
            {{ assetCountLabel(loraCount, 'LoRA') }}
          </span>
          <span class="rounded-sm border border-primary-foreground/12 bg-primary-foreground/8 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-primary-foreground/58">
            {{ assetCountLabel(controlNetCount, 'ControlNet') }}
          </span>
        </div>
      </div>

      <div class="flex items-center gap-2">
        <UiTooltip :content="isAssetsExpanded ? 'Collapse assets' : 'Expand assets'">
          <button
            type="button"
            :aria-expanded="isAssetsExpanded"
            :aria-controls="assetDetailsId"
            :aria-label="`${isAssetsExpanded ? 'Collapse' : 'Expand'} checkpoint assets`"
            class="inline-flex h-9 w-9 items-center justify-center rounded-md border border-primary-foreground/12 bg-primary-foreground/8 text-primary-foreground/64 transition hover:border-accent hover:text-primary-foreground focus:border-accent focus:outline-none focus:ring-2 focus:ring-ring/25"
            @click="isAssetsExpanded = !isAssetsExpanded"
          >
            <ChevronDown
              class="h-4 w-4 transition-transform"
              :class="isAssetsExpanded ? 'rotate-0' : '-rotate-90'"
            />
          </button>
        </UiTooltip>

        <button
          type="button"
          role="switch"
          :aria-checked="checkpoint.enabled"
          :aria-label="`${checkpoint.enabled ? 'Disable' : 'Enable'} ${checkpoint.name}`"
          class="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition focus:outline-none focus:ring-2 focus:ring-ring/25"
          :class="checkpoint.enabled ? 'border-secondary bg-secondary' : 'border-primary-foreground/12 bg-primary-foreground/8'"
          @click="toggleSelectedCheckpoint(checkpoint.name)"
        >
          <span
            class="inline-block h-4 w-4 rounded-full bg-primary-foreground shadow-sm transition-transform"
            :class="checkpoint.enabled ? 'translate-x-5' : 'translate-x-1'"
          />
        </button>

        <UiTooltip content="Remove checkpoint">
          <button
            type="button"
            :aria-label="`Remove ${checkpoint.name}`"
            class="inline-flex h-9 w-9 items-center justify-center rounded-md border border-destructive/45 bg-destructive/12 text-destructive transition hover:border-destructive hover:bg-destructive hover:text-destructive-foreground hover:shadow-[0_0_0_3px_rgba(255,65,54,0.24)] focus:border-destructive focus:ring-2 focus:ring-ring/25"
            @click="removeSelectedCheckpoint(checkpoint.name)"
          >
            <X class="h-4 w-4" />
          </button>
        </UiTooltip>
      </div>
    </div>

    <div
      v-show="isAssetsExpanded"
      :id="assetDetailsId"
    >
      <HomeCheckpointLoraPicker :checkpoint="checkpoint" />
      <HomeCheckpointControlNetPicker :checkpoint="checkpoint" />
    </div>

    <AssetPreviewModal
      :open="isCheckpointPreviewOpen"
      :title="checkpoint.displayName"
      :subtitle="checkpointPreviewSubtitle"
      :preview-url="checkpoint.previewUrl"
      :is-video="checkpointPreviewIsVideo"
      :model-id="checkpointCivitaiModelId"
      :version-id="checkpointCivitaiVersionId"
      :base-model="checkpoint.compatibility?.baseModel ?? null"
      :trained-words="checkpoint.compatibility?.trainedWords ?? []"
      :file-name="checkpoint.name"
      :compatibility="checkpoint.compatibility"
      :editable-safety="true"
      :saving-safety="savingSafety"
      :saving-image-safety="savingImageSafety"
      :safety-error="safetyError"
      :image-safety-error="imageSafetyError"
      :queuing-download-key="queuingDownloadKey"
      :download-for-version="downloadForVersion"
      :download-status-label="downloadStatusLabel"
      :queue-asset-download="queueAssetDownload"
      :delete-asset-download="deleteAssetDownload"
      :repair-download-previews="repairDownloadPreviews"
      :model-download-key="modelDownloadKey"
      :apply-generation-metadata="applyGenerationMetadataFromSource"
      model-type="Checkpoint"
      kind-label="Checkpoint preview"
      show-download-actions
      @close="isCheckpointPreviewOpen = false"
      @save-safety="saveCheckpointSafety"
      @save-image-safety="saveCheckpointImageSafety"
    />
  </div>
</template>
