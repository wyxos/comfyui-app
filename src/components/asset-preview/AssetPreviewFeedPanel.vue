<script setup lang="ts">
import { computed } from 'vue'

import {
  imageMatchesNsfwBlurLevel,
  mediaExtensionFromUrl,
  modelVersionLabel,
} from './assetPreviewHelpers'
import AssetPreviewAtlasReactionWidget from './AssetPreviewAtlasReactionWidget.vue'
import { atlasFileUrlForStatus, atlasMediaKey, type AtlasReactionType } from './assetPreviewAtlasMedia'
import type { CivitaiModelVersion, PreviewSlide } from './assetPreviewTypes'
import UiPreloadedMedia from '../ui/UiPreloadedMedia.vue'
import UiSelect from '../ui/UiSelect.vue'

const props = defineProps<{
  modelVersions: CivitaiModelVersion[]
  selectedVersion: CivitaiModelVersion | null
  feedSlides: PreviewSlide[]
  activeSlide: PreviewSlide | null
  blurNsfwMediaLevel?: 4 | 8 | 16 | 32 | null
  feedLoading: boolean
  feedLoadingMore: boolean
  feedError: string
  atlasBaseUrl: string
  atlasActionError: string
  atlasDeletePendingKey: string
  atlasReactionPendingKey: string
  atlasConfigured: boolean
  canLoadMoreFeed: boolean
}>()

const emit = defineEmits<{
  'select-version': [version: CivitaiModelVersion]
  'select-feed-preview': [index: number]
  'load-more': []
  retry: []
  'atlas-react': [index: number, type: AtlasReactionType]
  'atlas-delete': [index: number]
}>()

const selectedVersionId = computed(() => props.selectedVersion ? String(props.selectedVersion.id) : '')
const versionOptions = computed(() =>
  props.modelVersions.map((version) => ({
    label: modelVersionLabel(version),
    value: String(version.id),
  })),
)
const feedSummaryLabel = computed(() => {
  const versionLabel = props.selectedVersion ? modelVersionLabel(props.selectedVersion) : 'this model version'
  return props.feedSlides.length
    ? `Showing ${props.feedSlides.length} newest items for ${versionLabel}.`
    : `Newest media for ${versionLabel}.`
})

function mediaKindLabel(slide: PreviewSlide) {
  if (slide.isVideo) {
    return 'Video'
  }

  return mediaExtensionFromUrl(slide.url) === 'gif' ? 'GIF' : 'Image'
}

function feedItemLabel(index: number) {
  return `Open feed media ${index + 1}`
}

function atlasBadgeLabel(slide: PreviewSlide) {
  const status = slide.image?.atlasStatus
  if (!status) {
    return ''
  }

  if (status.downloaded) {
    return 'Downloaded'
  }

  if (status.reaction) {
    return 'Reacted'
  }

  return status.exists ? 'In Atlas' : ''
}

function canReactInAtlas(slide: PreviewSlide) {
  return props.atlasConfigured && Boolean(slide.image?.url && slide.image.id)
}

function isAtlasPending(slide: PreviewSlide) {
  return slide.image ? props.atlasReactionPendingKey === atlasMediaKey(slide.image) : false
}

function isAtlasDeletePending(slide: PreviewSlide) {
  return slide.image ? props.atlasDeletePendingKey === atlasMediaKey(slide.image) : false
}

function atlasFileUrl(slide: PreviewSlide) {
  return atlasFileUrlForStatus(slide.image?.atlasStatus, props.atlasBaseUrl)
}

function feedMediaClass(slide: PreviewSlide) {
  return imageMatchesNsfwBlurLevel(slide.image, props.blurNsfwMediaLevel)
    ? 'h-full w-full object-cover blur-sm saturate-50'
    : 'h-full w-full object-cover'
}

function selectVersion(versionId: string) {
  const version = props.modelVersions.find((candidate) => String(candidate.id) === versionId)
  if (version) {
    emit('select-version', version)
  }
}

function reactToSlide(index: number, type: AtlasReactionType) {
  const slide = props.feedSlides[index]
  if (slide && canReactInAtlas(slide)) {
    emit('atlas-react', index, type)
  }
}

function deleteSlide(index: number) {
  const slide = props.feedSlides[index]
  if (slide && canReactInAtlas(slide)) {
    emit('atlas-delete', index)
  }
}

function handleFeedClick(event: MouseEvent, index: number) {
  if (event.altKey && event.button === 0) {
    event.preventDefault()
    event.stopPropagation()
    reactToSlide(index, 'love')
    return
  }

  emit('select-feed-preview', index)
}

function handleFeedMouseDown(event: MouseEvent, index: number) {
  if (!event.altKey || event.button !== 1) {
    return
  }

  event.preventDefault()
  event.stopPropagation()
  reactToSlide(index, 'like')
}

