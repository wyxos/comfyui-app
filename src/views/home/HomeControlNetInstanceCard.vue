<script setup lang="ts">
import { computed, ref } from 'vue'
import { RefreshCw, Ruler, Trash2, Upload, X } from 'lucide-vue-next'
import UiSelect from '../../components/ui/UiSelect.vue'
import UiTooltip from '../../components/ui/UiTooltip.vue'
import { useProvidedHomeView } from './homeViewContext'
import type { HomeViewContext } from './useHomeView'

type ControlNetSelection = HomeViewContext['selectedControlNets']['value'][number]

const props = defineProps<{
  controlNet: ControlNetSelection
}>()

const {
  controlNetOptions,
  controlNetPreprocessorOptions,
  controlNetOutputResolutionLabel,
  loadingControlNets,
  removeControlNetInstance,
  setControlNetEnabled,
  setControlNetModel,
  setControlNetPreprocessor,
  setControlNetField,
  clearControlNetImage,
  applyControlNetOutputResolution,
  generateControlNetPreview,
  handleControlNetImageSelection,
  handleControlNetDragEnter,
  handleControlNetDragOver,
  handleControlNetDragLeave,
  handleControlNetImageDrop,
} = useProvidedHomeView()

const fileInput = ref<HTMLInputElement | null>(null)
const selectedModel = computed({
  get: () => props.controlNet.model,
  set: (value) => setControlNetModel(props.controlNet.id, value),
})
const selectedPreprocessor = computed({
  get: () => props.controlNet.preprocessor,
  set: (value) => setControlNetPreprocessor(props.controlNet.id, value),
})
const canGeneratePreview = computed(() => {
  return Boolean(
    props.controlNet.inputImageName &&
      !props.controlNet.isUploading &&
      !props.controlNet.isGeneratingPreview,
  )
})
const dimensionLabel = computed(() => {
  if (!props.controlNet.inputImageWidth || !props.controlNet.inputImageHeight) {
    return ''
  }

  return `${props.controlNet.inputImageWidth} x ${props.controlNet.inputImageHeight}`
})

function openImagePicker() {
  fileInput.value?.click()
}

function handleNumericInput(
  field: 'strength' | 'startPercent' | 'endPercent' | 'previewResolution',
  event: Event,
) {
  const target = event.target
  if (target instanceof HTMLInputElement) {
    setControlNetField(props.controlNet.id, field, target.value)
  }
}
</script>

