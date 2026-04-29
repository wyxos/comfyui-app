<script setup lang="ts">
import { computed, ref } from 'vue'
import { LoaderCircle, Plus, X } from 'lucide-vue-next'
import { useProvidedHomeView } from './homeViewContext'
import HomeAssetPickerModal from './HomeAssetPickerModal.vue'
import HomeCheckpointCard from './HomeCheckpointCard.vue'

const {
  checkpoints,
  formTab,
  loadingCheckpoints,
  selectedCheckpointEntries,
  checkpointOptions,
  checkpointPickerPlaceholder,
  addSelectedCheckpoint,
  clearSelectedCheckpoints,
  setAllSelectedCheckpointsEnabled,
} = useProvidedHomeView()

const isCheckpointPickerOpen = ref(false)
const canOpenCheckpointPicker = computed(() => {
  return !loadingCheckpoints.value && checkpoints.value.length > 0 && checkpointOptions.value.length > 0
})

function openCheckpointPicker() {
  if (canOpenCheckpointPicker.value) {
    isCheckpointPickerOpen.value = true
  }
}

function selectCheckpoint(value: string) {
  addSelectedCheckpoint(value)
}
</script>

<template>
  <div
    v-show="formTab === 'assets'"
    class="space-y-5"
  >
    <div class="space-y-3">
      <label class="flex flex-col gap-2">
        <span class="field-label">Checkpoint</span>
        <button
          type="button"
          class="flex min-h-12 w-full items-center justify-between gap-3 rounded-md border border-input bg-card px-3 py-2 text-left text-sm text-card-foreground outline-none transition hover:border-accent hover:bg-accent/8 focus:border-accent focus:ring-2 focus:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-60"
          aria-label="Add checkpoint"
          :disabled="!canOpenCheckpointPicker"
          @click="openCheckpointPicker"
        >
          <span class="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
            <LoaderCircle
              v-if="loadingCheckpoints"
              class="h-4 w-4 shrink-0 animate-spin text-secondary"
            />
            <Plus
              v-else
              class="h-4 w-4 shrink-0 text-secondary"
            />
            <span class="truncate">{{ checkpointPickerPlaceholder }}</span>
          </span>
          <span class="shrink-0 rounded-sm border border-border bg-background px-2 py-0.5 text-xs font-semibold text-muted-foreground">
            {{ checkpointOptions.length }}
          </span>
        </button>
      </label>

      <div
        v-if="loadingCheckpoints"
        role="status"
        aria-live="polite"
        class="flex items-center gap-2 rounded-md border border-primary-foreground/12 bg-primary-foreground/6 px-3 py-3 text-sm text-primary-foreground/72"
      >
        <LoaderCircle class="h-4 w-4 shrink-0 animate-spin text-secondary" />
        <span>Loading checkpoints from ComfyUI...</span>
      </div>

      <template v-if="selectedCheckpointEntries.length">
        <div class="flex flex-wrap items-center justify-end gap-1">
          <button
            type="button"
            class="inline-flex h-6 items-center rounded-sm border border-secondary/35 bg-secondary/10 px-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-secondary transition hover:border-secondary hover:bg-secondary/16"
            @click="setAllSelectedCheckpointsEnabled(true)"
          >
            All on
          </button>
          <button
            type="button"
            class="inline-flex h-6 items-center rounded-sm border border-primary-foreground/12 bg-card px-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-primary-foreground/56 transition hover:border-primary-foreground/28 hover:text-primary-foreground"
            @click="setAllSelectedCheckpointsEnabled(false)"
          >
            All off
          </button>
          <button
            type="button"
            class="inline-flex h-6 items-center gap-1 rounded-sm border border-destructive/40 bg-destructive/10 px-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-destructive transition hover:border-destructive hover:bg-destructive hover:text-destructive-foreground"
            @click="clearSelectedCheckpoints"
          >
            <X class="h-3 w-3" />
            Clear
          </button>
        </div>

        <div class="space-y-2">
          <HomeCheckpointCard
            v-for="checkpoint in selectedCheckpointEntries"
            :key="checkpoint.name"
            :checkpoint="checkpoint"
          />
        </div>
      </template>

      <p
        v-else
        class="rounded-md border border-primary-foreground/12 bg-primary-foreground/6 px-3 py-3 text-sm text-primary-foreground/62"
      >
          Add one or more checkpoints. Each enabled checkpoint submits its own ComfyUI job.
      </p>
    </div>

    <HomeAssetPickerModal
      :open="isCheckpointPickerOpen"
      title="Select checkpoint"
      subtitle="Available checkpoints not already selected."
      :options="checkpointOptions"
      search-placeholder="Search checkpoints..."
      empty-title="No checkpoints found"
      empty-text="No available checkpoints match the current search."
      @close="isCheckpointPickerOpen = false"
      @select="selectCheckpoint"
    />
  </div>
</template>
