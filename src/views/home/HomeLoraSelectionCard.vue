<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import {
  ExternalLink,
  Minus,
  Plus,
  X,
} from 'lucide-vue-next'
import AssetPreviewModal from '../../components/asset-preview/AssetPreviewModal.vue'
import UiPreloadedMedia from '../../components/ui/UiPreloadedMedia.vue'
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
  toggleLoraAllCompatible,
  removeCheckpointLora,
  assetPreviewDownloadActions,
  applyGenerationMetadataFromSource,
  saveModelSafetyOverride,
  saveModelImageSafetyOverride,
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

const isLoraPreviewOpen = ref(false)
const savingSafety = ref(false)
const safetyError = ref('')
const savingImageSafety = ref(false)
const imageSafetyError = ref('')
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
const loraCivitaiUrl = computed(() => {
  if (!loraCivitaiModelId.value) {
    return ''
  }

  const versionQuery = loraCivitaiVersionId.value
    ? `?modelVersionId=${encodeURIComponent(String(loraCivitaiVersionId.value))}`
    : ''

  return `https://civitai.com/models/${loraCivitaiModelId.value}${versionQuery}`
})
const allCompatibleModeLabel = computed(() => {
  if (props.lora.appliedByAllCompatible) {
    return 'Applied via all compatible'
  }

  return props.lora.applyToAllCompatible ? 'Applies to compatible' : ''
})
const areAllLoraTriggerWordsEnabled = computed(() => {
  return (
    props.lora.enabled &&
    loraTriggerWords.value.length > 0 &&
    loraTriggerWords.value.every((triggerWord) =>
      isLoraTriggerWordEnabled(props.lora, triggerWord),
    )
  )
})
const allLoraTriggerWordsSwitchLabel = computed(() => {
  const action = areAllLoraTriggerWordsEnabled.value ? 'Disable' : 'Enable'

  return `${action} all trigger words for ${loraDisplayName.value}`
})

function updateStrength(event: Event) {
  const target = event.target
  if (target instanceof HTMLInputElement) {
    setCheckpointLoraStrength(props.checkpoint.name, props.lora.name, target.value)
  }
}

function toggleAllLoraTriggerWords() {
  if (!props.lora.enabled) {
    return
  }

  if (areAllLoraTriggerWordsEnabled.value) {
    disableAllLoraTriggerWords(props.lora)
    return
  }

  enableAllLoraTriggerWords(props.lora)
}

function openLoraPreview() {
  if (canOpenLoraPreview.value) {
    safetyError.value = ''
    imageSafetyError.value = ''
    isLoraPreviewOpen.value = true
  }
}

async function saveLoraSafety(payload: { modelNsfwOverride: boolean | null }) {
  if (savingSafety.value) {
    return
  }

  savingSafety.value = true
  safetyError.value = ''
  try {
    await saveModelSafetyOverride({
      modelName: props.lora.name,
      modelType: 'lora',
      modelNsfwOverride: payload.modelNsfwOverride,
    })
  } catch (error) {
    safetyError.value = error instanceof Error ? error.message : 'Could not save safety override.'
  } finally {
    savingSafety.value = false
  }
}

