<script setup lang="ts">
import { ref } from 'vue'
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  FileDown,
} from 'lucide-vue-next'
import {
  imageMatchesNsfwBlurLevel,
  imageNsfwDetectedValue,
  isVideoUrl,
} from '../../components/asset-preview/assetPreviewHelpers'
import UiPreviewCard from '../../components/ui/UiPreviewCard.vue'
import {
  modelHasNsfw,
  modelTypeLabel,
  previewMatchesNsfwBlurLevel,
  previewFor,
  type LibraryModelItem,
  type LibraryPreviewPath,
} from './libraryModelHelpers'

const props = withDefaults(defineProps<{
  item: LibraryModelItem
  blurNsfwModels?: boolean
  blurNsfwMediaLevel?: 4 | 8 | 16 | 32 | null
}>(), {
  blurNsfwModels: false,
  blurNsfwMediaLevel: null,
})

defineEmits<{
  open: [item: LibraryModelItem]
  restore: [item: LibraryModelItem]
}>()

const cardPreviewIndexes = ref<Record<string, number>>({})

function previewPathsForItem(item: LibraryModelItem): LibraryPreviewPath[] {
  const paths = (item.previewPaths ?? []).filter((preview) => Boolean(preview.url))
  if (paths.length) {
    const previewUrl = previewFor(item)
    return previewUrl ? [{ ...paths[0], url: previewUrl }, ...paths.slice(1)] : paths
  }

  const fallbackPreviewUrl = previewFor(item)
  return fallbackPreviewUrl
    ? [{ url: fallbackPreviewUrl, mediaType: isVideoUrl(fallbackPreviewUrl) ? 'video' : 'image' }]
    : []
}

function previewCount() {
  return previewPathsForItem(props.item).length
}

function activePreviewIndex() {
  const total = previewCount()
  if (total < 1) {
    return 0
  }

  const key = String(props.item.id)
  const index = cardPreviewIndexes.value[key] ?? 0
  return ((index % total) + total) % total
}

function activePreviewPath() {
  return previewPathsForItem(props.item)[activePreviewIndex()] ?? null
}

function activePreviewUrl() {
  return activePreviewPath()?.url ?? previewFor(props.item)
}

function isActiveVideoPreview() {
  const preview = activePreviewPath()
  return preview
    ? preview.mediaType === 'video' || preview.type === 'video' || isVideoUrl(preview.url)
    : false
}

function showPreviewImage(step: number) {
  if (previewCount() < 2) {
    return
  }

  const key = String(props.item.id)
  cardPreviewIndexes.value = {
    ...cardPreviewIndexes.value,
    [key]: activePreviewIndex() + step,
  }
}

function shouldBlurNsfwPreview() {
  const preview = activePreviewPath()
  if (imageNsfwDetectedValue(preview) !== null) {
    return imageMatchesNsfwBlurLevel(preview, props.blurNsfwMediaLevel)
  }

  return previewMatchesNsfwBlurLevel(props.item, props.blurNsfwMediaLevel)
}

function shouldBlurNsfwTitle() {
  return props.blurNsfwModels && modelHasNsfw(props.item)
}
</script>

