<script setup lang="ts">
import { LoaderCircle, Save } from 'lucide-vue-next'
import { ref, watch } from 'vue'
import type { AssetPreviewModalProps } from './assetPreviewTypes'

const props = withDefaults(
  defineProps<{
    baseModel?: string | null
    compatibility?: AssetPreviewModalProps['compatibility']
    error?: string
    saving?: boolean
  }>(),
  {
    baseModel: null,
    compatibility: null,
    error: '',
    saving: false,
  },
)

const emit = defineEmits<{
  save: [payload: {
    compatibleBaseModels: string[]
    controlType: string
    loaderType: string
  }]
}>()

const compatibilityBaseOptions = ['SDXL', 'Pony', 'Illustrious', 'Anima'] as const
const controlTypeOptions = [
  { label: 'Line art', value: 'lineart' },
  { label: 'Canny', value: 'canny' },
  { label: 'OpenPose', value: 'pose' },
  { label: 'Depth', value: 'depth' },
  { label: 'Tile', value: 'tile' },
  { label: 'Other', value: '' },
] as const
const compatibilityBaseModels = ref<string[]>([])
const compatibilityControlType = ref('')
const compatibilityLoaderType = ref('')

function syncCompatibilityDraft() {
  compatibilityBaseModels.value = Array.isArray(props.compatibility?.compatibleBaseModels)
    ? [...props.compatibility.compatibleBaseModels]
    : props.baseModel
      ? [props.baseModel]
      : []
  compatibilityControlType.value = props.compatibility?.controlType ?? ''
  compatibilityLoaderType.value = props.compatibility?.loaderType ?? ''
}

function isCompatibilityBaseSelected(baseModel: string) {
  return compatibilityBaseModels.value.some((entry) => entry.toLowerCase() === baseModel.toLowerCase())
}

function toggleCompatibilityBase(baseModel: string) {
  if (isCompatibilityBaseSelected(baseModel)) {
    compatibilityBaseModels.value = compatibilityBaseModels.value.filter(
      (entry) => entry.toLowerCase() !== baseModel.toLowerCase(),
    )
    return
  }

  compatibilityBaseModels.value = [...compatibilityBaseModels.value, baseModel]
}

function saveCompatibility() {
  emit('save', {
    compatibleBaseModels: compatibilityBaseModels.value,
    controlType: compatibilityControlType.value,
    loaderType: compatibilityLoaderType.value,
  })
}

watch(
  () => [
    props.compatibility?.compatibleBaseModels,
    props.compatibility?.controlType,
    props.compatibility?.loaderType,
    props.baseModel,
  ],
  syncCompatibilityDraft,
  { immediate: true },
)
</script>

<template>
  <section class="space-y-3 border-t border-border pt-5">
    <div class="flex items-start justify-between gap-3">
      <div>
        <p class="text-xs font-semibold uppercase tracking-[0.22em] text-secondary">Compatibility</p>
        <p class="mt-1 text-xs text-muted-foreground">Checkpoint bases this ControlNet is suitable for.</p>
      </div>
      <button
        type="button"
        class="inline-flex h-8 items-center gap-2 rounded-md border border-secondary/35 bg-secondary px-3 text-xs font-semibold uppercase tracking-[0.1em] text-secondary-foreground transition hover:brightness-95 disabled:cursor-wait disabled:opacity-60"
        :disabled="saving"
        @click="saveCompatibility"
      >
        <LoaderCircle
          v-if="saving"
          class="h-3.5 w-3.5 animate-spin"
        />
        <Save
          v-else
          class="h-3.5 w-3.5"
        />
        Save
      </button>
    </div>

    <div class="grid grid-cols-2 gap-2">
      <label
        v-for="baseModelOption in compatibilityBaseOptions"
        :key="baseModelOption"
        class="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-background px-3 text-xs font-semibold text-card-foreground transition hover:border-secondary/55"
      >
        <input
          class="h-4 w-4 accent-secondary"
          type="checkbox"
          :checked="isCompatibilityBaseSelected(baseModelOption)"
          @change="toggleCompatibilityBase(baseModelOption)"
        >
        {{ baseModelOption }}
      </label>
    </div>

    <label class="grid gap-2">
      <span class="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Control type</span>
      <select
        v-model="compatibilityControlType"
        class="h-10 rounded-md border border-input bg-background px-3 text-sm font-semibold text-card-foreground outline-none transition focus:border-accent focus:ring-2 focus:ring-ring/25"
      >
        <option
          v-for="option in controlTypeOptions"
          :key="option.label"
          :value="option.value"
        >
          {{ option.label }}
        </option>
      </select>
    </label>

    <label class="grid gap-2">
      <span class="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Loader</span>
      <input
        v-model="compatibilityLoaderType"
        class="h-10 rounded-md border border-input bg-background px-3 text-sm font-semibold text-card-foreground outline-none transition focus:border-accent focus:ring-2 focus:ring-ring/25"
        placeholder="controlnet, anima-lllite"
      >
    </label>

    <p
      v-if="error"
      class="rounded-md border border-destructive/35 bg-destructive/10 px-3 py-2 text-xs font-semibold text-destructive"
    >
      {{ error }}
    </p>
  </section>
</template>
