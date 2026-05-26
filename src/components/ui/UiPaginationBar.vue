<script setup lang="ts">
import { ChevronLeft, ChevronRight } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'

const props = withDefaults(
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
    pageText: '',
    previousLabel: 'Previous page',
    nextLabel: 'Next page',
    footerClass: '',
  },
)

const emit = defineEmits<{
  'go-to-page': [page: number]
}>()

const pageDraft = ref(String(props.currentPage))
const maxPageInput = computed(() => Math.max(
  1,
  props.pageCount,
  props.currentPage,
  props.canGoNext ? props.currentPage + 1 : 1,
))

watch(
  () => props.currentPage,
  (page) => {
    pageDraft.value = String(page)
  },
)

function clampPage(page: number) {
  return Math.min(Math.max(page, 1), maxPageInput.value)
}

function goToPage(page: number) {
  const nextPage = clampPage(page)
  pageDraft.value = String(nextPage)
  if (nextPage !== props.currentPage) {
    emit('go-to-page', nextPage)
  }
}

function submitPageDraft() {
  const page = Number.parseInt(pageDraft.value, 10)
  if (Number.isNaN(page)) {
    pageDraft.value = String(props.currentPage)
    return
  }

  goToPage(page)
}
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
        @click="goToPage(currentPage - 1)"
      >
        <ChevronLeft class="h-4 w-4" />
      </button>
      <span class="sr-only">
        {{ pageText ?? `Page ${currentPage} / ${pageCount}` }}
      </span>
      <label class="flex h-8 items-center gap-1 rounded-sm border border-border bg-background/45 px-2 font-semibold text-card-foreground">
        <span>Page</span>
        <input
          v-model="pageDraft"
          class="h-6 w-12 rounded-sm border border-border bg-card px-1 text-center text-card-foreground outline-none transition focus:border-secondary"
          type="number"
          inputmode="numeric"
          min="1"
          :max="maxPageInput"
          aria-label="Page number"
          @change="submitPageDraft"
          @keydown.enter.prevent="submitPageDraft"
        >
        <span class="text-muted-foreground">/ {{ maxPageInput }}</span>
      </label>
      <button
        class="inline-flex h-8 w-8 items-center justify-center rounded-sm border border-border text-muted-foreground transition hover:border-secondary/60 hover:text-secondary disabled:cursor-not-allowed disabled:opacity-50"
        type="button"
        :disabled="!(canGoNext ?? currentPage < pageCount)"
        :aria-label="nextLabel"
        @click="goToPage(currentPage + 1)"
      >
        <ChevronRight class="h-4 w-4" />
      </button>
    </div>
  </footer>
</template>
