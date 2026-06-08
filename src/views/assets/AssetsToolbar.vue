<script setup lang="ts">
import { Hash, Search, Tag } from 'lucide-vue-next'
import UiSelect from '../../components/ui/UiSelect.vue'
import { useProvidedAssetsView } from './assetsViewContext'

const {
  MODEL_TYPE_OPTIONS,
  MODEL_SORT_OPTIONS,
  MODEL_PERIOD_OPTIONS,
  ASSET_SEARCH_PRESETS,
  BASE_MODEL_OPTIONS,
  query,
  tagQuery,
  modelIdQuery,
  modelVersionIdQuery,
  includeNsfw,
  selectedType,
  selectedSort,
  selectedPeriod,
  selectedBaseModels,
  hasStoredCivitaiApiKey,
  downloadActionError,
  downloadActionNotice,
  creatorFilterLabel,
  selectedBaseModelSet,
  selectedBaseModelLabel,
  isUsingDefaultBaseModels,
  toggleBaseModelFilter,
  resetDefaultBaseModels,
  clearBaseModelFilters,
  applySearchPreset,
  clearCreatorFilter,
  searchByModelId,
  searchByModelVersionId,
} = useProvidedAssetsView()
</script>

<template>
  <section class="shrink-0 border-b border-border bg-card/78 px-4 py-4 sm:px-6">
    <div class="flex flex-col gap-3">
      <div class="flex flex-col gap-3 xl:flex-row xl:items-center">
        <label
          class="sr-only"
          for="asset-search"
        >
          Search Civitai models
        </label>

        <div class="relative min-w-0 flex-1">
          <Search class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            id="asset-search"
            v-model="query"
            class="h-12 w-full rounded-md border border-input bg-background pl-10 pr-3 text-base text-foreground outline-none transition placeholder:text-muted-foreground focus:border-accent focus:ring-2 focus:ring-ring/25"
            placeholder="Search Civitai models, LoRAs, ControlNets..."
            type="search"
            autocomplete="off"
          >
        </div>

        <div class="grid shrink-0 grid-cols-1 gap-2 sm:grid-cols-3 xl:flex">
          <label
            class="sr-only"
            for="asset-tag"
          >
            Tag
          </label>
          <div class="relative min-w-0">
            <Tag class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              id="asset-tag"
              v-model="tagQuery"
              class="h-12 w-full rounded-md border border-input bg-background pl-10 pr-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-accent focus:ring-2 focus:ring-ring/25 sm:w-36"
              placeholder="Tag"
              type="search"
              autocomplete="off"
            >
          </div>

          <label
            class="sr-only"
            for="asset-model-id"
          >
            Model ID
          </label>
          <div class="relative min-w-0">
            <Hash class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              id="asset-model-id"
              v-model="modelIdQuery"
              class="h-12 w-full rounded-md border border-input bg-background pl-10 pr-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-accent focus:ring-2 focus:ring-ring/25 sm:w-32"
              placeholder="Model ID"
              type="text"
              inputmode="numeric"
              autocomplete="off"
              @keydown.enter.prevent="searchByModelId"
            >
          </div>

          <label
            class="sr-only"
            for="asset-version-id"
          >
            Version ID
          </label>
          <div class="relative min-w-0">
            <Hash class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              id="asset-version-id"
              v-model="modelVersionIdQuery"
              class="h-12 w-full rounded-md border border-input bg-background pl-10 pr-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-accent focus:ring-2 focus:ring-ring/25 sm:w-36"
              placeholder="Version ID"
              type="text"
              inputmode="numeric"
              autocomplete="off"
              @keydown.enter.prevent="searchByModelVersionId"
            >
          </div>
        </div>

        <div class="flex shrink-0 flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em]">
          <span
            v-if="creatorFilterLabel"
            class="inline-flex h-9 items-center gap-2 rounded-md border border-secondary/40 bg-secondary/10 px-3 text-secondary"
          >
            {{ creatorFilterLabel }}
            <button
              class="rounded-sm px-1 text-secondary transition hover:bg-secondary hover:text-secondary-foreground"
              type="button"
              aria-label="Clear creator filter"
              @click="clearCreatorFilter"
            >
              ×
            </button>
          </span>
          <label class="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-background px-3 text-muted-foreground transition hover:border-secondary/55 hover:text-foreground">
            <input
              v-model="includeNsfw"
              class="h-4 w-4 accent-secondary"
              type="checkbox"
            >
            NSFW
          </label>
          <UiSelect
            v-model="selectedType"
            class="w-48"
            :options="MODEL_TYPE_OPTIONS"
            placeholder="All types"
          />
          <UiSelect
            v-model="selectedSort"
            class="w-44"
            :options="MODEL_SORT_OPTIONS"
            placeholder="No sort"
          />
          <UiSelect
            v-model="selectedPeriod"
            class="w-32"
            :options="MODEL_PERIOD_OPTIONS"
            placeholder="All time"
          />
          <span
            v-if="hasStoredCivitaiApiKey"
            class="rounded-sm border border-secondary/40 bg-secondary/10 px-2 py-1 text-secondary"
          >
            API key
          </span>
          <span
            v-if="downloadActionError"
            class="rounded-sm border border-destructive/35 bg-destructive/10 px-2 py-1 text-destructive"
          >
            {{ downloadActionError }}
          </span>
          <span
            v-else-if="downloadActionNotice"
            class="rounded-sm border border-secondary/35 bg-secondary/10 px-2 py-1 text-secondary"
          >
            {{ downloadActionNotice }}
          </span>
        </div>
      </div>

      <div class="flex min-w-0 items-center gap-2 rounded-md border border-border bg-background/70 px-2 py-2 text-xs font-semibold normal-case tracking-normal">
        <span class="shrink-0 px-1 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
          Presets
        </span>
        <div class="flex min-w-0 flex-wrap items-center gap-2">
          <button
            v-for="preset in ASSET_SEARCH_PRESETS"
            :key="preset.label"
            type="button"
            class="inline-flex h-7 shrink-0 items-center rounded-sm border border-secondary/40 bg-secondary/10 px-2 text-xs font-semibold text-secondary transition hover:border-secondary hover:bg-secondary hover:text-secondary-foreground"
            @click="applySearchPreset(preset)"
          >
            {{ preset.label }}
          </button>
        </div>
      </div>

      <div class="flex min-w-0 items-center gap-2 rounded-md border border-border bg-background/70 px-2 py-2 text-xs font-semibold normal-case tracking-normal">
        <span class="shrink-0 px-1 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
          Base
        </span>
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-2 pr-2">
            <button
              v-for="option in BASE_MODEL_OPTIONS"
              :key="option.value"
              type="button"
              class="inline-flex h-7 shrink-0 items-center whitespace-nowrap rounded-sm border px-2 text-xs font-semibold transition"
              :class="
                selectedBaseModelSet.has(option.value)
                  ? 'border-secondary bg-secondary/16 text-secondary'
                  : 'border-border bg-card text-muted-foreground hover:border-accent hover:text-accent'
              "
              @click="toggleBaseModelFilter(option.value)"
            >
              {{ option.label }}
            </button>
          </div>
        </div>
        <span class="hidden min-w-0 max-w-72 shrink truncate px-1 text-xs text-muted-foreground lg:block">
          {{ selectedBaseModelLabel }}
        </span>
        <button
          type="button"
          class="inline-flex h-7 shrink-0 items-center rounded-sm border border-border px-2 text-xs font-semibold text-muted-foreground transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-45"
          :disabled="isUsingDefaultBaseModels"
          @click="resetDefaultBaseModels"
        >
          Default
        </button>
        <button
          type="button"
          class="inline-flex h-7 shrink-0 items-center rounded-sm border border-border px-2 text-xs font-semibold text-muted-foreground transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-45"
          :disabled="selectedBaseModels.length === 0"
          @click="clearBaseModelFilters"
        >
          All
        </button>
      </div>
    </div>
  </section>
</template>