<template>
  <UiPreviewCard
    tag="article"
    :aria-label="`Open ${item.modelName} preview`"
    :preview-url="activePreviewUrl()"
    :is-video-preview="isActiveVideoPreview()"
    :preview-label="`${item.modelName} preview`"
    :title="item.modelName"
    min-height-class="min-h-[20rem]"
    media-class="h-64"
    :media-content-class="shouldBlurNsfwPreview() ? 'scale-110 blur-sm saturate-50' : ''"
    :loading="item.previewBackfillPending === true"
    loading-label="Loading preview image..."
    @click="item.librarySource === 'hidden' ? undefined : $emit('open', item)"
  >
    <template #placeholder>
      <FileDown class="h-8 w-8 text-primary-foreground/35" />
      <span class="text-xs font-semibold uppercase tracking-[0.16em] text-primary-foreground/68">
        No preview available
      </span>
    </template>

    <template #media-overlay>
      <div
        v-if="previewCount() > 1"
        class="pointer-events-none absolute inset-x-3 top-1/2 z-20 flex -translate-y-1/2 items-center justify-between"
      >
        <button
          class="pointer-events-auto inline-flex h-8 w-8 items-center justify-center rounded-md border border-primary-foreground/10 bg-primary/72 text-primary-foreground shadow-sm backdrop-blur-sm transition hover:bg-secondary hover:text-secondary-foreground focus:outline-none focus:ring-2 focus:ring-ring/35"
          type="button"
          :aria-label="`Previous preview image for ${item.modelName}`"
          data-library-card-preview-previous
          @click.stop.prevent="showPreviewImage(-1)"
        >
          <ChevronLeft class="h-4 w-4" />
        </button>
        <button
          class="pointer-events-auto inline-flex h-8 w-8 items-center justify-center rounded-md border border-primary-foreground/10 bg-primary/72 text-primary-foreground shadow-sm backdrop-blur-sm transition hover:bg-secondary hover:text-secondary-foreground focus:outline-none focus:ring-2 focus:ring-ring/35"
          type="button"
          :aria-label="`Next preview image for ${item.modelName}`"
          data-library-card-preview-next
          @click.stop.prevent="showPreviewImage(1)"
        >
          <ChevronRight class="h-4 w-4" />
        </button>
      </div>

      <span
        v-if="previewCount() > 1"
        class="pointer-events-none absolute bottom-3 left-1/2 z-20 -translate-x-1/2 rounded-md border border-primary-foreground/10 bg-primary/82 px-2 py-1 text-[11px] font-semibold text-primary-foreground shadow-sm backdrop-blur-sm"
        data-library-card-preview-count
      >
        {{ activePreviewIndex() + 1 }} / {{ previewCount() }}
      </span>

      <div class="absolute right-3 top-3 flex flex-wrap justify-end gap-2">
        <span
          v-if="item.librarySource === 'watched'"
          class="rounded-sm border border-secondary/45 bg-secondary/90 px-2 py-1 text-[11px] font-semibold text-secondary-foreground shadow-sm backdrop-blur-sm"
        >
          Watching
        </span>
        <span
          v-if="item.librarySource === 'hidden'"
          class="rounded-sm border border-accent/45 bg-accent/90 px-2 py-1 text-[11px] font-semibold text-accent-foreground shadow-sm backdrop-blur-sm"
        >
          Hidden
        </span>
        <span
          v-if="modelHasNsfw(item)"
          class="rounded-sm border border-destructive/50 bg-destructive/90 px-2 py-1 text-[11px] font-semibold text-destructive-foreground shadow-sm backdrop-blur-sm"
        >
          NSFW
        </span>
        <span class="rounded-sm border border-primary-foreground/12 bg-primary/85 px-2 py-1 text-[11px] font-semibold text-primary-foreground/82 shadow-sm backdrop-blur-sm">
          {{ modelTypeLabel(item) }}
        </span>
      </div>
    </template>

    <div class="flex min-w-0 items-start justify-between gap-2">
      <h2
        class="min-w-0 truncate text-sm font-semibold leading-5 text-card-foreground"
        :class="shouldBlurNsfwTitle() ? 'blur-sm select-none' : ''"
        data-library-card-title
        :title="item.modelName"
      >
        {{ item.modelName }}
      </h2>
      <button
        v-if="item.librarySource === 'hidden'"
        class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-secondary/35 bg-secondary/10 text-secondary transition hover:border-secondary hover:bg-secondary hover:text-secondary-foreground focus:outline-none focus:ring-2 focus:ring-ring/35"
        type="button"
        :aria-label="`Show ${item.modelName}`"
        :title="`Show ${item.modelName}`"
        @click.stop="$emit('restore', item)"
      >
        <Eye class="h-4 w-4" />
      </button>
    </div>

    <button
      v-if="item.librarySource === 'hidden'"
      class="mt-auto inline-flex h-8 items-center justify-center rounded-md border border-border bg-background px-3 text-xs font-semibold text-card-foreground transition hover:border-secondary/60 hover:text-secondary focus:outline-none focus:ring-2 focus:ring-ring/25"
      type="button"
      :aria-label="`Open ${item.modelName} preview`"
      @click="$emit('open', item)"
    >
      Open preview
    </button>
  </UiPreviewCard>
</template>
