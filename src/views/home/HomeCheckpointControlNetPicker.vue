<script setup lang="ts">
import { computed, ref } from 'vue'
import { Plus, X } from 'lucide-vue-next'
import UiSwitch from '../../components/ui/UiSwitch.vue'
import { useProvidedHomeView } from './homeViewContext'
import HomeAssetPickerModal from './HomeAssetPickerModal.vue'
import HomeControlNetInstanceCard from './HomeControlNetInstanceCard.vue'
import type { HomeCheckpointEntry } from './useHomeView'

const props = defineProps<{
  checkpoint: HomeCheckpointEntry
}>()

const {
  controlNets,
  loadingControlNets,
  controlNetLoadingError,
  getCheckpointControlNetOptions,
  getCheckpointControlNetPickerPlaceholder,
  getControlNetCompatibilityLabel,
  addCheckpointControlNet,
  clearCheckpointControlNets,
  setAllCheckpointControlNetsEnabled,
} = useProvidedHomeView()

const isControlNetPickerOpen = ref(false)
const checkpointControlNets = computed(() => props.checkpoint.controlNets ?? [])
const controlNetOptions = computed(() => getCheckpointControlNetOptions(props.checkpoint))
const controlNetPickerPlaceholder = computed(() => getCheckpointControlNetPickerPlaceholder(props.checkpoint))
const areAllCheckpointControlNetsEnabled = computed(() => {
  return (
    checkpointControlNets.value.length > 0 &&
    checkpointControlNets.value.every((controlNet) => controlNet.enabled)
  )
})
const canOpenControlNetPicker = computed(() => {
  return !loadingControlNets.value && controlNets.value.length > 0 && controlNetOptions.value.length > 0
})

function openControlNetPicker() {
  if (canOpenControlNetPicker.value) {
    isControlNetPickerOpen.value = true
  }
}

function selectControlNet(value: string) {
  addCheckpointControlNet(props.checkpoint.name, value)
}

function toggleAllCheckpointControlNets() {
  setAllCheckpointControlNetsEnabled(
    props.checkpoint.name,
    !areAllCheckpointControlNetsEnabled.value,
  )
}
</script>

<template>
  <div class="mt-3 border-t border-primary-foreground/10 pt-3">
    <div
      v-if="checkpointControlNets.length"
      class="space-y-2"
    >
      <HomeControlNetInstanceCard
        v-for="controlNet in checkpointControlNets"
        :key="controlNet.id"
        :checkpoint="checkpoint"
        :checkpoint-name="checkpoint.name"
        :control-net="controlNet"
        :compatibility-label="getControlNetCompatibilityLabel(checkpoint, controlNet.model)"
      />
    </div>

    <div class="mt-3 flex flex-wrap items-end gap-3">
      <div
        v-if="checkpointControlNets.length"
        class="flex flex-wrap items-center gap-2"
      >
        <div class="flex items-center gap-2 text-[11px] text-primary-foreground/60">
          <span>All ControlNets</span>
          <UiSwitch
            :checked="areAllCheckpointControlNetsEnabled"
            :aria-label="`${areAllCheckpointControlNetsEnabled ? 'Disable' : 'Enable'} all ControlNets for ${checkpoint.displayName}`"
            @click="toggleAllCheckpointControlNets"
          />
        </div>
        <button
          type="button"
          class="inline-flex h-6 items-center gap-1 rounded-sm border border-destructive/40 bg-destructive/10 px-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-destructive transition hover:border-destructive hover:bg-destructive hover:text-destructive-foreground"
          @click="clearCheckpointControlNets(checkpoint.name)"
        >
          <X class="h-3 w-3" />
          Clear
        </button>
      </div>

      <label class="min-w-[14rem] flex-1">
        <button
          type="button"
          class="flex min-h-12 w-full items-center justify-between gap-3 rounded-md border border-input bg-card px-3 py-2 text-left text-sm text-card-foreground outline-none transition hover:border-accent hover:bg-accent/8 focus:border-accent focus:ring-2 focus:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-60"
          :aria-label="`Add ControlNet for ${checkpoint.name}`"
          :disabled="!canOpenControlNetPicker"
          @click="openControlNetPicker"
        >
          <span class="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
            <Plus class="h-4 w-4 shrink-0 text-secondary" />
            <span class="truncate">{{ controlNetPickerPlaceholder }}</span>
          </span>
          <span class="shrink-0 rounded-sm border border-border bg-background px-2 py-0.5 text-xs font-semibold text-muted-foreground">
            {{ controlNetOptions.length }}
          </span>
        </button>
      </label>
    </div>

    <p
      v-if="controlNetLoadingError"
      class="mt-3 text-xs text-primary-foreground/52"
    >
      {{ controlNetLoadingError }}
    </p>

    <HomeAssetPickerModal
      :open="isControlNetPickerOpen"
      title="Select ControlNet"
      :subtitle="`Compatible ControlNets for ${checkpoint.displayName}.`"
      :options="controlNetOptions"
      search-placeholder="Search compatible ControlNets..."
      empty-title="No ControlNets found"
      empty-text="No compatible ControlNets match the current search."
      @close="isControlNetPickerOpen = false"
      @select="selectControlNet"
    />
  </div>
</template>
