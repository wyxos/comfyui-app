<script setup lang="ts" generic="T">
import { ref, watch } from 'vue'
import emblaCarouselVue from 'embla-carousel-vue'
import { ChevronLeft, ChevronRight } from 'lucide-vue-next'

const props = withDefaults(
  defineProps<{
    items: T[]
    modelValue?: number
    ariaLabel?: string
    itemClass?: string
    showControls?: boolean
    scrollStep?: number
    viewportTestId?: string
  }>(),
  {
    modelValue: 0,
    ariaLabel: 'Carousel',
    itemClass: 'basis-full h-full',
    showControls: true,
    scrollStep: 1,
    viewportTestId: '',
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: number]
}>()

defineSlots<{
  item(props: { item: T; index: number }): unknown
  footer(props: {
    canScrollPrev: boolean
    canScrollNext: boolean
    scrollPrev: () => void
    scrollNext: () => void
  }): unknown
}>()

const [viewportRef, emblaApi] = emblaCarouselVue({
  loop: false,
  align: 'start',
})
void viewportRef

const canScrollPrev = ref(false)
const canScrollNext = ref(false)

function syncScrollState() {
  canScrollPrev.value = emblaApi.value?.canScrollPrev() ?? false
  canScrollNext.value = emblaApi.value?.canScrollNext() ?? false
}

function syncSelectedIndex() {
  const index = emblaApi.value?.selectedScrollSnap() ?? 0
  syncScrollState()
  emit('update:modelValue', index)
}

function scrollPrev() {
  const api = emblaApi.value
  if (!api) {
    return
  }

  if (props.scrollStep <= 1) {
    api.scrollPrev()
    return
  }

  api.scrollTo(api.selectedScrollSnap() - props.scrollStep)
}

function scrollNext() {
  const api = emblaApi.value
  if (!api) {
    return
  }

  if (props.scrollStep <= 1) {
    api.scrollNext()
    return
  }

  api.scrollTo(api.selectedScrollSnap() + props.scrollStep)
}

watch(
  emblaApi,
  (api, previousApi) => {
    previousApi?.off('select', syncSelectedIndex)
    previousApi?.off('reInit', syncSelectedIndex)
    previousApi?.off('settle', syncSelectedIndex)

    if (!api) {
      canScrollPrev.value = false
      canScrollNext.value = false
      return
    }

    api.on('select', syncSelectedIndex)
    api.on('reInit', syncSelectedIndex)
    api.on('settle', syncSelectedIndex)
    api.reInit()
    api.scrollTo(props.modelValue, true)
    syncSelectedIndex()
  },
  { immediate: true },
)

watch(
  () => props.modelValue,
  (value) => {
    if (typeof value !== 'number') {
      return
    }

    const api = emblaApi.value
    if (!api || api.selectedScrollSnap() === value) {
      syncScrollState()
      return
    }

    api.scrollTo(value, true)
    syncScrollState()
  },
)

watch(
  () => props.items.length,
  () => {
    const api = emblaApi.value
    if (!api) {
      canScrollPrev.value = false
      canScrollNext.value = false
      return
    }

    api.reInit()
    api.scrollTo(Math.min(props.modelValue, Math.max(props.items.length - 1, 0)), true)
    syncSelectedIndex()
  },
)
</script>

<template>
  <div class="relative h-full w-full" :aria-label="ariaLabel">
    <div
      ref="viewportRef"
      class="h-full overflow-hidden"
      :data-test="viewportTestId || undefined"
    >
      <div class="flex h-full">
        <div
          v-for="(item, index) in items"
          :key="index"
          data-test="carousel-item"
          :class="['min-w-0 shrink-0 grow-0', props.itemClass]"
        >
          <slot name="item" :item="item" :index="index" />
        </div>
      </div>
    </div>

    <div
      v-if="showControls && items.length > 1"
      class="pointer-events-none absolute inset-x-0 top-1/2 flex -translate-y-1/2 items-center justify-between px-3"
    >
      <button
        type="button"
        class="pointer-events-auto inline-flex h-10 w-10 items-center justify-center rounded-md border border-primary-foreground/12 bg-primary/82 text-primary-foreground shadow-sm transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-45"
        :disabled="!canScrollPrev"
        @click="scrollPrev"
      >
        <ChevronLeft class="h-4 w-4" />
      </button>

      <button
        type="button"
        class="pointer-events-auto inline-flex h-10 w-10 items-center justify-center rounded-md border border-primary-foreground/12 bg-primary/82 text-primary-foreground shadow-sm transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-45"
        :disabled="!canScrollNext"
        @click="scrollNext"
      >
        <ChevronRight class="h-4 w-4" />
      </button>
    </div>

    <slot
      name="footer"
      :can-scroll-prev="canScrollPrev"
      :can-scroll-next="canScrollNext"
      :scroll-prev="scrollPrev"
      :scroll-next="scrollNext"
    />
  </div>
</template>
