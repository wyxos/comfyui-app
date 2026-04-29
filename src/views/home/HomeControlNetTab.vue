<script setup lang="ts">
import { Plus, X } from 'lucide-vue-next'
import { useProvidedHomeView } from './homeViewContext'
import HomeControlNetInstanceCard from './HomeControlNetInstanceCard.vue'

const {
  formTab,
  selectedControlNets,
  controlNets,
  loadingControlNets,
  controlNetLoadingError,
  controlNetSummary,
  controlNetGenerationBlocker,
  addControlNetInstance,
  clearControlNetInstances,
} = useProvidedHomeView()
</script>

<template>
  <div
    v-show="formTab === 'controlnet'"
    class="space-y-3"
  >
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="min-w-0">
        <span class="field-label">ControlNet instances</span>
        <p class="mt-1 text-xs text-primary-foreground/60">{{ controlNetSummary }}</p>
      </div>

      <div class="flex shrink-0 items-center gap-2">
        <button
          type="button"
          class="inline-flex h-8 items-center gap-2 rounded-sm border border-secondary/35 bg-secondary/10 px-3 text-xs font-semibold uppercase tracking-[0.1em] text-secondary transition hover:border-secondary hover:bg-secondary/16 disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="loadingControlNets || !controlNets.length"
          @click="addControlNetInstance"
        >
          <Plus class="h-3.5 w-3.5" />
          Add
        </button>
        <button
          v-if="selectedControlNets.length"
          type="button"
          class="inline-flex h-8 items-center gap-2 rounded-sm border border-destructive/40 bg-destructive/10 px-3 text-xs font-semibold uppercase tracking-[0.1em] text-destructive transition hover:border-destructive hover:bg-destructive hover:text-destructive-foreground"
          @click="clearControlNetInstances"
        >
          <X class="h-3.5 w-3.5" />
          Clear
        </button>
      </div>
    </div>

    <p
      v-if="controlNetLoadingError"
      class="text-xs text-destructive"
    >
      {{ controlNetLoadingError }}
    </p>

    <p
      v-if="controlNetGenerationBlocker"
      class="text-xs text-secondary"
    >
      {{ controlNetGenerationBlocker }}
    </p>

    <div
      v-if="selectedControlNets.length"
      class="space-y-3"
    >
      <HomeControlNetInstanceCard
        v-for="controlNet in selectedControlNets"
        :key="controlNet.id"
        :control-net="controlNet"
      />
    </div>

    <div
      v-else
      class="rounded-md border border-dashed border-primary-foreground/12 bg-primary-foreground/4 px-4 py-6 text-sm text-primary-foreground/56"
    >
      No ControlNet instances configured.
    </div>
  </div>
</template>
