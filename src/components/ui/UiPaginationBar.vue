<script setup lang="ts">
import { ChevronLeft, ChevronRight } from 'lucide-vue-next'

withDefaults(
  defineProps<{
    rangeLabel: string
    currentPage: number
    pageCount: number
    pageText?: string
    canGoPrevious?: boolean | null
    canGoNext?: boolean | null
    previousLabel?: string
    nextLabel?: string
    footerClass?: string
  }>(),
  {
    canGoPrevious: null,
    canGoNext: null,
    previousLabel: 'Previous page',
    nextLabel: 'Next page',
    footerClass: '',
  },
)

const emit = defineEmits<{
  'go-to-page': [page: number]
}>()
</script>

<template>
  <footer :class="['flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-border bg-card/82 px-4 py-3 text-xs text-muted-foreground sm:px-6', footerClass]">
    <span>{{ rangeLabel }}</span>
    <div class="flex items-center gap-2">
      <button
        class="inline-flex h-8 w-8 items-center justify-center rounded-sm border border-border text-muted-foreground transition hover:border-secondary/60 hover:text-secondary disabled:cursor-not-allowed disabled:opacity-50"
        type="button"
        :disabled="!(canGoPrevious ?? currentPage > 1)"
        :aria-label="previousLabel"
        @click="emit('go-to-page', currentPage - 1)"
      >
        <ChevronLeft class="h-4 w-4" />
      </button>
      <span class="min-w-20 text-center font-semibold text-card-foreground">
        {{ pageText ?? `Page ${currentPage} / ${pageCount}` }}
      </span>
      <button
        class="inline-flex h-8 w-8 items-center justify-center rounded-sm border border-border text-muted-foreground transition hover:border-secondary/60 hover:text-secondary disabled:cursor-not-allowed disabled:opacity-50"
        type="button"
        :disabled="!(canGoNext ?? currentPage < pageCount)"
        :aria-label="nextLabel"
        @click="emit('go-to-page', currentPage + 1)"
      >
        <ChevronRight class="h-4 w-4" />
      </button>
    </div>
  </footer>
</template>
