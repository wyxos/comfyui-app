<script setup lang="ts">
import {
  FileDown,
  LoaderCircle,
  Search,
} from 'lucide-vue-next'
import { computed } from 'vue'
import {
  sourceFilters,
  typeFilters,
  type LibrarySourceFilter,
  type LibraryTypeFilter,
} from './libraryModelHelpers'

type BaseModelOption = {
  label: string
  value: string
  count: number
}

type TypeCounts = {
  all: number
  checkpoint: number
  lora: number
  controlnet: number
  hidden: number
  hiddenStored: number
  watched: number
}

const props = defineProps<{
  baseModelFilter: string
  baseModelOptions: BaseModelOption[]
  errorMessage: string
  includeNsfw: boolean
  loading: boolean
  query: string
  sourceFilter: LibrarySourceFilter
  typeCounts: TypeCounts
  typeFilter: LibraryTypeFilter
}>()

const emit = defineEmits<{
  refresh: []
  'update:baseModelFilter': [value: string]
  'update:includeNsfw': [value: boolean]
  'update:query': [value: string]
  'update:sourceFilter': [value: LibrarySourceFilter]
  'update:typeFilter': [value: LibraryTypeFilter]
}>()

const queryModel = computed({
  get: () => props.query,
  set: (value: string) => emit('update:query', value),
})
const includeNsfwModel = computed({
  get: () => props.includeNsfw,
  set: (value: boolean) => emit('update:includeNsfw', value),
})
const hiddenCountLabel = computed(() => {
  if (props.typeCounts.hiddenStored > props.typeCounts.hidden) {
    return `${props.typeCounts.hidden} of ${props.typeCounts.hiddenStored} hidden loadable`
  }

  return `${props.typeCounts.hidden} hidden`
})
</script>

<template>
  <section class="border-b border-border bg-card/82 px-4 py-3 sm:px-6">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="min-w-0">
        <h1 class="text-base font-semibold tracking-normal">Library</h1>
        <p class="mt-1 text-xs text-muted-foreground">
          {{ typeCounts.all }} library items, {{ typeCounts.checkpoint }} checkpoints, {{ typeCounts.lora }} LoRAs, {{ typeCounts.controlnet }} ControlNets, {{ typeCounts.watched }} watched, {{ hiddenCountLabel }}
        </p>
      </div>

      <button
        class="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-background px-3 text-xs font-semibold text-card-foreground transition hover:border-secondary/60 hover:text-secondary focus:outline-none focus:ring-2 focus:ring-ring/25 disabled:cursor-wait disabled:opacity-60"
        type="button"
        :disabled="loading"
        @click="emit('refresh')"
      >
        <LoaderCircle
          v-if="loading"
          class="h-4 w-4 animate-spin"
        />
        <FileDown
          v-else
          class="h-4 w-4"
        />
        Refresh
      </button>
    </div>

    <div class="mt-3 flex flex-wrap items-center gap-2">
      <label class="relative min-w-[16rem] flex-1 sm:max-w-md">
        <span class="sr-only">Search library</span>
        <Search class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          v-model="queryModel"
          class="h-9 w-full rounded-md border border-input bg-primary px-9 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-accent focus:ring-2 focus:ring-ring/25"
          type="search"
          placeholder="Search library model, version, file, path"
        >
      </label>

      <div
        class="flex h-9 overflow-hidden rounded-md border border-border"
        role="group"
        aria-label="Library type filter"
      >
        <button
          v-for="option in typeFilters"
          :key="option.value"
          class="border-r border-border px-3 text-xs font-semibold last:border-r-0"
          :class="typeFilter === option.value ? 'bg-secondary text-secondary-foreground' : 'bg-background text-muted-foreground hover:bg-accent/10 hover:text-accent'"
          type="button"
          @click="emit('update:typeFilter', option.value)"
        >
          {{ option.label }}
        </button>
      </div>

      <div
        class="flex h-9 overflow-hidden rounded-md border border-border"
        role="group"
        aria-label="Library watch filter"
      >
        <button
          v-for="option in sourceFilters"
          :key="option.value"
          class="border-r border-border px-3 text-xs font-semibold last:border-r-0"
          :class="sourceFilter === option.value ? 'bg-secondary text-secondary-foreground' : 'bg-background text-muted-foreground hover:bg-accent/10 hover:text-accent'"
          type="button"
          :aria-label="option.ariaLabel"
          @click="emit('update:sourceFilter', option.value)"
        >
          {{ option.label }}
        </button>
      </div>

      <div
        class="flex min-h-9 max-w-full flex-wrap overflow-hidden rounded-md border border-border"
        role="group"
        aria-label="Library base model filter"
      >
        <button
          v-for="option in baseModelOptions"
          :key="option.value"
          class="border-r border-b border-border px-3 py-2 text-xs font-semibold last:border-r-0"
          :class="baseModelFilter === option.value ? 'bg-secondary text-secondary-foreground' : 'bg-background text-muted-foreground hover:bg-accent/10 hover:text-accent'"
          type="button"
          :aria-label="`Show ${option.label} base models`"
          @click="emit('update:baseModelFilter', option.value)"
        >
          {{ option.label }}
          <span class="ml-1 text-[10px] opacity-70">{{ option.count }}</span>
        </button>
      </div>

      <label class="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-background px-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground transition hover:border-secondary/55 hover:text-foreground">
        <input
          v-model="includeNsfwModel"
          class="h-4 w-4 accent-secondary"
          type="checkbox"
          aria-label="Include NSFW library models"
        >
        NSFW
      </label>
    </div>

    <p
      v-if="errorMessage"
      class="mt-3 inline-flex rounded-sm border border-destructive/45 bg-destructive/16 px-3 py-2 text-xs font-semibold text-destructive"
    >
      {{ errorMessage }}
    </p>
  </section>
</template>
