<script setup lang="ts">
import { AlertCircle } from 'lucide-vue-next'
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
      v-if="error"
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
      v-else-if="searched && !visibleModels.length && !loading"
      data-assets-results-scroll
      class="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6"
      aria-live="polite"
    >
      <div class="rounded-md border border-border bg-card p-4 text-sm text-muted-foreground">
        <template v-if="activeModelVersionId">
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
      :loading="loading"
      :transition-key="currentPage"
      loading-label="Loading models..."
      previous-label="Previous Civitai models page"
      next-label="Next Civitai models page"
      content-class="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6"
      grid-class="asset-card-grid grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
      @go-to-page="goToPage"
    >
      <AssetResultCard
        v-for="model in visibleModels"
        :key="model.id"
        :model="model"
      />
    </UiPaginatedCardGrid>
  </template>
</template>
