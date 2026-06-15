<script setup lang="ts">
import { computed } from 'vue'

import {
  imageNsfwDetectedValue,
  mediaExtensionFromUrl,
  modelVersionLabel,
} from './assetPreviewHelpers'
import type { CivitaiModelVersion, PreviewSlide } from './assetPreviewTypes'
import UiPreloadedMedia from '../ui/UiPreloadedMedia.vue'
import UiSelect from '../ui/UiSelect.vue'

const props = defineProps<{
  modelVersions: CivitaiModelVersion[]
  selectedVersion: CivitaiModelVersion | null
  feedSlides: PreviewSlide[]
  activeSlide: PreviewSlide | null
  blurNsfwContent?: boolean
  feedLoading: boolean
  feedError: string
}>()

const emit = defineEmits<{
  'select-version': [version: CivitaiModelVersion]
  'select-feed-preview': [index: number]
}>()

const selectedVersionId = computed(() => props.selectedVersion ? String(props.selectedVersion.id) : '')
const versionOptions = computed(() =>
  props.modelVersions.map((version) => ({
    label: modelVersionLabel(version),
    value: String(version.id),
  })),
)

function mediaKindLabel(slide: PreviewSlide) {
  if (slide.isVideo) {
    return 'Video'
  }

  return mediaExtensionFromUrl(slide.url) === 'gif' ? 'GIF' : 'Image'
}

function feedItemLabel(index: number) {
  return `Open feed media ${index + 1}`
}

function feedMediaClass(slide: PreviewSlide) {
  return props.blurNsfwContent === true && imageNsfwDetectedValue(slide.image) === true
    ? 'h-full w-full object-cover blur-sm saturate-50'
    : 'h-full w-full object-cover'
}

function selectVersion(versionId: string) {
  const version = props.modelVersions.find((candidate) => String(candidate.id) === versionId)
  if (version) {
    emit('select-version', version)
  }
}
</script>

<template>
  <div class="space-y-4">
    <div
      v-if="modelVersions.length"
      class="space-y-2"
    >
      <UiSelect
        data-test="asset-preview-feed-version-select"
        :model-value="selectedVersionId"
        :options="versionOptions"
        aria-label="Filter feed by model version"
        placeholder="Select version"
        searchable
        search-placeholder="Search versions..."
        @update:model-value="selectVersion"
      />
      <p class="text-xs text-muted-foreground">
        Latest {{ feedSlides.length || 20 }} items for {{ selectedVersion ? modelVersionLabel(selectedVersion) : 'this model version' }}.
      </p>
    </div>

    <p
      v-if="feedError"
      class="rounded-md border border-destructive/35 bg-destructive/10 px-3 py-2 text-xs font-semibold text-destructive"
    >
      {{ feedError }}
    </p>

    <div
      v-if="feedLoading"
      class="rounded-md border border-border bg-background px-3 py-4 text-sm font-semibold text-muted-foreground"
    >
      Loading recent media...
    </div>

    <div
      v-else-if="feedSlides.length"
      data-test="asset-preview-feed-grid"
      class="grid grid-cols-3 gap-2"
    >
      <button
        v-for="(slide, index) in feedSlides"
        :key="slide.key"
        data-test="asset-preview-feed-item"
        type="button"
        :aria-label="feedItemLabel(index)"
        :class="[
          'group relative aspect-square overflow-hidden rounded-md border bg-background transition',
          slide.key === activeSlide?.key
            ? 'border-secondary shadow-[0_0_0_1px_rgba(240,200,8,0.35)]'
            : 'border-border hover:border-accent/50',
        ]"
        @click="emit('select-feed-preview', index)"
      >
        <UiPreloadedMedia
          :src="slide.url"
          :is-video="slide.isVideo"
          :alt="`Feed preview ${index + 1}`"
          label=""
          :media-class="feedMediaClass(slide)"
          loading-class="bg-background/35"
          spinner-class="h-3 w-3"
          :autoplay="slide.isVideo"
          :loop="slide.isVideo"
          :muted="slide.isVideo"
          preload="metadata"
        />
        <span class="sr-only">{{ mediaKindLabel(slide) }} {{ index + 1 }}</span>
      </button>
    </div>

    <div
      v-else
      class="rounded-md border border-border bg-background px-3 py-4 text-sm font-semibold text-muted-foreground"
    >
      No feed media available for this model version.
    </div>
  </div>
</template>
