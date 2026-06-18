<script setup lang="ts">
import { Image as ImageIcon, LoaderCircle } from 'lucide-vue-next'
import UiPreloadedMedia from './UiPreloadedMedia.vue'

withDefaults(
  defineProps<{
    tag?: 'article' | 'button'
    previewUrl?: string | null
    isVideoPreview?: boolean
    previewLabel?: string
    title?: string
    ariaLabel?: string
    minHeightClass?: string
    cardClass?: string
    mediaClass?: string
    mediaContentClass?: string
    bodyClass?: string
    loading?: boolean
    loadingLabel?: string
  }>(),
  {
    tag: 'article',
    previewUrl: '',
    isVideoPreview: false,
    previewLabel: 'Preview image',
    title: '',
    ariaLabel: '',
    minHeightClass: 'min-h-[18rem]',
    cardClass: '',
    mediaClass: 'h-44',
    mediaContentClass: '',
    bodyClass: 'p-3',
    loading: false,
    loadingLabel: 'Loading preview image...',
  },
)

const emit = defineEmits<{
  click: [event: MouseEvent]
}>()
</script>

<template>
  <component
    :is="tag"
    :type="tag === 'button' ? 'button' : undefined"
    :aria-label="ariaLabel || undefined"
    :title="title || undefined"
    :class="[
      'group flex min-w-0 flex-col overflow-hidden rounded-md border border-border bg-card shadow-sm transition hover:-translate-y-0.5 hover:border-accent/70 hover:shadow-[0_18px_50px_rgba(0,0,0,0.22)]',
      minHeightClass,
      tag === 'button' ? 'text-left focus:outline-none focus:ring-2 focus:ring-ring/25' : '',
      cardClass,
    ]"
    @click="emit('click', $event)"
  >
    <div :class="['relative shrink-0 border-b border-border bg-muted', mediaClass]">
      <div class="flex h-full w-full items-center justify-center overflow-hidden">
        <UiPreloadedMedia
          v-if="previewUrl"
          :src="previewUrl"
          :is-video="isVideoPreview"
          :alt="previewLabel"
          :label="isVideoPreview ? 'Loading preview video...' : 'Loading preview image...'"
          :media-class="[
            'h-full w-auto max-w-none object-contain transition duration-300 group-hover:scale-[1.03]',
            mediaContentClass,
          ].filter(Boolean).join(' ')"
          loading-class="bg-muted text-muted-foreground"
          muted
          loop
          autoplay
          playsinline
          preload="metadata"
          :aria-label="isVideoPreview ? previewLabel : undefined"
          :loading="isVideoPreview ? undefined : 'lazy'"
        />
        <div
          v-else-if="loading"
          class="flex h-full w-full flex-col items-center justify-center gap-2 bg-muted px-4 text-center text-muted-foreground"
          role="status"
          aria-live="polite"
        >
          <LoaderCircle class="h-7 w-7 animate-spin text-secondary" />
          <span class="text-xs font-semibold uppercase tracking-[0.16em]">
            {{ loadingLabel }}
          </span>
        </div>
        <div
          v-else
          class="flex h-full w-full flex-col items-center justify-center gap-2 bg-primary/70 px-4 text-center text-primary-foreground/58"
        >
          <slot name="placeholder">
            <ImageIcon class="h-8 w-8 text-primary-foreground/35" />
            <span class="text-xs font-semibold uppercase tracking-[0.16em] text-primary-foreground/68">
              No preview available
            </span>
          </slot>
        </div>
      </div>

      <slot name="media-overlay" />
    </div>

    <div :class="['flex min-w-0 flex-1 flex-col gap-2', bodyClass]">
      <slot />
    </div>
  </component>
</template>
