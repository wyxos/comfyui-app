<script setup lang="ts">
import { ChevronLeft, ChevronRight, Image as ImageIcon } from 'lucide-vue-next'
import { computed } from 'vue'
import UiPreviewCard from '../../components/ui/UiPreviewCard.vue'
import type { AssetPickerOption, AssetPickerPreviewMedia } from './homeAssetPickerOptionHelpers'
import { optionHasVideoPreview } from './homeAssetPickerOptionHelpers'

const props = defineProps<{
  option: AssetPickerOption
  previewMedia: AssetPickerPreviewMedia | null
  previewIndex: number
  previewCount: number
  baseModelLabel: string
  hasNsfw: boolean
}>()

const emit = defineEmits<{
  select: []
  showPreview: [step: number]
}>()

const activePreviewUrl = computed(() => props.previewMedia?.url ?? '')
const isVideoPreview = computed(() => optionHasVideoPreview(props.previewMedia))
const titleLabel = computed(() =>
  props.option.value !== props.option.label
    ? `${props.option.label}\n${props.option.value}`
    : props.option.label,
)
</script>

<template>
  <UiPreviewCard
    tag="article"
    data-asset-picker-card
    min-height-class="min-h-[20rem]"
    media-class="h-64"
    card-class="relative focus-within:ring-2 focus-within:ring-ring/25"
    :preview-url="activePreviewUrl"
    :is-video-preview="isVideoPreview"
    :preview-label="`${option.label} preview`"
    :title="titleLabel"
  >
    <template #placeholder>
      <ImageIcon
        class="h-8 w-8 text-primary-foreground/35 transition group-hover:text-accent"
        :stroke-width="1.6"
      />
      <span class="text-xs font-semibold uppercase tracking-[0.16em] text-primary-foreground/68">
        No preview available
      </span>
    </template>

    <template #media-overlay>
      <div class="pointer-events-none absolute right-3 top-3 z-20 flex flex-wrap justify-end gap-2">
        <span
          v-if="hasNsfw"
          class="rounded-sm border border-destructive/50 bg-destructive/90 px-2 py-1 text-[11px] font-semibold text-destructive-foreground shadow-sm backdrop-blur-sm"
        >
          NSFW
        </span>
        <span
          v-if="baseModelLabel"
          class="rounded-sm border border-primary-foreground/12 bg-primary/85 px-2 py-1 text-[11px] font-semibold text-primary-foreground/82 shadow-sm backdrop-blur-sm"
        >
          {{ baseModelLabel }}
        </span>
      </div>

      <div
        v-if="previewCount > 1"
        class="pointer-events-none absolute inset-x-3 top-1/2 z-30 flex -translate-y-1/2 items-center justify-between"
      >
        <button
          class="pointer-events-auto inline-flex h-8 w-8 items-center justify-center rounded-md border border-primary-foreground/10 bg-primary/72 text-primary-foreground shadow-sm backdrop-blur-sm transition hover:bg-secondary hover:text-secondary-foreground focus:outline-none focus:ring-2 focus:ring-ring/35"
          type="button"
          :aria-label="`Previous preview image for ${option.label}`"
          @click.stop.prevent="emit('showPreview', -1)"
        >
          <ChevronLeft class="h-4 w-4" />
        </button>
        <button
          class="pointer-events-auto inline-flex h-8 w-8 items-center justify-center rounded-md border border-primary-foreground/10 bg-primary/72 text-primary-foreground shadow-sm backdrop-blur-sm transition hover:bg-secondary hover:text-secondary-foreground focus:outline-none focus:ring-2 focus:ring-ring/35"
          type="button"
          :aria-label="`Next preview image for ${option.label}`"
          @click.stop.prevent="emit('showPreview', 1)"
        >
          <ChevronRight class="h-4 w-4" />
        </button>
      </div>

      <span
        v-if="previewCount > 1"
        class="pointer-events-none absolute bottom-3 left-1/2 z-30 -translate-x-1/2 rounded-md border border-primary-foreground/10 bg-primary/82 px-2 py-1 text-[11px] font-semibold text-primary-foreground shadow-sm backdrop-blur-sm"
      >
        {{ previewIndex + 1 }} / {{ previewCount }}
      </span>
    </template>

    <button
      class="absolute inset-0 z-10 rounded-md text-left focus:outline-none focus:ring-2 focus:ring-ring/35"
      type="button"
      :aria-label="option.label"
      @click="emit('select')"
    >
      <span class="sr-only">{{ option.label }}</span>
    </button>

    <h3
      class="pointer-events-none relative z-20 truncate text-sm font-semibold leading-5 text-card-foreground transition group-hover:text-secondary"
      :title="option.label"
    >
      {{ option.label }}
    </h3>
  </UiPreviewCard>
</template>
