<script setup lang="ts">
import { computed } from 'vue'

import { imageNsfwDetectedValue } from './assetPreviewHelpers'
import type { PreviewSlide } from './assetPreviewTypes'
import UiCarousel from '../ui/UiCarousel.vue'
import UiPreloadedMedia from '../ui/UiPreloadedMedia.vue'

const props = defineProps<{
  slides: PreviewSlide[]
  activeIndex: number
  blurNsfwContent?: boolean
}>()

const emit = defineEmits<{
  select: [index: number]
}>()

const scrollIndex = computed(() => {
  const lastFiveUpStart = Math.max(props.slides.length - 5, 0)
  return Math.min(props.activeIndex, lastFiveUpStart)
})

function mediaClassFor(slide: PreviewSlide) {
  return props.blurNsfwContent === true && imageNsfwDetectedValue(slide.image) === true
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
        aria-label="Preview media strip"
        item-class="basis-1/5 p-1 h-full"
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
              :src="item.url"
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
      </UiCarousel>
    </div>
  </section>
</template>
