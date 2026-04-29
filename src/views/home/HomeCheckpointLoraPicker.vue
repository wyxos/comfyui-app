<script setup lang="ts">
import { computed, ref } from 'vue'
import { Plus, X } from 'lucide-vue-next'
import { useProvidedHomeView } from './homeViewContext'
import HomeAssetPickerModal from './HomeAssetPickerModal.vue'
import HomeLoraSelectionCard from './HomeLoraSelectionCard.vue'
import type { HomeCheckpointEntry } from './useHomeView'

const props = defineProps<{
  checkpoint: HomeCheckpointEntry
}>()

const {
  loras,
  loadingLoras,
  loraLoadingError,
  getCheckpointLoraOptions,
  getCheckpointLoraPickerPlaceholder,
  addCheckpointLora,
  clearCheckpointLoras,
  setAllCheckpointLorasEnabled,
} = useProvidedHomeView()

const isLoraPickerOpen = ref(false)
const loraOptions = computed(() => getCheckpointLoraOptions(props.checkpoint))
const loraPickerPlaceholder = computed(() => getCheckpointLoraPickerPlaceholder(props.checkpoint))
const canOpenLoraPicker = computed(() => {
  return !loadingLoras.value && loras.value.length > 0 && loraOptions.value.length > 0
})

function openLoraPicker() {
  if (canOpenLoraPicker.value) {
    isLoraPickerOpen.value = true
  }
}

function selectLora(value: string) {
  addCheckpointLora(props.checkpoint.name, value)
}
</script>

<template>
  <div class="mt-3 flex flex-wrap items-end gap-3">
    <label class="min-w-[14rem] flex-1">
      <button
        type="button"
        class="flex min-h-12 w-full items-center justify-between gap-3 rounded-md border border-input bg-card px-3 py-2 text-left text-sm text-card-foreground outline-none transition hover:border-accent hover:bg-accent/8 focus:border-accent focus:ring-2 focus:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-60"
        :aria-label="`Add LoRA for ${checkpoint.name}`"
        :disabled="!canOpenLoraPicker"
        @click="openLoraPicker"
      >
        <span class="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
          <Plus class="h-4 w-4 shrink-0 text-secondary" />
          <span class="truncate">{{ loraPickerPlaceholder }}</span>
        </span>
        <span class="shrink-0 rounded-sm border border-border bg-background px-2 py-0.5 text-xs font-semibold text-muted-foreground">
          {{ loraOptions.length }}
        </span>
      </button>
    </label>

    <div
      v-if="checkpoint.loras.length"
      class="flex flex-wrap items-center justify-end gap-2"
    >
      <button
        type="button"
        class="inline-flex h-6 items-center rounded-sm border border-secondary/35 bg-secondary/10 px-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-secondary transition hover:border-secondary hover:bg-secondary/16"
        @click="setAllCheckpointLorasEnabled(checkpoint.name, true)"
      >
        All on
      </button>
      <button
        type="button"
        class="inline-flex h-6 items-center rounded-sm border border-primary-foreground/12 bg-card px-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-primary-foreground/56 transition hover:border-primary-foreground/28 hover:text-primary-foreground"
        @click="setAllCheckpointLorasEnabled(checkpoint.name, false)"
      >
        All off
      </button>
      <button
        type="button"
        class="inline-flex h-6 items-center gap-1 rounded-sm border border-destructive/40 bg-destructive/10 px-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-destructive transition hover:border-destructive hover:bg-destructive hover:text-destructive-foreground"
        @click="clearCheckpointLoras(checkpoint.name)"
      >
        <X class="h-3 w-3" />
        Clear
      </button>
    </div>
  </div>

  <div
    v-if="checkpoint.loras.length"
    class="mt-3 space-y-2"
  >
    <HomeLoraSelectionCard
      v-for="lora in checkpoint.loras"
      :key="lora.name"
      :checkpoint="checkpoint"
      :lora="lora"
    />
  </div>

  <p
    v-if="loraLoadingError"
    class="mt-3 text-xs text-primary-foreground/52"
  >
    {{ loraLoadingError }}
  </p>

  <HomeAssetPickerModal
    :open="isLoraPickerOpen"
    title="Select LoRA"
    :subtitle="`Compatible LoRAs for ${checkpoint.displayName}.`"
    :options="loraOptions"
    search-placeholder="Search compatible LoRAs..."
    empty-title="No LoRAs found"
    empty-text="No compatible LoRAs match the current search."
    @close="isLoraPickerOpen = false"
    @select="selectLora"
  />
</template>