<template>
  <div class="rounded-md border border-primary-foreground/12 bg-card p-3 text-card-foreground">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="min-w-0">
        <p class="truncate text-sm font-semibold">
          {{ controlNet.model || 'ControlNet instance' }}
        </p>
        <p class="mt-1 text-xs text-muted-foreground">
          {{ controlNet.enabled ? 'Enabled' : 'Disabled' }}
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
          @click="setControlNetEnabled(controlNet.id, !controlNet.enabled)"
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
            @click="removeControlNetInstance(controlNet.id)"
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
          :options="controlNetOptions"
          placeholder="Choose ControlNet"
          searchable
          search-placeholder="Search ControlNet models..."
          aria-label="Choose ControlNet model"
          :disabled="loadingControlNets || !controlNetOptions.length"
        />
      </label>

      <div class="grid grid-cols-3 gap-2">
        <label class="flex min-w-0 flex-col gap-2">
          <span class="field-label text-card-foreground/70">Strength</span>
          <input
            :value="controlNet.strength"
            type="number"
            min="0"
            max="10"
            step="0.05"
            class="h-12 min-w-0 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-ring/25"
            @input="handleNumericInput('strength', $event)"
          />
        </label>
        <label class="flex min-w-0 flex-col gap-2">
          <span class="field-label text-card-foreground/70">Start</span>
          <input
            :value="controlNet.startPercent"
            type="number"
            min="0"
            max="1"
            step="0.01"
            class="h-12 min-w-0 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-ring/25"
            @input="handleNumericInput('startPercent', $event)"
          />
        </label>
        <label class="flex min-w-0 flex-col gap-2">
          <span class="field-label text-card-foreground/70">End</span>
          <input
            :value="controlNet.endPercent"
            type="number"
            min="0"
            max="1"
            step="0.01"
            class="h-12 min-w-0 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-ring/25"
            @input="handleNumericInput('endPercent', $event)"
          />
        </label>
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
      <label class="flex min-w-0 flex-col gap-2">
        <span class="field-label text-card-foreground/70">Control res</span>
        <input
          :value="controlNet.previewResolution"
          type="number"
          min="64"
          max="16384"
          step="64"
          class="h-12 min-w-0 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-ring/25"
          @input="handleNumericInput('previewResolution', $event)"
        />
      </label>
    </div>

    <input
      ref="fileInput"
      type="file"
      accept="image/png,image/jpeg,image/webp,image/avif"
      class="hidden"
      aria-label="ControlNet image file"
      @change="handleControlNetImageSelection(controlNet.id, $event)"
    />

    <div class="mt-3 grid gap-3 xl:grid-cols-2">
      <div
        role="button"
        tabindex="0"
        aria-label="Choose ControlNet image"
        class="relative grid min-h-56 place-items-center overflow-hidden rounded-md border bg-background outline-none transition focus:border-accent focus:ring-2 focus:ring-ring/25"
        :class="
          controlNet.isDragging
            ? 'border-accent bg-accent/10 ring-2 ring-ring/25'
            : 'border-input hover:border-accent/60'
        "
        @click="openImagePicker"
        @keydown.enter.prevent="openImagePicker"
        @keydown.space.prevent="openImagePicker"
        @dragenter.prevent="handleControlNetDragEnter(controlNet.id)"
        @dragover.prevent="handleControlNetDragOver(controlNet.id, $event)"
        @dragleave.prevent="handleControlNetDragLeave(controlNet.id, $event)"
        @drop.prevent="handleControlNetImageDrop(controlNet.id, $event)"
      >
        <img
          v-if="controlNet.inputImagePreviewUrl"
          :src="controlNet.inputImagePreviewUrl"
          alt="ControlNet source image"
          class="mx-auto block max-h-72 max-w-full object-contain"
        />

        <div
          v-if="controlNet.inputImagePreviewUrl"
          class="absolute right-3 top-3 z-10 flex items-center gap-2"
        >
          <UiTooltip :content="`Use output size (${controlNetOutputResolutionLabel})`">
            <button
              type="button"
              aria-label="Use output size for ControlNet resolution"
              class="inline-flex h-9 w-9 items-center justify-center rounded-md border border-primary-foreground/12 bg-primary text-primary-foreground shadow-sm transition hover:border-secondary hover:text-secondary focus:border-accent focus:ring-2 focus:ring-ring/25"
              @click.stop="applyControlNetOutputResolution(controlNet.id)"
            >
              <Ruler class="h-4 w-4" />
            </button>
          </UiTooltip>

          <UiTooltip content="Clear ControlNet image">
            <button
              type="button"
              aria-label="Clear ControlNet image"
              class="inline-flex h-9 w-9 items-center justify-center rounded-md border border-destructive/25 bg-destructive text-destructive-foreground shadow-sm transition hover:bg-destructive/92 focus:border-accent focus:ring-2 focus:ring-ring/25"
              @click.stop="clearControlNetImage(controlNet.id)"
            >
              <X class="h-4 w-4" />
            </button>
          </UiTooltip>
        </div>

        <div
          v-else
          class="flex flex-col items-center justify-center gap-3 px-4 py-8 text-center text-card-foreground"
        >
          <div class="rounded-md border border-primary-foreground/12 bg-primary px-3 py-3 text-primary-foreground/82">
            <Upload class="h-9 w-9" :stroke-width="1.6" />
          </div>
          <div class="space-y-1">
            <p class="text-sm font-semibold">Drop control image</p>
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
        <img
          v-if="controlNet.previewImageUrl"
          :src="controlNet.previewImageUrl"
          alt="ControlNet preprocessor preview"
          class="mx-auto block max-h-72 max-w-full object-contain"
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

        <div class="absolute right-3 top-3 z-10">
          <button
            type="button"
            class="inline-flex h-9 items-center gap-2 rounded-md border border-secondary/35 bg-secondary px-3 text-xs font-semibold uppercase tracking-[0.1em] text-secondary-foreground shadow-sm transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-55"
            :disabled="!canGeneratePreview"
            @click="generateControlNetPreview(controlNet.id)"
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
