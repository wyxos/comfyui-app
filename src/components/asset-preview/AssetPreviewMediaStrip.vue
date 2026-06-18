<script setup lang="ts">
import { ChevronLeft, ChevronRight } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'

import { imageMatchesNsfwBlurLevel } from './assetPreviewHelpers'
import type { PreviewSlide } from './assetPreviewTypes'
import UiCarousel from '../ui/UiCarousel.vue'
import UiPreloadedMedia from '../ui/UiPreloadedMedia.vue'

const props = defineProps<{
  slides: PreviewSlide[]
  activeIndex: number
  blurNsfwMediaLevel?: 4 | 8 | 16 | 32 | null
}>()

const emit = defineEmits<{
  select: [index: number]
}>()

const thumbnailPageSize = 5
const visibleStartIndex = ref(0)
const scrollIndex = computed(() => visibleStartIndex.value)

function pageStartForIndex(index: number) {
  return Math.max(0, Math.floor(index / thumbnailPageSize) * thumbnailPageSize)
}

watch(
  () => props.activeIndex,
  (activeIndex) => {
    if (activeIndex < visibleStartIndex.value || activeIndex >= visibleStartIndex.value + thumbnailPageSize) {
      visibleStartIndex.value = pageStartForIndex(activeIndex)
    }
  },
  { immediate: true },
)

watch(
  () => props.slides.length,
  (count) => {
    const lastPageStart = pageStartForIndex(Math.max(count - 1, 0))
    if (visibleStartIndex.value > lastPageStart) {
      visibleStartIndex.value = lastPageStart
    }
  },
)

function mediaClassFor(slide: PreviewSlide) {
  return imageMatchesNsfwBlurLevel(slide.image, props.blurNsfwMediaLevel)
    ? 'h-full w-full object-contain blur-sm saturate-50'
    : 'h-full w-full object-contain'
}
</script>

<template>
  <section
    v-if="slides.length"
    class="absolute inset-x-0 bottom-0 z-20 flex justify-center border-t border-primary-foreground/10 bg-primary/88 px-4 pb-4 pt-3 backdrop-blur"
  >
    <div class="h-20 w-full max-w-[25rem] sm:h-24 sm:max-w-[30rem]">
      <UiCarousel
        :items="slides"
        :model-value="scrollIndex"
        :show-controls="false"
        :scroll-step="5"
        viewport-test-id="asset-preview-strip-viewport"
        aria-label="Preview media strip"
        item-class="basis-1/5 p-1 h-full"
        @update:model-value="visibleStartIndex = pageStartForIndex($event)"
      >
        <template #item="{ item, index }">
          <button
            data-test="asset-preview-strip-button"
            type="button"
            :aria-label="`Show preview ${index + 1}`"
            :class="[
              'group relative mx-auto block aspect-square h-[calc(100%-0.5rem)] overflow-hidden rounded-md border transition',
              index === activeIndex
                ? 'border-secondary shadow-[0_0_0_1px_rgba(240,200,8,0.45)]'
                : 'border-primary-foreground/12 hover:border-accent/60',
            ]"
            @click="emit('select', index)"
          >
            <UiPreloadedMedia
              :src="item.previewUrl ?? item.url"
              :is-video="item.isVideo"
              :alt="`Preview ${index + 1}`"
              label=""
              :media-class="mediaClassFor(item)"
              loading-class="bg-background/35"
              spinner-class="h-3 w-3"
              :autoplay="item.isVideo"
              :loop="item.isVideo"
              :muted="item.isVideo"
              preload="metadata"
            />
          </button>
        </template>

        <template #footer="{ canScrollPrev, canScrollNext, scrollPrev, scrollNext }">
          <div
            v-if="slides.length > 5"
            class="pointer-events-none absolute -left-12 -right-12 top-1/2 flex -translate-y-1/2 items-center justify-between"
          >
            <button
              data-test="asset-preview-strip-prev"
              type="button"
              class="pointer-events-auto inline-flex h-9 w-9 items-center justify-center rounded-md border border-primary-foreground/12 bg-primary/82 text-primary-foreground shadow-sm transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-45"
              :disabled="!canScrollPrev"
              aria-label="Previous preview thumbnails"
              @click="scrollPrev"
            >
              <ChevronLeft class="h-4 w-4" />
            </button>

            <button
              data-test="asset-preview-strip-next"
              type="button"
              class="pointer-events-auto inline-flex h-9 w-9 items-center justify-center rounded-md border border-primary-foreground/12 bg-primary/82 text-primary-foreground shadow-sm transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-45"
              :disabled="!canScrollNext"
              aria-label="Next preview thumbnails"
              @click="scrollNext"
            >
              <ChevronRight class="h-4 w-4" />
            </button>
          </div>
        </template>
      </UiCarousel>
    </div>
  </section>
</template>
