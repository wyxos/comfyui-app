<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { Check, ClipboardPaste, Copy, RefreshCw, Ruler, SlidersHorizontal, Trash2, Upload, X } from 'lucide-vue-next'
import UiSelect from '../../components/ui/UiSelect.vue'
import UiPreloadedMedia from '../../components/ui/UiPreloadedMedia.vue'
import UiTooltip from '../../components/ui/UiTooltip.vue'
import HomeControlNetNumberInput from './HomeControlNetNumberInput.vue'
import { useProvidedHomeView } from './homeViewContext'
import type { HomeCheckpointEntry } from './useHomeView'
import type { ControlNetSelection } from './homeTypes'

const props = defineProps<{
  checkpoint: HomeCheckpointEntry
  controlNet: ControlNetSelection
  checkpointName: string
  compatibilityLabel?: string
}>()
const {
  controlNetPreprocessorOptions,
  controlNetOutputResolutionLabel,
  loadingControlNets,
  getCheckpointControlNetModelOptions,
  removeControlNetInstance,
  setControlNetEnabled,
  setControlNetModel,
  setControlNetPreprocessor,
  setControlNetLineartPolarity,
  setControlNetField,
  clearControlNetImage,
  applyControlNetSourceImageResolution,
  applyControlNetOutputResolution,
  generateControlNetPreview,
  copyControlNetPreviewToClipboard,
  handleControlNetImageSelection,
  handleControlNetDragEnter,
  handleControlNetDragOver,
  handleControlNetDragLeave,
  handleControlNetImageDrop,
  handleControlNetImagePaste,
  pasteControlNetImageFromClipboard,
} = useProvidedHomeView()

const fileInput = ref<HTMLInputElement | null>(null)
const acceptsClipboardPaste = ref(false)
const selectedModel = computed({
  get: () => props.controlNet.model,
  set: (value) => setControlNetModel(props.controlNet.id, value, props.checkpointName),
})
const selectedPreprocessor = computed({
  get: () => props.controlNet.preprocessor,
  set: (value) => setControlNetPreprocessor(props.controlNet.id, value, props.checkpointName),
})
const checkpointControlNetOptions = computed(() =>
  getCheckpointControlNetModelOptions(props.checkpoint, props.controlNet.model),
)
const canGeneratePreview = computed(() =>
  Boolean(props.controlNet.inputImageName && !props.controlNet.isUploading && !props.controlNet.isGeneratingPreview),
)
const canCopyPreview = computed(() => Boolean(props.controlNet.previewImageUrl && !props.controlNet.isCopyingPreview))
const usesLineartPolarity = computed(() =>
  ['lineart', 'anime-lineart'].includes(props.controlNet.preprocessor),
)
const dimensionLabel = computed(() => {
  if (!props.controlNet.inputImageWidth || !props.controlNet.inputImageHeight) {
    return ''
  }

  return `${props.controlNet.inputImageWidth} x ${props.controlNet.inputImageHeight}`
})

function openImagePicker() {
  fileInput.value?.click()
}

function handleWindowPaste(event: ClipboardEvent) {
  if (acceptsClipboardPaste.value) {
    handleControlNetImagePaste(props.controlNet.id, event, props.checkpointName)
  }
}

async function chooseLineartPolarity(lineartPolarity: 'white-lines' | 'black-lines') {
  if (props.controlNet.lineartPolarity === lineartPolarity) {
    return
  }

  setControlNetLineartPolarity(props.controlNet.id, lineartPolarity, props.checkpointName)
  if (props.controlNet.inputImageName) {
    await generateControlNetPreview(props.controlNet.id, props.checkpointName)
  }
}

onMounted(() => {
  window.addEventListener('paste', handleWindowPaste)
})

onBeforeUnmount(() => {
  window.removeEventListener('paste', handleWindowPaste)
})
</script>

