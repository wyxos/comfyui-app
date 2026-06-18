<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { LoaderCircle } from 'lucide-vue-next'
import UiPaginationBar from './UiPaginationBar.vue'

defineOptions({
  inheritAttrs: false,
})

const props = withDefaults(
  defineProps<{
    itemsPresent: boolean
    rangeLabel: string
    currentPage: number
    pageCount: number
    pageText?: string
    pageCountExact?: boolean | null
    canGoPrevious?: boolean | null
    canGoNext?: boolean | null
    previousLabel?: string
    nextLabel?: string
    contentClass?: string
    gridClass?: string
    emptyClass?: string
    footerClass?: string
    loading?: boolean
    loadingLabel?: string
    loadingClass?: string
    transitionKey?: string | number
    transitionDelayMs?: number
  }>(),
  {
    canGoPrevious: null,
    canGoNext: null,
    pageCountExact: null,
    pageText: '',
    previousLabel: 'Previous page',
    nextLabel: 'Next page',
    contentClass: 'min-h-0 flex-1 overflow-auto px-4 py-4 sm:px-6',
    gridClass: 'grid grid-cols-[repeat(auto-fill,minmax(18rem,1fr))] gap-3',
    emptyClass: 'flex min-h-48 items-center justify-center rounded-md border border-border bg-card px-4 text-sm text-muted-foreground',
    footerClass: '',
    loading: false,
    loadingLabel: 'Loading...',
    loadingClass: 'flex h-full min-h-48 items-center justify-center text-sm font-semibold text-card-foreground',
    transitionKey: '',
    transitionDelayMs: 180,
  },
)

const emit = defineEmits<{
  'go-to-page': [page: number]
}>()

const MOUSE_PAGINATION_DEDUP_MS = 400
const contentElement = ref<HTMLElement | null>(null)
const pageTransitioning = ref(false)
let lastPaginationButton: number | null = null
let lastPaginationTimestamp = 0
let transitionTimer: ReturnType<typeof setTimeout> | null = null

const displayLoading = computed(() => props.loading || pageTransitioning.value)
const contentStateKey = computed(() => {
  const key = String(props.transitionKey ?? '')
  if (displayLoading.value) {
    return `loading:${key}`
  }

  return `${props.itemsPresent ? 'items' : 'empty'}:${key}`
})

function canGoPreviousPage() {
  return props.canGoPrevious ?? props.currentPage > 1
}

function canGoNextPage() {
  return props.canGoNext ?? props.currentPage < props.pageCount
}

function isMousePaginationButton(event: MouseEvent) {
  return event.button === 3 || event.button === 4
}

function preventMousePaginationDefault(event: MouseEvent) {
  if (!isMousePaginationButton(event)) {
    return
  }

  event.preventDefault()
  event.stopPropagation()
  event.stopImmediatePropagation()
}

function shouldPaginateFromMouse(event: MouseEvent) {
  if (event.type !== 'mousedown' && event.type !== 'auxclick') {
    return false
  }

  const timestamp = event.timeStamp || Date.now()
  if (
    lastPaginationButton === event.button
    && timestamp - lastPaginationTimestamp < MOUSE_PAGINATION_DEDUP_MS
  ) {
    return false
  }

  lastPaginationButton = event.button
  lastPaginationTimestamp = timestamp
  return true
}

function handleMousePagination(event: MouseEvent) {
  if (!isMousePaginationButton(event)) {
    return
  }

  preventMousePaginationDefault(event)
  if (!shouldPaginateFromMouse(event)) {
    return
  }

  if (event.button === 3 && canGoPreviousPage()) {
    emit('go-to-page', props.currentPage - 1)
  } else if (event.button === 4 && canGoNextPage()) {
    emit('go-to-page', props.currentPage + 1)
  }
}

function eventTargetsContent(event: MouseEvent) {
  return event.target instanceof Node && contentElement.value?.contains(event.target)
}

function handleWindowMousePagination(event: MouseEvent) {
  if (eventTargetsContent(event)) {
    handleMousePagination(event)
  }
}

function clearTransitionTimer() {
  if (transitionTimer) {
    clearTimeout(transitionTimer)
    transitionTimer = null
  }
}

function startPageTransition() {
  clearTransitionTimer()
  pageTransitioning.value = true
  transitionTimer = setTimeout(() => {
    pageTransitioning.value = false
    transitionTimer = null
  }, props.transitionDelayMs)
}

watch(() => props.transitionKey, (nextKey, previousKey) => {
  if (nextKey !== previousKey) {
    startPageTransition()
  }
})

onMounted(() => {
  window.addEventListener('mousedown', handleWindowMousePagination, true)
  window.addEventListener('mouseup', handleWindowMousePagination, true)
  window.addEventListener('auxclick', handleWindowMousePagination, true)
})

onBeforeUnmount(() => {
  clearTransitionTimer()
  window.removeEventListener('mousedown', handleWindowMousePagination, true)
  window.removeEventListener('mouseup', handleWindowMousePagination, true)
  window.removeEventListener('auxclick', handleWindowMousePagination, true)
})
</script>

<template>
  <section
    ref="contentElement"
    v-bind="$attrs"
    :class="contentClass"
    @mousedown.capture="handleMousePagination"
    @mouseup.capture="preventMousePaginationDefault"
    @auxclick.capture="handleMousePagination"
  >
    <Transition
      name="paginated-card-content"
      mode="out-in"
    >
      <div
        v-if="displayLoading"
        :key="contentStateKey"
        :class="loadingClass"
        role="status"
        aria-live="polite"
      >
        <LoaderCircle class="mr-2 h-5 w-5 animate-spin text-secondary" />
        {{ loadingLabel }}
      </div>

      <div
        v-else-if="itemsPresent"
        :key="contentStateKey"
        :class="gridClass"
        data-paginated-card-grid
      >
        <slot />
      </div>

      <div
        v-else
        :key="contentStateKey"
        :class="emptyClass"
      >
        <slot name="empty" />
      </div>
    </Transition>

    <slot name="overlay" />
  </section>

  <UiPaginationBar
    :range-label="rangeLabel"
    :current-page="currentPage"
    :page-count="pageCount"
    :page-text="pageText"
    :page-count-exact="pageCountExact"
    :can-go-previous="canGoPrevious"
    :can-go-next="canGoNext"
    :previous-label="previousLabel"
    :next-label="nextLabel"
    :footer-class="footerClass"
    @go-to-page="emit('go-to-page', $event)"
  />
</template>

<style scoped>
.paginated-card-content-enter-active,
.paginated-card-content-leave-active {
  transition: opacity 160ms ease, transform 160ms ease;
}

.paginated-card-content-enter-from,
.paginated-card-content-leave-to {
  opacity: 0;
  transform: translateY(4px);
}
</style>
