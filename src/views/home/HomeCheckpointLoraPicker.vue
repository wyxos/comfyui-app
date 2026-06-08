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
const areAllCheckpointLorasEnabled = computed(() => {
  return (
    props.checkpoint.loras.length > 0 &&
    props.checkpoint.loras.every((lora) => lora.enabled)
  )
})
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

function toggleAllCheckpointLoras() {
  setAllCheckpointLorasEnabled(props.checkpoint.name, !areAllCheckpointLorasEnabled.value)
}
</script>

<template>
  <div
    v-if="checkpoint.loras.length"
    class="mt-3 space-y-2"
  >
    <div class="flex flex-wrap items-center gap-2">
      <div class="flex items-center gap-2 text-[11px] text-primary-foreground/60">
        <span>All LoRAs</span>
        <button
          type="button"
          role="switch"
          :aria-checked="areAllCheckpointLorasEnabled"
          :aria-label="`${areAllCheckpointLorasEnabled ? 'Disable' : 'Enable'} all LoRAs for ${checkpoint.displayName}`"
          class="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition focus:outline-none focus:ring-2 focus:ring-ring/25"
          :class="
            areAllCheckpointLorasEnabled
              ? 'border-secondary bg-secondary'
              : 'border-primary-foreground/12 bg-primary-foreground/8'
          "
          @click="toggleAllCheckpointLoras"
        >
          <span
            class="inline-block h-4 w-4 rounded-full bg-primary-foreground shadow-sm transition-transform"
            :class="areAllCheckpointLorasEnabled ? 'translate-x-5' : 'translate-x-1'"
          />
        </button>
      </div>
      <button
        type="button"
        class="inline-flex h-6 items-center gap-1 rounded-sm border border-destructive/40 bg-destructive/10 px-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-destructive transition hover:border-destructive hover:bg-destructive hover:text-destructive-foreground"
        @click="clearCheckpointLoras(checkpoint.name)"
      >
        <X class="h-3 w-3" />
        Clear
      </button>
    </div>

    <HomeLoraSelectionCard
      v-for="lora in checkpoint.loras"
      :key="lora.name"
      :checkpoint="checkpoint"
      :lora="lora"
    />
  </div>

  <div class="mt-3">
    <label
      data-testid="checkpoint-lora-add-section"
      class="block w-full"
    >
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
      :subtitle="`Compatible and same-architecture LoRAs for ${checkpoint.displayName}.`"
      :options="loraOptions"
      search-placeholder="Search compatible LoRAs..."
    empty-title="No LoRAs found"
    empty-text="No compatible LoRAs match the current search."
    @close="isLoraPickerOpen = false"
    @select="selectLora"
  />
</template>
