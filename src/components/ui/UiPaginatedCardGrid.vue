<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
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
    canGoPrevious?: boolean | null
    canGoNext?: boolean | null
    previousLabel?: string
    nextLabel?: string
    contentClass?: string
    gridClass?: string
    emptyClass?: string
    footerClass?: string
  }>(),
  {
    canGoPrevious: null,
    canGoNext: null,
    pageText: '',
    previousLabel: 'Previous page',
    nextLabel: 'Next page',
    contentClass: 'min-h-0 flex-1 overflow-auto px-4 py-4 sm:px-6',
    gridClass: 'grid grid-cols-[repeat(auto-fill,minmax(18rem,1fr))] gap-3',
    emptyClass: 'flex min-h-48 items-center justify-center rounded-md border border-border bg-card px-4 text-sm text-muted-foreground',
    footerClass: '',
  },
)

const emit = defineEmits<{
  'go-to-page': [page: number]
}>()

const MOUSE_PAGINATION_DEDUP_MS = 400
const contentElement = ref<HTMLElement | null>(null)
let lastPaginationButton: number | null = null
let lastPaginationTimestamp = 0

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

onMounted(() => {
  window.addEventListener('mousedown', handleWindowMousePagination, true)
  window.addEventListener('mouseup', handleWindowMousePagination, true)
  window.addEventListener('auxclick', handleWindowMousePagination, true)
})

onBeforeUnmount(() => {
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
    <div
      v-if="itemsPresent"
      :class="gridClass"
      data-paginated-card-grid
    >
      <slot />
    </div>

    <div
      v-else
      :class="emptyClass"
    >
      <slot name="empty" />
    </div>

    <slot name="overlay" />
  </section>

  <UiPaginationBar
    :range-label="rangeLabel"
    :current-page="currentPage"
    :page-count="pageCount"
    :page-text="pageText"
    :can-go-previous="canGoPrevious"
    :can-go-next="canGoNext"
    :previous-label="previousLabel"
    :next-label="nextLabel"
    :footer-class="footerClass"
    @go-to-page="emit('go-to-page', $event)"
  />
</template>