function handleFeedContextMenu(event: MouseEvent, index: number) {
  if (!event.altKey) {
    return
  }

  event.preventDefault()
  event.stopPropagation()
  reactToSlide(index, 'blacklist')
}

function handleFeedAuxClick(event: MouseEvent, slide: PreviewSlide) {
  if (event.button !== 1 || event.altKey || !slide.url) {
    return
  }

  event.preventDefault()
  event.stopPropagation()
  window.open(slide.url, '_blank', 'noopener,noreferrer')
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
        {{ feedSummaryLabel }}
      </p>
    </div>

    <div
      v-if="feedError"
      class="space-y-2 rounded-md border border-destructive/35 bg-destructive/10 px-3 py-2 text-xs font-semibold text-destructive"
    >
      <p>{{ feedError }}</p>
      <button
        type="button"
        data-test="asset-preview-feed-retry"
        class="inline-flex h-8 items-center justify-center rounded-md border border-destructive/35 bg-background px-3 text-xs font-semibold text-card-foreground transition hover:border-secondary/60 hover:text-secondary focus:outline-none focus:ring-2 focus:ring-ring/25 disabled:cursor-wait disabled:opacity-60"
        :disabled="feedLoading || feedLoadingMore"
        @click="emit('retry')"
      >
        Retry
      </button>
    </div>
    <p
      v-if="atlasActionError"
      class="rounded-md border border-destructive/35 bg-destructive/10 px-3 py-2 text-xs font-semibold text-destructive"
      data-test="asset-preview-feed-atlas-error"
    >
      {{ atlasActionError }}
    </p>

    <div
      v-if="feedLoading"
      class="rounded-md border border-border bg-background px-3 py-4 text-sm font-semibold text-muted-foreground"
    >
      Loading recent media...
    </div>

    <div
      v-else-if="feedSlides.length"
      class="space-y-3"
    >
      <div
        data-test="asset-preview-feed-grid"
        class="grid grid-cols-3 gap-2"
      >
        <div
          v-for="(slide, index) in feedSlides"
          :key="slide.key"
          class="space-y-1.5"
        >
          <div
            data-test="asset-preview-feed-item"
            :class="[
              'group relative aspect-square overflow-hidden rounded-md border bg-background transition',
              slide.key === activeSlide?.key
                ? 'border-secondary shadow-[0_0_0_1px_rgba(240,200,8,0.35)]'
                : 'border-border hover:border-accent/50',
            ]"
            @click="handleFeedClick($event, index)"
            @mousedown="handleFeedMouseDown($event, index)"
            @contextmenu="handleFeedContextMenu($event, index)"
            @auxclick="handleFeedAuxClick($event, slide)"
          >
            <button
              type="button"
              data-test="asset-preview-feed-shortcut-target"
              class="absolute inset-0 h-full w-full"
              :aria-label="feedItemLabel(index)"
            >
              <UiPreloadedMedia
                :src="slide.previewUrl ?? slide.url"
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
            <span
              v-if="atlasBadgeLabel(slide)"
              data-test="asset-preview-feed-atlas-badge"
              class="absolute left-1.5 top-1.5 rounded-sm border border-black/20 bg-secondary px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-secondary-foreground shadow-sm"
            >
              {{ atlasBadgeLabel(slide) }}
            </span>
          </div>
          <AssetPreviewAtlasReactionWidget
            v-if="canReactInAtlas(slide)"
            data-test="asset-preview-feed-atlas-reactions"
            class="w-full"
            :status="slide.image?.atlasStatus ?? null"
            :pending="isAtlasPending(slide)"
            :deleting="isAtlasDeletePending(slide)"
            :atlas-file-url="atlasFileUrl(slide)"
            compact
            @react="(type) => reactToSlide(index, type)"
            @delete="deleteSlide(index)"
          />
        </div>
      </div>

      <button
        v-if="canLoadMoreFeed"
        data-test="asset-preview-feed-load-more"
        type="button"
        class="inline-flex h-9 w-full items-center justify-center rounded-md border border-border bg-background px-3 text-xs font-semibold text-card-foreground transition hover:border-secondary/60 hover:text-secondary focus:outline-none focus:ring-2 focus:ring-ring/25 disabled:cursor-wait disabled:opacity-60"
        :disabled="feedLoadingMore"
        @click="emit('load-more')"
      >
        {{ feedLoadingMore ? 'Loading more...' : 'Load more' }}
      </button>
    </div>

    <div
      v-else-if="!feedError"
      class="rounded-md border border-border bg-background px-3 py-4 text-sm font-semibold text-muted-foreground"
    >
      No feed media available for this model version.
    </div>
  </div>
</template>