async function saveLoraImageSafety(payload: { imageKey: string; imageNsfwOverride: boolean | null }) {
  if (savingImageSafety.value) {
    return
  }

  savingImageSafety.value = true
  imageSafetyError.value = ''
  try {
    await saveModelImageSafetyOverride({
      modelName: props.lora.name,
      modelType: 'lora',
      imageKey: payload.imageKey,
      imageNsfwOverride: payload.imageNsfwOverride,
    })
  } catch (error) {
    imageSafetyError.value = error instanceof Error ? error.message : 'Could not save image safety override.'
  } finally {
    savingImageSafety.value = false
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
      lora.appliedByAllCompatible
        ? 'border-secondary/45 bg-secondary/8'
        : lora.enabled
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
        <UiPreloadedMedia
          :src="loraPreviewUrl"
          :is-video="loraPreviewIsVideo"
          :alt="`${lora.name} preview`"
          label=""
          media-class="h-full w-full object-cover"
          loading-class="bg-primary/80 text-primary-foreground"
          spinner-class="mr-0 h-4 w-4"
          muted
          loop
          autoplay
          playsinline
          preload="metadata"
          :aria-label="loraPreviewIsVideo ? `${lora.name} video preview` : undefined"
          :loading="loraPreviewIsVideo ? undefined : 'lazy'"
        />
      </button>

      <div class="min-w-0 flex-1">
        <div class="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div class="min-w-0 flex-1">
            <div class="flex min-w-0 flex-wrap items-center gap-2">
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
                v-if="loraCompatibilityStatus !== 'compatible'"
                class="rounded-sm border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]"
                :class="
                  loraCompatibilityStatus === 'warning'
                    ? 'border-accent/45 bg-accent/12 text-accent'
                    : 'border-secondary/35 bg-secondary/10 text-secondary'
                "
              >
                {{ getLoraCompatibilityLabel(checkpoint, lora.name) }}
              </span>
              <span
                v-if="allCompatibleModeLabel"
                class="rounded-sm border border-secondary/45 bg-secondary/14 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-secondary"
              >
                {{ allCompatibleModeLabel }}
              </span>
            </div>
            <p
              v-if="loraDisplayName !== lora.name"
              class="mt-0.5 truncate text-[11px] text-primary-foreground/48"
            >
              {{ lora.name }}
            </p>
          </div>

          <div
            class="flex shrink-0 flex-wrap items-center gap-1.5 sm:justify-end"
            role="group"
            :aria-label="`LoRA controls for ${lora.name}`"
          >
            <UiTooltip
              v-if="loraCivitaiUrl"
              content="Open on Civitai"
            >
              <a
                :href="loraCivitaiUrl"
                target="_blank"
                rel="noreferrer"
                class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-sm border border-primary-foreground/12 bg-card text-primary-foreground/58 transition hover:border-secondary/45 hover:text-secondary focus:outline-none focus:ring-2 focus:ring-ring/25"
                :aria-label="`Open ${loraDisplayName} on Civitai`"
                @click.stop
              >
                <ExternalLink class="h-3.5 w-3.5" />
              </a>
            </UiTooltip>

            <div class="flex items-center gap-1.5 rounded-sm border border-primary-foreground/10 bg-primary-foreground/5 px-2 py-1 text-[11px] text-primary-foreground/60">
              <span>All compatible</span>
              <button
                type="button"
                role="switch"
                :aria-checked="Boolean(lora.applyToAllCompatible || lora.appliedByAllCompatible)"
                :aria-label="`Apply ${lora.name} to all compatible checkpoints`"
                class="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition focus:outline-none focus:ring-2 focus:ring-ring/25"
                :class="
                  lora.applyToAllCompatible || lora.appliedByAllCompatible
                    ? 'border-secondary bg-secondary'
                    : 'border-primary-foreground/12 bg-primary-foreground/8'
                "
                @click="toggleLoraAllCompatible(checkpoint.name, lora.name)"
              >
                <span
                  class="inline-block h-3.5 w-3.5 rounded-full bg-primary-foreground shadow-sm transition-transform"
                  :class="lora.applyToAllCompatible || lora.appliedByAllCompatible ? 'translate-x-4' : 'translate-x-0.5'"
                />
              </button>
            </div>

            <label class="flex items-center gap-1.5 rounded-sm border border-primary-foreground/10 bg-primary-foreground/5 px-2 py-1 text-[11px] text-primary-foreground/60">
              <span>Strength</span>
              <input
                :value="lora.strength"
                type="number"
                step="0.05"
                class="h-7 w-16 rounded-sm border border-input bg-card px-2 py-1 text-xs text-card-foreground outline-none transition focus:border-accent focus:ring-2 focus:ring-ring/25"
                @input="updateStrength"
              />
            </label>

            <button
              type="button"
              role="switch"
              :aria-checked="lora.enabled"
              :aria-label="`${lora.enabled ? 'Disable' : 'Enable'} ${lora.name}`"
              class="relative inline-flex h-8 w-12 shrink-0 items-center rounded-sm border transition focus:outline-none focus:ring-2 focus:ring-ring/25"
              :class="lora.enabled ? 'border-secondary bg-secondary' : 'border-primary-foreground/12 bg-primary-foreground/8'"
              @click="toggleCheckpointLora(checkpoint.name, lora.name)"
            >
              <span
                class="inline-block h-4 w-4 rounded-full bg-primary-foreground shadow-sm transition-transform"
                :class="lora.enabled ? 'translate-x-6' : 'translate-x-1'"
              />
            </button>

            <UiTooltip content="Remove LoRA">
              <button
                type="button"
                :aria-label="`Remove ${lora.name}`"
                class="inline-flex h-8 w-8 items-center justify-center rounded-sm border border-destructive/45 bg-destructive/12 text-destructive transition hover:border-destructive hover:bg-destructive hover:text-destructive-foreground hover:shadow-[0_0_0_3px_rgba(255,65,54,0.24)] focus:border-destructive focus:ring-2 focus:ring-ring/25"
                @click="removeCheckpointLora(checkpoint.name, lora.name)"
              >
                <X class="h-4 w-4" />
              </button>
            </UiTooltip>
          </div>
        </div>
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
        <div class="flex items-center gap-2 text-[11px] text-primary-foreground/60">
          <span>All trigger words</span>
          <button
            type="button"
            role="switch"
            :aria-checked="areAllLoraTriggerWordsEnabled"
            :aria-label="allLoraTriggerWordsSwitchLabel"
            :disabled="!lora.enabled"
            class="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition focus:outline-none focus:ring-2 focus:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-45"
            :class="
              areAllLoraTriggerWordsEnabled
                ? 'border-secondary bg-secondary'
                : 'border-primary-foreground/12 bg-primary-foreground/8'
            "
            @click="toggleAllLoraTriggerWords"
          >
            <span
              class="inline-block h-4 w-4 rounded-full bg-primary-foreground shadow-sm transition-transform"
              :class="areAllLoraTriggerWordsEnabled ? 'translate-x-5' : 'translate-x-1'"
            />
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
      :compatibility="loraCompatibility"
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
      model-type="LORA"
      kind-label="LoRA preview"
      show-download-actions
      @close="isLoraPreviewOpen = false"
      @save-safety="saveLoraSafety"
      @save-image-safety="saveLoraImageSafety"
    />
  </div>
</template>
