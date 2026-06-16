<script setup lang="ts">
import {
  Eye,
  FileDown,
} from 'lucide-vue-next'
import UiPreviewCard from '../../components/ui/UiPreviewCard.vue'
import {
  isVideoPreview,
  modelHasNsfw,
  modelTypeLabel,
  previewMatchesNsfwBlurLevel,
  previewFor,
  type LibraryModelItem,
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

function shouldBlurNsfwPreview() {
  return previewMatchesNsfwBlurLevel(props.item, props.blurNsfwMediaLevel)
}

function shouldBlurNsfwTitle() {
  return props.blurNsfwModels && modelHasNsfw(props.item)
}
</script>

<template>
  <UiPreviewCard
    :tag="item.librarySource === 'hidden' ? 'article' : 'button'"
    :aria-label="`Open ${item.modelName} preview`"
    :preview-url="previewFor(item)"
    :is-video-preview="isVideoPreview(item)"
    :preview-label="`${item.modelName} preview`"
    :title="item.modelName"
    min-height-class="min-h-[20rem]"
    media-class="h-64"
    :media-content-class="shouldBlurNsfwPreview() ? 'scale-110 blur-sm saturate-50' : ''"
    @click="item.librarySource === 'hidden' ? undefined : $emit('open', item)"
  >
    <template #placeholder>
      <FileDown class="h-8 w-8 text-primary-foreground/35" />
      <span class="text-xs font-semibold uppercase tracking-[0.16em] text-primary-foreground/68">
        No preview available
      </span>
    </template>

    <template #media-overlay>
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
