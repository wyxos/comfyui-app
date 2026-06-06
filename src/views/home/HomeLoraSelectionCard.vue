<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import {
  Check,
  Minus,
  Plus,
  X,
} from 'lucide-vue-next'
import AssetPreviewModal from '../../components/asset-preview/AssetPreviewModal.vue'
import UiTooltip from '../../components/ui/UiTooltip.vue'
import { useProvidedHomeView } from './homeViewContext'
import type { HomeCheckpointEntry, HomeLoraSelection } from './useHomeView'

const props = defineProps<{
  checkpoint: HomeCheckpointEntry
  lora: HomeLoraSelection
}>()

const {
  getLoraTriggerWords,
  isLoraTriggerWordEnabled,
  toggleLoraTriggerWord,
  enableAllLoraTriggerWords,
  disableAllLoraTriggerWords,
  getLoraTriggerWordWeightLabel,
  stepLoraTriggerWordWeight,
  getLoraTriggerWordsLabel,
  getLoraPreviewUrl,
  getLoraPreviewMediaType,
  isVideoPreview,
  getLoraDisplayName,
  getLoraCompatibilityStatus,
  getLoraCompatibilityLabel,
  getLoraCompatibilityMetadata,
  toggleCheckpointLora,
  setCheckpointLoraStrength,
  removeCheckpointLora,
  assetPreviewDownloadActions,
  applyGenerationMetadataFromSource,
} = useProvidedHomeView()
const {
  queuingDownloadKey,
  downloadForVersion,
  downloadStatusLabel,
  queueAssetDownload,
  deleteAssetDownload,
  modelDownloadKey,
  startPolling,
  stopPolling,
} = assetPreviewDownloadActions

const isLoraPreviewOpen = ref(false)
const loraPreviewUrl = computed(() => getLoraPreviewUrl(props.lora.name))
const loraPreviewMediaType = computed(() => getLoraPreviewMediaType(props.lora.name))
const loraPreviewIsVideo = computed(() =>
  isVideoPreview(loraPreviewUrl.value, loraPreviewMediaType.value),
)
const loraDisplayName = computed(() => getLoraDisplayName(props.lora.name))
const loraCompatibility = computed(() => getLoraCompatibilityMetadata(props.lora.name))
const loraCompatibilityStatus = computed(() => getLoraCompatibilityStatus(props.checkpoint, {
  name: props.lora.name,
  compatibility: loraCompatibility.value,
}))
const loraTriggerWords = computed(() => getLoraTriggerWords(props.lora.name))
const loraCivitaiModelId = computed(() => loraCompatibility.value?.modelId ?? null)
const loraCivitaiVersionId = computed(() => loraCompatibility.value?.versionId ?? null)
const canOpenLoraPreview = computed(() => Boolean(loraPreviewUrl.value || loraCivitaiModelId.value))

function updateStrength(event: Event) {
  const target = event.target
  if (target instanceof HTMLInputElement) {
    setCheckpointLoraStrength(props.checkpoint.name, props.lora.name, target.value)
  }
}

function openLoraPreview() {
  if (canOpenLoraPreview.value) {
    isLoraPreviewOpen.value = true
  }
}

watch(isLoraPreviewOpen, (isOpen) => {
  if (isOpen) {
    startPolling()
    return
  }

  stopPolling()
})

onBeforeUnmount(() => {
  if (isLoraPreviewOpen.value) {
    stopPolling()
  }
})
</script>