<template>
  <div
    class="rounded-md border p-3 text-card-foreground transition-colors"
    :class="controlNet.enabled ? 'border-primary-foreground/12 bg-card' : 'border-primary-foreground/20 bg-muted/60'"
  >
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="min-w-0">
        <p class="truncate text-sm font-semibold">
          {{ controlNet.model || 'ControlNet instance' }}
        </p>
        <p class="mt-1 text-xs text-muted-foreground">
          {{ compatibilityLabel || (controlNet.enabled ? 'Enabled' : 'Disabled') }}
        </p>
      </div>

      <div class="flex shrink-0 items-center gap-2">
        <button
          type="button"
          role="switch"
          :aria-label="`Enable ${controlNet.model || 'ControlNet instance'}`"
          :aria-checked="controlNet.enabled"
          class="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition focus:outline-none focus:ring-2 focus:ring-ring/25"
          :class="
            controlNet.enabled
              ? 'border-secondary bg-secondary'
              : 'border-border bg-muted hover:border-accent'
          "
          @click="setControlNetEnabled(controlNet.id, !controlNet.enabled, checkpointName)"
        >
          <span
            class="inline-block h-4 w-4 rounded-full bg-primary-foreground shadow-sm transition-transform"
            :class="controlNet.enabled ? 'translate-x-5' : 'translate-x-1'"
          />
        </button>

        <UiTooltip content="Remove ControlNet">
          <button
            type="button"
            :aria-label="`Remove ${controlNet.model || 'ControlNet instance'}`"
            class="inline-flex h-8 w-8 items-center justify-center rounded-md border border-destructive/25 bg-destructive/10 text-destructive transition hover:bg-destructive hover:text-destructive-foreground focus:border-accent focus:ring-2 focus:ring-ring/25"
            @click="removeControlNetInstance(controlNet.id, checkpointName)"
          >
            <Trash2 class="h-4 w-4" />
          </button>
        </UiTooltip>
      </div>
    </div>

    <div class="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1fr)_220px]">
      <label class="flex flex-col gap-2">
        <span class="field-label text-card-foreground/70">Model</span>
        <UiSelect
          v-model="selectedModel"
          :options="checkpointControlNetOptions"
          placeholder="Choose ControlNet"
          searchable
          search-placeholder="Search ControlNet models..."
          aria-label="Choose ControlNet model"
          :disabled="loadingControlNets || !checkpointControlNetOptions.length"
        />
      </label>

      <div class="grid grid-cols-3 gap-2">
        <HomeControlNetNumberInput
          label="Strength"
          :model-value="controlNet.strength"
          min="0"
          max="10"
          step="0.05"
          @update:model-value="setControlNetField(controlNet.id, 'strength', $event, checkpointName)"
        />
        <HomeControlNetNumberInput
          label="Start"
          :model-value="controlNet.startPercent"
          min="0"
          max="1"
          step="0.01"
          @update:model-value="setControlNetField(controlNet.id, 'startPercent', $event, checkpointName)"
        />
        <HomeControlNetNumberInput
          label="End"
          :model-value="controlNet.endPercent"
          min="0"
          max="1"
          step="0.01"
          @update:model-value="setControlNetField(controlNet.id, 'endPercent', $event, checkpointName)"
        />
      </div>
    </div>

    <div class="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_140px]">
      <label class="flex flex-col gap-2">
        <span class="field-label text-card-foreground/70">Preprocessor</span>
        <UiSelect
          v-model="selectedPreprocessor"
          :options="controlNetPreprocessorOptions"
          placeholder="Choose preprocessor"
          aria-label="Choose ControlNet preprocessor"
          :disabled="!controlNetPreprocessorOptions.length"
        />
      </label>
      <HomeControlNetNumberInput
        label="Control res"
        :model-value="controlNet.previewResolution"
        min="64"
        max="16384"
        step="64"
        @update:model-value="setControlNetField(controlNet.id, 'previewResolution', $event, checkpointName)"
      />
    </div>

    <div
      v-if="usesLineartPolarity"
      class="mt-3 flex flex-wrap items-center justify-between gap-3"
    >
      <span class="field-label text-card-foreground/70">Lineart</span>
      <div class="grid w-full grid-cols-2 gap-2 sm:w-auto">
        <button
          type="button"
          class="inline-flex h-9 items-center justify-center gap-2 rounded-md border px-3 text-xs font-semibold uppercase tracking-[0.1em] transition focus:border-accent focus:ring-2 focus:ring-ring/25"
          :class="
            controlNet.lineartPolarity === 'black-lines'
              ? 'border-secondary bg-secondary text-secondary-foreground'
              : 'border-input bg-primary text-primary-foreground/82 hover:border-accent/60'
          "
          :aria-pressed="controlNet.lineartPolarity === 'black-lines'"
          aria-label="Use black lines on white background"
          @click="chooseLineartPolarity('black-lines')"
        >
          <span class="relative h-4 w-4 rounded-sm border border-primary-foreground/20 bg-white">
            <span class="absolute left-1/2 top-0 h-full w-0.5 -translate-x-1/2 rotate-45 rounded-full bg-black" />
          </span>
          Black lines
        </button>
        <button
          type="button"
          class="inline-flex h-9 items-center justify-center gap-2 rounded-md border px-3 text-xs font-semibold uppercase tracking-[0.1em] transition focus:border-accent focus:ring-2 focus:ring-ring/25"
          :class="
            controlNet.lineartPolarity === 'white-lines'
              ? 'border-secondary bg-secondary text-secondary-foreground'
              : 'border-input bg-primary text-primary-foreground/82 hover:border-accent/60'
          "
          :aria-pressed="controlNet.lineartPolarity === 'white-lines'"
          aria-label="Use white lines on black background"
          @click="chooseLineartPolarity('white-lines')"
        >
          <span class="relative h-4 w-4 rounded-sm border border-primary-foreground/20 bg-black">
            <span class="absolute left-1/2 top-0 h-full w-0.5 -translate-x-1/2 rotate-45 rounded-full bg-white" />
          </span>
          White lines
        </button>
      </div>
    </div>

    <input
      ref="fileInput"
      type="file"
      accept="image/png,image/jpeg,image/webp,image/avif"
      class="hidden"
      aria-label="ControlNet image file"
      @change="handleControlNetImageSelection(controlNet.id, $event, checkpointName)"
    />

    <div class="mt-3 grid gap-3 xl:grid-cols-2">
      <div
        role="button"
        tabindex="0"
        aria-label="Choose or paste ControlNet image"
        class="relative grid min-h-56 place-items-center overflow-hidden rounded-md border bg-background outline-none transition focus:border-accent focus:ring-2 focus:ring-ring/25"
        :class="
          controlNet.isDragging
            ? 'border-accent bg-accent/10 ring-2 ring-ring/25'
            : 'border-input hover:border-accent/60'
        "
        @click="openImagePicker"
        @keydown.enter.prevent="openImagePicker"
        @keydown.space.prevent="openImagePicker"
        @focus="acceptsClipboardPaste = true"
        @blur="acceptsClipboardPaste = false"
        @pointerenter="acceptsClipboardPaste = true"
        @pointerleave="acceptsClipboardPaste = false"
        @dragenter.prevent="handleControlNetDragEnter(controlNet.id, checkpointName)"
        @dragover.prevent="handleControlNetDragOver(controlNet.id, $event, checkpointName)"
        @dragleave.prevent="handleControlNetDragLeave(controlNet.id, $event, checkpointName)"
        @drop.prevent="handleControlNetImageDrop(controlNet.id, $event, checkpointName)"
        @paste="handleControlNetImagePaste(controlNet.id, $event, checkpointName)"
      >
        <UiPreloadedMedia
          v-if="controlNet.inputImagePreviewUrl"
          :src="controlNet.inputImagePreviewUrl"
          alt="ControlNet source image"
          media-class="mx-auto block max-h-72 max-w-full object-contain"
          loading-class="bg-background/80 text-card-foreground"
        />

        <div class="absolute right-3 top-3 z-10 flex items-center gap-2">
          <UiTooltip content="Paste control image from clipboard">
            <button
              type="button"
              aria-label="Paste ControlNet image from clipboard"
              class="inline-flex h-9 w-9 items-center justify-center rounded-md border border-primary-foreground/12 bg-primary text-primary-foreground shadow-sm transition hover:border-secondary hover:text-secondary focus:border-accent focus:ring-2 focus:ring-ring/25 disabled:cursor-wait disabled:opacity-60"
              :disabled="controlNet.isUploading"
              @click.stop="pasteControlNetImageFromClipboard(controlNet.id, checkpointName)"
            >
              <ClipboardPaste class="h-4 w-4" />
            </button>
          </UiTooltip>

          <UiTooltip
            v-if="controlNet.inputImagePreviewUrl && dimensionLabel"
            :content="`Use source image resolution (${dimensionLabel})`"
          >
            <button
              type="button"
              aria-label="Use ControlNet source image resolution"
              class="inline-flex h-9 w-9 items-center justify-center rounded-md border border-primary-foreground/12 bg-primary text-primary-foreground shadow-sm transition hover:border-secondary hover:text-secondary focus:border-accent focus:ring-2 focus:ring-ring/25"
              @click.stop="applyControlNetSourceImageResolution(controlNet.id, checkpointName)"
            >
              <Ruler class="h-4 w-4" />
            </button>
          </UiTooltip>

          <UiTooltip
            v-if="controlNet.inputImagePreviewUrl"
            :content="`Set Control res from output size (${controlNetOutputResolutionLabel})`"
          >
            <button
              type="button"
              aria-label="Use output size for ControlNet resolution"
              class="inline-flex h-9 w-9 items-center justify-center rounded-md border border-primary-foreground/12 bg-primary text-primary-foreground shadow-sm transition hover:border-secondary hover:text-secondary focus:border-accent focus:ring-2 focus:ring-ring/25"
              @click.stop="applyControlNetOutputResolution(controlNet.id, checkpointName)"
            >
              <SlidersHorizontal class="h-4 w-4" />
            </button>
          </UiTooltip>

          <UiTooltip
            v-if="controlNet.inputImagePreviewUrl"
            content="Clear ControlNet image"
          >
            <button
              type="button"
              aria-label="Clear ControlNet image"
              class="inline-flex h-9 w-9 items-center justify-center rounded-md border border-destructive/25 bg-destructive text-destructive-foreground shadow-sm transition hover:bg-destructive/92 focus:border-accent focus:ring-2 focus:ring-ring/25"
              @click.stop="clearControlNetImage(controlNet.id, checkpointName)"
            >
              <X class="h-4 w-4" />
            </button>
          </UiTooltip>
        </div>

        <div
          v-if="!controlNet.inputImagePreviewUrl"
          class="flex flex-col items-center justify-center gap-3 px-4 py-8 text-center text-card-foreground"
        >
          <div class="rounded-md border border-primary-foreground/12 bg-primary px-3 py-3 text-primary-foreground/82">
            <Upload class="h-9 w-9" :stroke-width="1.6" />
          </div>
          <div class="space-y-1">
            <p class="text-sm font-semibold">Drop or paste control image</p>
            <button
              type="button"
              class="mx-auto inline-flex h-9 items-center gap-2 rounded-md border border-secondary/35 bg-secondary px-3 text-xs font-semibold uppercase tracking-[0.1em] text-secondary-foreground shadow-sm transition hover:brightness-95 disabled:cursor-wait disabled:opacity-60"
              aria-label="Paste empty ControlNet image from clipboard"
              :disabled="controlNet.isUploading"
              @click.stop="pasteControlNetImageFromClipboard(controlNet.id, checkpointName)"
            >
              <ClipboardPaste class="h-4 w-4" />
              Paste image
            </button>
            <p class="text-xs text-muted-foreground">or click to browse from disk</p>
          </div>
        </div>

        <div
          v-if="controlNet.inputImagePreviewUrl"
          class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-primary via-primary/82 to-transparent px-3 pb-2 pt-8 text-primary-foreground"
        >
          <div class="min-w-0">
            <p class="truncate text-sm font-semibold">
              {{ controlNet.inputImageDisplayName || controlNet.inputImageName }}
            </p>
            <p
              v-if="dimensionLabel"
              class="mt-1 text-xs text-primary-foreground/70"
            >
              {{ dimensionLabel }}
            </p>
          </div>
        </div>
      </div>

      <div class="relative grid min-h-56 place-items-center overflow-hidden rounded-md border border-input bg-background">
        <UiPreloadedMedia
          v-if="controlNet.previewImageUrl"
          :src="controlNet.previewImageUrl"
          alt="ControlNet preprocessor preview"
          media-class="mx-auto block max-h-72 max-w-full object-contain"
          loading-class="bg-background/80 text-card-foreground"
        />

        <div
          v-else
          class="flex flex-col items-center justify-center gap-3 px-4 py-8 text-center text-card-foreground"
        >
          <div class="rounded-md border border-primary-foreground/12 bg-primary px-3 py-3 text-primary-foreground/82">
            <RefreshCw class="h-9 w-9" :stroke-width="1.6" />
          </div>
          <div class="space-y-1">
            <p class="text-sm font-semibold">Preview output</p>
            <p class="text-xs text-muted-foreground">
              {{ controlNet.previewError || 'No preview generated' }}
            </p>
          </div>
        </div>

        <div class="absolute right-3 top-3 z-10 flex items-center gap-2">
          <UiTooltip
            v-if="controlNet.previewImageUrl"
            :content="controlNet.previewCopyNotice || 'Copy preview image to clipboard'"
          >
            <button
              type="button"
              class="inline-flex h-9 w-9 items-center justify-center rounded-md border border-primary-foreground/12 bg-primary text-primary-foreground shadow-sm transition hover:border-secondary hover:text-secondary focus:border-accent focus:ring-2 focus:ring-ring/25 disabled:cursor-wait disabled:opacity-60"
              aria-label="Copy ControlNet preview image to clipboard"
              :disabled="!canCopyPreview"
              @click="copyControlNetPreviewToClipboard(controlNet.id, checkpointName)"
            >
              <Check
                v-if="controlNet.previewCopyNotice"
                class="h-4 w-4 text-secondary"
              />
              <Copy
                v-else
                class="h-4 w-4"
              />
            </button>
          </UiTooltip>

          <button
            type="button"
            class="inline-flex h-9 items-center gap-2 rounded-md border border-secondary/35 bg-secondary px-3 text-xs font-semibold uppercase tracking-[0.1em] text-secondary-foreground shadow-sm transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-55"
            :disabled="!canGeneratePreview"
            @click="generateControlNetPreview(controlNet.id, checkpointName)"
          >
            <RefreshCw
              class="h-4 w-4"
              :class="controlNet.isGeneratingPreview ? 'animate-spin' : ''"
            />
            {{ controlNet.isGeneratingPreview ? 'Generating' : 'Preview' }}
          </button>
        </div>

        <div
          v-if="controlNet.previewImageUrl"
          class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-primary via-primary/82 to-transparent px-3 pb-2 pt-8 text-primary-foreground"
        >
          <p class="truncate text-sm font-semibold">
            {{ controlNet.previewImageName || 'ControlNet preview' }}
          </p>
          <p class="mt-1 text-xs text-primary-foreground/70">
            {{ controlNet.previewResolution }} px
          </p>
        </div>
      </div>
    </div>

    <p
      v-if="controlNet.previewError && controlNet.previewImageUrl"
      class="mt-2 text-xs text-destructive"
    >
      {{ controlNet.previewError }}
    </p>
    <p
      v-if="controlNet.previewCopyNotice && controlNet.previewImageUrl"
      class="mt-2 text-xs text-secondary"
    >
      {{ controlNet.previewCopyNotice }}
    </p>
    <p
      v-if="controlNet.previewCopyError && controlNet.previewImageUrl"
      class="mt-2 text-xs text-destructive"
    >
      {{ controlNet.previewCopyError }}
    </p>

    <p
      v-if="controlNet.isUploading"
      class="mt-2 text-xs text-muted-foreground"
    >
      Uploading control image...
    </p>
    <p
      v-if="controlNet.uploadError"
      class="mt-2 text-xs text-destructive"
    >
      {{ controlNet.uploadError }}
    </p>
  </div>
</template>
