<script setup lang="ts">
import { AlertCircle, LoaderCircle } from 'lucide-vue-next'
import UiPaginatedCardGrid from '../../components/ui/UiPaginatedCardGrid.vue'
import AssetResultCard from './AssetResultCard.vue'
import { useProvidedAssetsView } from './assetsViewContext'

const {
  loading,
  error,
  searched,
  activeQuery,
  activeModelId,
  activeModelVersionId,
  activeUsername,
  isHiddenRoute,
  hiddenModelCount,
  visibleModels,
  hasRenderableState,
  resultSummary,
  currentPage,
  canGoPrevious,
  canGoNext,
  pageCount,
  pageCountExact,
  pageLabel,
  goToPage,
} = useProvidedAssetsView()
</script>

<template>
  <template v-if="hasRenderableState">
    <section
      v-if="loading && !visibleModels.length"
      data-assets-results-scroll
      class="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6"
      aria-live="polite"
    >
      <div
        class="flex h-full items-center justify-center rounded-md border border-border bg-card text-sm text-card-foreground"
      >
        <LoaderCircle class="mr-2 h-5 w-5 animate-spin text-secondary" />
        Searching Civitai...
      </div>
    </section>

    <section
      v-else-if="error"
      data-assets-results-scroll
      class="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6"
      aria-live="polite"
    >
      <div class="rounded-md border border-destructive/35 bg-destructive/10 p-4 text-sm">
        <div class="flex items-start gap-3">
          <AlertCircle class="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
          <div>
            <p class="font-medium text-card-foreground">
              Search failed
            </p>
            <p class="mt-1 text-muted-foreground">
              {{ error }}
            </p>
          </div>
        </div>
      </div>
    </section>

    <section
      v-else-if="searched && !visibleModels.length"
      data-assets-results-scroll
      class="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6"
      aria-live="polite"
    >
      <div class="rounded-md border border-border bg-card p-4 text-sm text-muted-foreground">
        <template v-if="isHiddenRoute && hiddenModelCount < 1">
          No hidden Civitai models yet.
        </template>
        <template v-else-if="isHiddenRoute">
          No hidden Civitai models could be loaded.
        </template>
        <template v-else-if="activeModelVersionId">
          No Civitai model found for version #{{ activeModelVersionId }}.
        </template>
        <template v-else-if="activeModelId">
          No Civitai model found for model #{{ activeModelId }}.
        </template>
        <template v-else-if="activeUsername">
          No Civitai models found for @{{ activeUsername }}.
        </template>
        <template v-else>
          No Civitai models matched "{{ activeQuery }}".
        </template>
      </div>
    </section>

    <UiPaginatedCardGrid
      v-else
      data-assets-results-scroll
      :items-present="visibleModels.length > 0"
      :range-label="resultSummary || pageLabel"
      :current-page="currentPage"
      :page-count="pageCount"
      :page-count-exact="pageCountExact"
      :page-text="pageLabel || `Page ${currentPage}`"
      :can-go-previous="canGoPrevious"
      :can-go-next="canGoNext"
      previous-label="Previous Civitai models page"
      next-label="Next Civitai models page"
      content-class="relative min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6"
      grid-class="asset-card-grid grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
      @go-to-page="goToPage"
    >
      <AssetResultCard
        v-for="model in visibleModels"
        :key="model.id"
        :model="model"
      />

      <template #overlay>
        <div
          v-if="loading && visibleModels.length"
          class="absolute inset-0 z-20 flex items-start justify-center bg-background/45 pt-16 text-sm font-semibold text-foreground backdrop-blur-[1px]"
          aria-live="polite"
        >
          <span class="inline-flex items-center rounded-md border border-border bg-card px-4 py-3 shadow-[0_18px_50px_rgba(0,0,0,0.25)]">
            <LoaderCircle class="mr-2 h-5 w-5 animate-spin text-secondary" />
            Refreshing models...
          </span>
        </div>
      </template>
    </UiPaginatedCardGrid>
  </template>
</template>