<template>
  <div
    class="rounded-md border px-3 py-3 transition-colors"
    :class="
      lora.enabled
        ? 'border-primary-foreground/12 bg-primary'
        : 'border-primary-foreground/20 bg-primary-foreground/6'
    "
  >
    <div class="flex items-start gap-3">
      <button
        v-if="loraPreviewUrl"
        type="button"
        class="h-14 w-14 shrink-0 overflow-hidden rounded-sm border border-primary-foreground/12 transition hover:border-accent focus:outline-none focus:ring-2 focus:ring-ring/25"
        :aria-label="`Open ${lora.name} preview`"
        @click="openLoraPreview"
      >
        <video
          v-if="loraPreviewIsVideo"
          class="h-full w-full object-cover"
          :src="loraPreviewUrl"
          muted
          loop
          autoplay
          playsinline
          preload="metadata"
          :aria-label="`${lora.name} video preview`"
        />
        <img
          v-else
          class="h-full w-full object-cover"
          :src="loraPreviewUrl"
          :alt="`${lora.name} preview`"
          loading="lazy"
        />
      </button>

      <div class="min-w-0 flex-1">
        <div class="flex flex-wrap items-center gap-2">
          <button
            v-if="canOpenLoraPreview"
            type="button"
            class="block max-w-full truncate text-left text-sm font-semibold text-primary-foreground transition hover:text-secondary focus:outline-none focus:ring-2 focus:ring-ring/25"
            @click="openLoraPreview"
          >
            {{ loraDisplayName }}
          </button>
          <p
            v-else
            class="min-w-0 truncate text-sm font-semibold text-primary-foreground"
          >
            {{ loraDisplayName }}
          </p>
          <span
            class="rounded-sm border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]"
            :class="
              loraCompatibilityStatus === 'warning'
                ? 'border-accent/45 bg-accent/12 text-accent'
                : 'border-secondary/35 bg-secondary/10 text-secondary'
            "
          >
            {{ getLoraCompatibilityLabel(checkpoint, lora.name) }}
          </span>
        </div>
        <p
          v-if="loraDisplayName !== lora.name"
          class="mt-0.5 truncate text-[11px] text-primary-foreground/48"
        >
          {{ lora.name }}
        </p>
      </div>

      <div class="flex flex-wrap items-center justify-end gap-2">
        <label class="flex items-center gap-2 text-[11px] text-primary-foreground/60">
          <span>Strength</span>
          <input
            :value="lora.strength"
            type="number"
            step="0.05"
            class="h-9 w-20 rounded-sm border border-input bg-card px-2 py-1 text-xs text-card-foreground outline-none transition focus:border-accent focus:ring-2 focus:ring-ring/25"
            @input="updateStrength"
          />
        </label>

        <button
          type="button"
          role="switch"
          :aria-checked="lora.enabled"
          :aria-label="`${lora.enabled ? 'Disable' : 'Enable'} ${lora.name}`"
          class="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition focus:outline-none focus:ring-2 focus:ring-ring/25"
          :class="lora.enabled ? 'border-secondary bg-secondary' : 'border-primary-foreground/12 bg-primary-foreground/8'"
          @click="toggleCheckpointLora(checkpoint.name, lora.name)"
        >
          <span
            class="inline-block h-4 w-4 rounded-full bg-primary-foreground shadow-sm transition-transform"
            :class="lora.enabled ? 'translate-x-5' : 'translate-x-1'"
          />
        </button>

        <UiTooltip content="Remove LoRA">
          <button
            type="button"
            :aria-label="`Remove ${lora.name}`"
            class="inline-flex h-9 w-9 items-center justify-center rounded-md border border-destructive/45 bg-destructive/12 text-destructive transition hover:border-destructive hover:bg-destructive hover:text-destructive-foreground hover:shadow-[0_0_0_3px_rgba(255,65,54,0.24)] focus:border-destructive focus:ring-2 focus:ring-ring/25"
            @click="removeCheckpointLora(checkpoint.name, lora.name)"
          >
            <X class="h-4 w-4" />
          </button>
        </UiTooltip>
      </div>
    </div>

    <div
      v-if="loraTriggerWords.length"
      class="mt-3 border-t border-primary-foreground/10 pt-3"
    >
      <div class="flex flex-wrap items-center justify-between gap-2">
        <p class="text-[11px] font-semibold uppercase tracking-[0.12em] text-primary-foreground/48">
          Trigger words
        </p>
        <div class="flex items-center gap-1">
          <button
            type="button"
            class="inline-flex h-6 items-center rounded-sm border border-secondary/35 bg-secondary/10 px-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-secondary transition hover:border-secondary hover:bg-secondary/16 disabled:cursor-not-allowed disabled:opacity-45"
            :disabled="!lora.enabled"
            @click="enableAllLoraTriggerWords(lora)"
          >
            All on
          </button>
          <button
            type="button"
            class="inline-flex h-6 items-center rounded-sm border border-primary-foreground/12 bg-card px-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-primary-foreground/56 transition hover:border-primary-foreground/28 hover:text-primary-foreground disabled:cursor-not-allowed disabled:opacity-45"
            :disabled="!lora.enabled"
            @click="disableAllLoraTriggerWords(lora)"
          >
            All off
          </button>
        </div>
      </div>

      <div class="mt-1 flex flex-wrap gap-1.5">
        <div
          v-for="triggerWord in loraTriggerWords"
          :key="triggerWord"
          class="inline-flex min-h-7 max-w-full items-center overflow-hidden rounded-sm border text-[11px] leading-tight transition"
          :class="
            lora.enabled && isLoraTriggerWordEnabled(lora, triggerWord)
              ? 'border-secondary/45 bg-secondary/14 text-secondary hover:border-secondary hover:bg-secondary/20'
              : 'border-primary-foreground/12 bg-card text-primary-foreground/56 hover:border-primary-foreground/28 hover:text-primary-foreground'
          "
        >
          <button
            type="button"
            class="inline-flex min-h-7 min-w-0 items-center gap-1 px-2 py-1 text-left transition focus:outline-none focus:ring-2 focus:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-60"
            :aria-pressed="lora.enabled && isLoraTriggerWordEnabled(lora, triggerWord)"
            :disabled="!lora.enabled"
            @click="toggleLoraTriggerWord(lora, triggerWord)"
          >
            <Check
              v-if="lora.enabled && isLoraTriggerWordEnabled(lora, triggerWord)"
              class="h-3 w-3 shrink-0"
            />
            <span class="break-words">{{ triggerWord }}</span>
            <span
              v-if="lora.enabled && isLoraTriggerWordEnabled(lora, triggerWord)"
              class="shrink-0 rounded-sm bg-primary-foreground/10 px-1 py-0.5 font-semibold tabular-nums"
            >
              {{ getLoraTriggerWordWeightLabel(lora, triggerWord) }}
            </span>
          </button>
          <div
            v-if="lora.enabled && isLoraTriggerWordEnabled(lora, triggerWord)"
            class="flex shrink-0 border-l border-current/20"
          >
            <button
              type="button"
              class="inline-flex h-7 w-6 items-center justify-center transition hover:bg-primary-foreground/10 focus:outline-none focus:ring-2 focus:ring-ring/25"
              :aria-label="`Decrease ${triggerWord} trigger strength`"
              @click.stop="stepLoraTriggerWordWeight(lora, triggerWord, -1)"
            >
              <Minus class="h-3 w-3" />
            </button>
            <button
              type="button"
              class="inline-flex h-7 w-6 items-center justify-center border-l border-current/20 transition hover:bg-primary-foreground/10 focus:outline-none focus:ring-2 focus:ring-ring/25"
              :aria-label="`Increase ${triggerWord} trigger strength`"
              @click.stop="stepLoraTriggerWordWeight(lora, triggerWord, 1)"
            >
              <Plus class="h-3 w-3" />
            </button>
          </div>
        </div>
      </div>
      <p
        v-if="!lora.enabled"
        class="mt-1 text-[11px] text-primary-foreground/45"
      >
        Enable this LoRA to apply trigger words.
      </p>
    </div>
    <p
      v-else
      class="mt-3 border-t border-primary-foreground/10 pt-3 break-words text-[11px] text-primary-foreground/56"
    >
      {{ getLoraTriggerWordsLabel(lora.name) }}
    </p>

    <AssetPreviewModal
      :open="isLoraPreviewOpen"
      :title="loraDisplayName"
      :subtitle="loraDisplayName !== lora.name ? lora.name : null"
      :preview-url="loraPreviewUrl"
      :is-video="loraPreviewIsVideo"
      :model-id="loraCivitaiModelId"
      :version-id="loraCivitaiVersionId"
      :base-model="loraCompatibility?.baseModel ?? null"
      :trained-words="loraTriggerWords"
      :file-name="lora.name"
      :queuing-download-key="queuingDownloadKey"
      :download-for-version="downloadForVersion"
      :download-status-label="downloadStatusLabel"
      :queue-asset-download="queueAssetDownload"
      :delete-asset-download="deleteAssetDownload"
      :model-download-key="modelDownloadKey"
      :apply-generation-metadata="applyGenerationMetadataFromSource"
      model-type="LORA"
      kind-label="LoRA preview"
      show-download-actions
      @close="isLoraPreviewOpen = false"
    />
  </div>
</template>
