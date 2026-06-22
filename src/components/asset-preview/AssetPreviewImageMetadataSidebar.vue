<script setup lang="ts">
import { computed } from 'vue'

import {
  imageDimensions as formatImageDimensions,
  mediaExtensionFromUrl,
} from './assetPreviewHelpers'
import AssetPreviewImageMetadataSection from './AssetPreviewImageMetadataSection.vue'
import AssetPreviewImageSafetyEditor from './AssetPreviewImageSafetyEditor.vue'
import type { CivitaiImage, NormalizedMetaRow, PreviewSlide } from './assetPreviewTypes'

const props = defineProps<{
  activeImageIndex: number
  activeSlide: PreviewSlide | null
  activeImage: CivitaiImage | null
  activeImageSafetyKey: string
  activeImageDetectedNsfw: boolean | null
  activeImageNsfwOverride: boolean | null
  activeImageSafetyLabel: string
  previewSlides: PreviewSlide[]
  editableSafety: boolean
  savingImageSafety: boolean
  imageSafetyError: string
  imageMetaLoading: boolean
  imageMetaError: string
  activeImageMeta: string
  normalizedImageMetaRows: NormalizedMetaRow[]
  activeImageMetaSource: Record<string, unknown> | null
  retryImageMetadata: () => void
  applyGenerationMetadata?: (metadata: Record<string, unknown>) => void | Promise<void>
  imageDimensions: typeof formatImageDimensions
}>()

const emit = defineEmits<{
  'save-image-safety': [payload: { imageKey: string; imageNsfw: boolean | null; imageNsfwOverride: boolean | null }]
  applied: []
}>()

const hasActiveImage = computed(() => Boolean(props.activeImage))

function mediaKindLabel(slide: PreviewSlide | null) {
  if (!slide) {
    return 'Unknown'
  }

  if (slide.isVideo) {
    return 'Video'
  }

  return mediaExtensionFromUrl(slide.url) === 'gif' ? 'GIF' : 'Image'
}

function mediaSourceLabel(slide: PreviewSlide | null) {
  if (slide?.source === 'archive') {
    return 'Offline archive'
  }

  return slide?.source === 'civitai' ? 'Civitai API' : 'Local preview file'
}
</script>

<template>
  <aside
    class="min-h-0 min-w-0 overflow-y-auto overflow-x-hidden border-l border-border bg-card p-5"
    data-test="asset-preview-image-metadata-sidebar"
  >
    <div class="min-w-0 space-y-5">
      <section class="min-w-0 space-y-3">
        <div class="min-w-0">
          <p class="text-xs font-semibold uppercase tracking-[0.22em] text-secondary">
            Image metadata
          </p>
          <p class="mt-2 text-sm font-semibold text-card-foreground">
            {{ previewSlides.length ? `${activeImageIndex + 1} of ${previewSlides.length}` : 'No image selected' }}
          </p>
        </div>

        <dl
          class="min-w-0 overflow-hidden rounded-md border border-border bg-background text-sm divide-y divide-border/70"
          data-test="asset-preview-media-detail-group"
        >
          <div class="px-3 py-2.5">
            <dt class="text-xs uppercase tracking-[0.14em] text-muted-foreground">Source</dt>
            <dd class="mt-1 font-semibold text-card-foreground">
              {{ mediaSourceLabel(activeSlide) }}
            </dd>
          </div>
          <div class="px-3 py-2.5">
            <dt class="text-xs uppercase tracking-[0.14em] text-muted-foreground">Type</dt>
            <dd class="mt-1 font-semibold text-card-foreground">
              {{ mediaKindLabel(activeSlide) }}
            </dd>
          </div>
          <div class="px-3 py-2.5">
            <dt class="text-xs uppercase tracking-[0.14em] text-muted-foreground">Dimensions</dt>
            <dd class="mt-1 font-semibold text-card-foreground">{{ imageDimensions(activeImage) }}</dd>
          </div>
          <div class="px-3 py-2.5">
            <dt class="text-xs uppercase tracking-[0.14em] text-muted-foreground">NSFW level</dt>
            <dd class="mt-1 font-semibold text-card-foreground">{{ activeImageSafetyLabel }}</dd>
          </div>
          <div
            v-if="activeImage?.id"
            class="px-3 py-2.5"
          >
            <dt class="text-xs uppercase tracking-[0.14em] text-muted-foreground">Image ID</dt>
            <dd class="mt-1 break-all font-mono text-xs text-card-foreground">{{ activeImage.id }}</dd>
          </div>
          <div
            v-if="activeImage?.hash"
            class="px-3 py-2.5"
          >
            <dt class="text-xs uppercase tracking-[0.14em] text-muted-foreground">Hash</dt>
            <dd class="mt-1 break-all font-mono text-xs text-card-foreground">{{ activeImage.hash }}</dd>
          </div>
        </dl>
      </section>

      <AssetPreviewImageSafetyEditor
        :editable="editableSafety"
        :image-key="activeImageSafetyKey"
        :detected-nsfw="activeImageDetectedNsfw"
        :override-nsfw="activeImageNsfwOverride"
        :error="imageSafetyError"
        :saving="savingImageSafety"
        @save="emit('save-image-safety', $event)"
      />

      <AssetPreviewImageMetadataSection
        :loading="imageMetaLoading"
        :error="imageMetaError"
        :metadata-text="activeImageMeta"
        :rows="normalizedImageMetaRows"
        :metadata-source="activeImageMetaSource"
        :can-retry="hasActiveImage"
        :show-empty="hasActiveImage"
        :show-action="false"
        :apply-generation-metadata="applyGenerationMetadata"
        @retry="retryImageMetadata"
        @applied="emit('applied')"
      />
    </div>
  </aside>
</template>
