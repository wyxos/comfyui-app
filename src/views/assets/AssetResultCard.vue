<script setup lang="ts">
import { ref } from 'vue'
import {
  Ban,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  ExternalLink,
  Image as ImageIcon,
  LoaderCircle,
  MessageCircle,
  Star,
  UserRound,
} from 'lucide-vue-next'
import UiTooltip from '../../components/ui/UiTooltip.vue'
import { imageNsfwDetectedValue, imagesForVersion } from './assetModelHelpers'
import { useProvidedAssetsView } from './assetsViewContext'
import type { CivitaiModel } from './assetViewTypes'
import { useAssetDownloadMenuPlacement } from './useAssetDownloadMenuPlacement'

defineProps<{
  model: CivitaiModel
}>()

const {
  openDownloadMenuKey,
  formatNumber,
  firstVersion,
  isVideoPreview,
  thumbnailMediaFor,
  versionLabel,
  modelVersionLabel,
  creatorLabel,
  favoriteCountFor,
  modelHasNsfw,
  formatFileSize,
  versionsForModel,
  primaryFileForVersion,
  fileSizeFor,
  downloadForVersion,
  hasDownloadedVersion,
  activeDownloadForModel,
  downloadStatusLabel,
  downloadButtonLabel,
  canQueueVersion,
  versionDownloadButtonLabel,
  isModelDownloadQueuing,
  isVersionQueuing,
  queueAssetDownload,
  queueMissingVersionsForModel,
  queueableMissingVersionsForModel,
  handleDownloadClick,
  modelUrl,
  blurNsfwContent,
  blacklistModel,
  creatorFilterHref,
  openImageModal,
} = useProvidedAssetsView()

const cardPreviewImageIndexes = ref<Record<number, number>>({})
const cardPreviewMediaReady = ref<Record<string, boolean>>({})
const {
  downloadMenuPlacementFor,
  handleDownloadButtonClick,
  setDownloadButtonRef,
  setDownloadMenuRef,
} = useAssetDownloadMenuPlacement(openDownloadMenuKey, handleDownloadClick)

function previewImagesForModel(model: CivitaiModel) {
  const version = firstVersion(model)
  return version ? imagesForVersion(version) : []
}
function previewCountForModel(model: CivitaiModel) {
  return previewImagesForModel(model).length
}
function activePreviewImageIndex(model: CivitaiModel) {
  const total = previewCountForModel(model)
  if (total < 1) {
    return 0
  }

  const index = cardPreviewImageIndexes.value[model.id] ?? 0
  return ((index % total) + total) % total
}
function activePreviewMediaFor(model: CivitaiModel) {
  return previewImagesForModel(model)[activePreviewImageIndex(model)] ?? thumbnailMediaFor(model)
}
function activePreviewUrlFor(model: CivitaiModel) {
  return activePreviewMediaFor(model)?.url ?? null
}
function previewMediaReadyKey(model: CivitaiModel, url = activePreviewUrlFor(model)) {
  return url ? `${model.id}:${url}` : ''
}
function isActivePreviewMediaReady(model: CivitaiModel) {
  const key = previewMediaReadyKey(model)
  return !key || cardPreviewMediaReady.value[key] === true
}
function mediaUrlFromEvent(event: Event) {
  const target = event.currentTarget
  if (target instanceof HTMLImageElement || target instanceof HTMLVideoElement) {
    return target.currentSrc || target.src
  }

  return ''
}
function markPreviewMediaReady(model: CivitaiModel, event: Event) {
  const key = previewMediaReadyKey(model, mediaUrlFromEvent(event) || activePreviewUrlFor(model))
  if (!key || cardPreviewMediaReady.value[key]) {
    return
  }

  cardPreviewMediaReady.value = {
    ...cardPreviewMediaReady.value,
    [key]: true,
  }
}
function showPreviewImage(model: CivitaiModel, step: number) {
  const total = previewCountForModel(model)
  if (total < 2) {
    return
  }

  cardPreviewImageIndexes.value = {
    ...cardPreviewImageIndexes.value,
    [model.id]: activePreviewImageIndex(model) + step,
  }
}
function openActiveImageModal(model: CivitaiModel) {
  openImageModal(model, activePreviewImageIndex(model))
}
function handleCardAltClick(model: CivitaiModel, event: MouseEvent) {
  if (!event.altKey || event.button !== 0) {
    return
  }

  event.preventDefault()
  event.stopPropagation()
  void handleDownloadClick(model)
}
function handleCardAltContextMenu(model: CivitaiModel, event: MouseEvent) {
  if (!event.altKey) {
    return
  }

  event.preventDefault()
  event.stopPropagation()
  blacklistModel(model)
}
function shouldBlurNsfwPreview(model: CivitaiModel) {
  return blurNsfwContent?.value === true && imageNsfwDetectedValue(activePreviewMediaFor(model)) === true
}

function shouldBlurNsfwTitle(model: CivitaiModel) {
  return blurNsfwContent?.value === true && modelHasNsfw(model)
}
</script>

<template>
  <article
    class="group relative flex min-h-[17.5rem] min-w-0 flex-col overflow-visible rounded-md border border-border bg-card shadow-sm transition hover:-translate-y-0.5 hover:border-accent/70 hover:shadow-[0_18px_50px_rgba(0,0,0,0.22)]"
    :class="{
      'z-10': openDownloadMenuKey === String(model.id),
      'border-success/70 shadow-[0_0_0_1px_rgba(52,211,153,0.28)]': hasDownloadedVersion(model),
      'border-secondary/70 shadow-[0_0_0_1px_rgba(255,198,0,0.28)]': !hasDownloadedVersion(model) && activeDownloadForModel(model)?.state === 'queued',
      'border-accent/70 shadow-[0_0_0_1px_rgba(0,175,255,0.25)]': !hasDownloadedVersion(model) && activeDownloadForModel(model) && activeDownloadForModel(model)?.state !== 'queued',
    }"
    @click.capture="handleCardAltClick(model, $event)"
    @contextmenu.capture="handleCardAltContextMenu(model, $event)"
  >
    <div
      class="relative h-56 shrink-0 border-b border-border bg-muted"
      data-asset-card-media
    >
      <button
        class="block h-full w-full disabled:cursor-default"
        type="button"
        :aria-label="activePreviewUrlFor(model) ? `Open ${model.name} image preview` : `${model.name} has no preview available`"
        :disabled="!activePreviewUrlFor(model)"
        @click="openActiveImageModal(model)"
      >
        <div class="relative flex h-full w-full items-center justify-center overflow-hidden">
          <video
            v-if="isVideoPreview(activePreviewMediaFor(model))"
            :key="activePreviewUrlFor(model) ?? undefined"
            class="h-full w-auto max-w-none object-contain transition duration-300 group-hover:scale-[1.03]"
            :class="[
              isActivePreviewMediaReady(model) ? 'opacity-100' : 'opacity-0',
              shouldBlurNsfwPreview(model) ? 'scale-110 blur-sm saturate-50' : '',
            ]"
            :style="{ opacity: isActivePreviewMediaReady(model) ? 1 : 0 }"
            :src="activePreviewUrlFor(model) ?? undefined"
            muted
            loop
            autoplay
            playsinline
            preload="metadata"
            :aria-label="`${model.name} video preview`"
            @loadedmetadata="markPreviewMediaReady(model, $event)"
            @error="markPreviewMediaReady(model, $event)"
          />
          <img
            v-else-if="activePreviewUrlFor(model)"
            :key="activePreviewUrlFor(model) ?? undefined"
            class="h-full w-auto max-w-none object-contain transition duration-300 group-hover:scale-[1.03]"
            :class="[
              isActivePreviewMediaReady(model) ? 'opacity-100' : 'opacity-0',
              shouldBlurNsfwPreview(model) ? 'scale-110 blur-sm saturate-50' : '',
            ]"
            :style="{ opacity: isActivePreviewMediaReady(model) ? 1 : 0 }"
            :src="activePreviewUrlFor(model) ?? undefined"
            :alt="`${model.name} thumbnail`"
            loading="eager"
            decoding="async"
            @load="markPreviewMediaReady(model, $event)"
            @error="markPreviewMediaReady(model, $event)"
          >
          <div
            v-else
            class="flex h-full w-full flex-col items-center justify-center gap-2 bg-primary/70 px-4 text-center text-primary-foreground/58"
          >
            <ImageIcon class="h-8 w-8 text-primary-foreground/35" />
            <span class="text-xs font-semibold uppercase tracking-[0.16em] text-primary-foreground/68">
              No preview available
            </span>
            <span class="max-w-44 text-xs leading-5 text-primary-foreground/45">
              This model has no Civitai preview images.
            </span>
          </div>
          <div
            v-if="activePreviewUrlFor(model) && !isActivePreviewMediaReady(model)"
            class="absolute inset-0 z-10 flex items-center justify-center bg-muted text-secondary"
            data-asset-card-media-spinner
            aria-live="polite"
          >
            <LoaderCircle class="h-6 w-6 animate-spin" />
            <span class="sr-only">Loading preview image</span>
          </div>
        </div>
      </button>

      <div
        v-if="previewCountForModel(model) > 1"
        class="pointer-events-none absolute inset-x-3 top-1/2 z-20 flex -translate-y-1/2 items-center justify-between"
      >
        <button
          class="pointer-events-auto inline-flex h-8 w-8 items-center justify-center rounded-md border border-primary-foreground/10 bg-primary/72 text-primary-foreground shadow-sm backdrop-blur-sm transition hover:bg-secondary hover:text-secondary-foreground focus:outline-none focus:ring-2 focus:ring-ring/35"
          type="button"
          :aria-label="`Previous preview image for ${model.name}`"
          @click.stop.prevent="showPreviewImage(model, -1)"
        >
          <ChevronLeft class="h-4 w-4" />
        </button>
        <button
          class="pointer-events-auto inline-flex h-8 w-8 items-center justify-center rounded-md border border-primary-foreground/10 bg-primary/72 text-primary-foreground shadow-sm backdrop-blur-sm transition hover:bg-secondary hover:text-secondary-foreground focus:outline-none focus:ring-2 focus:ring-ring/35"
          type="button"
          :aria-label="`Next preview image for ${model.name}`"
          @click.stop.prevent="showPreviewImage(model, 1)"
        >
          <ChevronRight class="h-4 w-4" />
        </button>
      </div>

      <span
        v-if="previewCountForModel(model) > 1"
        class="pointer-events-none absolute bottom-12 left-1/2 z-20 -translate-x-1/2 rounded-md border border-primary-foreground/10 bg-primary/82 px-2 py-1 text-[11px] font-semibold text-primary-foreground shadow-sm backdrop-blur-sm"
      >
        {{ activePreviewImageIndex(model) + 1 }} / {{ previewCountForModel(model) }}
      </span>

      <dl class="pointer-events-none absolute inset-x-3 bottom-3 z-10 grid grid-cols-3 gap-1.5 text-[11px]">
        <div class="flex min-w-0 items-center justify-center gap-1.5 rounded-md border border-primary-foreground/10 bg-primary/85 px-1.5 py-1 text-primary-foreground shadow-sm backdrop-blur-sm">
          <dt class="text-primary-foreground/65">
            <span class="sr-only">Downloads</span>
            <Download class="h-3 w-3" />
          </dt>
          <dd class="min-w-0 truncate font-semibold">
            {{ formatNumber(model.stats?.downloadCount) }}
          </dd>
        </div>
        <div class="flex min-w-0 items-center justify-center gap-1.5 rounded-md border border-primary-foreground/10 bg-primary/85 px-1.5 py-1 text-primary-foreground shadow-sm backdrop-blur-sm">
          <dt class="text-primary-foreground/65">
            <span class="sr-only">Likes</span>
            <Star class="h-3 w-3" />
          </dt>
          <dd class="min-w-0 truncate font-semibold">
            {{ formatNumber(favoriteCountFor(model)) }}
          </dd>
        </div>
        <div class="flex min-w-0 items-center justify-center gap-1.5 rounded-md border border-primary-foreground/10 bg-primary/85 px-1.5 py-1 text-primary-foreground shadow-sm backdrop-blur-sm">
          <dt class="text-primary-foreground/65">
            <span class="sr-only">Comments</span>
            <MessageCircle class="h-3 w-3" />
          </dt>
          <dd class="min-w-0 truncate font-semibold">
            {{ formatNumber(model.stats?.commentCount) }}
          </dd>
        </div>
      </dl>
    </div>

    <div
      class="flex min-w-0 flex-col gap-3 p-3"
      data-asset-card-body
    >
      <div
        class="flex min-w-0 items-start justify-between gap-2"
        data-asset-card-title-row
      >
        <UiTooltip
          class="min-w-0 flex-1"
          :content="model.name"
        >
          <a
            class="block min-w-0 truncate text-base font-semibold leading-5 tracking-tight text-card-foreground transition hover:text-secondary"
            :class="shouldBlurNsfwTitle(model) ? 'blur-sm select-none' : ''"
            data-asset-card-title-link
            :href="modelUrl(model)"
            target="_blank"
            rel="noreferrer"
          >
            {{ model.name }}
          </a>
        </UiTooltip>
        <div
          class="relative flex shrink-0 items-center gap-1.5"
          data-asset-card-header-actions
        >
          <a
            class="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition hover:border-secondary/60 hover:text-secondary focus:outline-none focus:ring-2 focus:ring-ring/35"
            data-asset-card-open-link
            :href="modelUrl(model)"
            target="_blank"
            rel="noreferrer"
            :aria-label="`Open ${model.name} on Civitai`"
            :title="`Open ${model.name} on Civitai`"
          >
            <ExternalLink class="h-4 w-4" />
          </a>
          <button
            class="inline-flex h-8 w-8 items-center justify-center rounded-md border border-destructive/35 bg-destructive/10 text-destructive transition hover:border-destructive/70 hover:bg-destructive hover:text-destructive-foreground focus:outline-none focus:ring-2 focus:ring-destructive/35"
            type="button"
            data-asset-card-hide-button
            :aria-label="`Hide ${model.name}`"
            :title="`Hide ${model.name}`"
            @click="blacklistModel(model)"
          >
            <Ban class="h-4 w-4" />
          </button>

          <button
            :ref="(element) => setDownloadButtonRef(model.id, element)"
            class="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background text-card-foreground transition hover:border-secondary/60 hover:text-secondary focus:outline-none focus:ring-2 focus:ring-ring/35 disabled:cursor-not-allowed disabled:opacity-50"
            type="button"
            data-asset-card-download-button
            :disabled="!versionsForModel(model).length || (versionsForModel(model).length === 1 && (!canQueueVersion(firstVersion(model)) || isModelDownloadQueuing(model)))"
            :aria-label="`${downloadButtonLabel(model)} for ${model.name}`"
            :title="downloadButtonLabel(model)"
            @click="handleDownloadButtonClick(model)"
          >
            <Check v-if="hasDownloadedVersion(model)" class="h-4 w-4 text-success" />
            <LoaderCircle v-else-if="activeDownloadForModel(model)?.state === 'downloading' || isModelDownloadQueuing(model)" class="h-4 w-4 animate-spin text-accent" />
            <Clock v-else-if="activeDownloadForModel(model)?.state === 'queued'" class="h-4 w-4 text-secondary" />
            <Clock v-else-if="activeDownloadForModel(model)?.state === 'paused'" class="h-4 w-4 text-accent" />
            <Download v-else class="h-4 w-4" />
          </button>

          <div
            v-if="openDownloadMenuKey === String(model.id)"
            :ref="(element) => setDownloadMenuRef(model.id, element)"
            class="absolute right-0 z-30 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-md border border-border bg-card text-card-foreground shadow-[0_18px_60px_rgba(0,0,0,0.35)]"
            :class="downloadMenuPlacementFor(model) === 'up' ? 'bottom-9' : 'top-9'"
            :data-placement="downloadMenuPlacementFor(model)"
            data-asset-card-download-menu
          >
            <div class="flex items-center justify-between gap-3 border-b border-border px-3 py-2">
              <span class="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Download version
              </span>
              <button
                class="inline-flex h-7 items-center gap-1 rounded-sm border border-secondary/35 bg-secondary/10 px-2 text-xs font-semibold text-secondary transition hover:border-secondary hover:bg-secondary hover:text-secondary-foreground disabled:cursor-not-allowed disabled:opacity-50"
                type="button"
                :disabled="!queueableMissingVersionsForModel(model).length || isModelDownloadQueuing(model)"
                @click="queueMissingVersionsForModel(model)"
              >
                <LoaderCircle v-if="isModelDownloadQueuing(model)" class="h-3.5 w-3.5 animate-spin" />
                <Download v-else class="h-3.5 w-3.5" />
                Queue all
              </button>
            </div>
            <div class="max-h-72 overflow-auto p-1">
              <button
                v-for="version in versionsForModel(model)"
                :key="version.id"
                class="flex w-full items-start justify-between gap-3 rounded-sm px-3 py-2 text-left text-xs transition hover:bg-accent/10 disabled:cursor-not-allowed disabled:opacity-50"
                type="button"
                :disabled="!canQueueVersion(version) || isVersionQueuing(model, version)"
                @click="queueAssetDownload(model, version)"
              >
                <span class="min-w-0">
                  <span class="block truncate font-semibold text-card-foreground">
                    {{ modelVersionLabel(version) }}
                  </span>
                  <span class="mt-1 block truncate text-muted-foreground">
                    {{ primaryFileForVersion(version)?.name ?? 'No model file' }}
                    <template v-if="fileSizeFor(primaryFileForVersion(version))">
                      · {{ formatFileSize(fileSizeFor(primaryFileForVersion(version))) }}
                    </template>
                  </span>
                </span>
                <span class="inline-flex shrink-0 items-center gap-1 rounded-sm border border-border px-2 py-0.5 font-semibold text-muted-foreground">
                  <Check v-if="downloadForVersion(version)?.state === 'complete'" class="h-3.5 w-3.5 text-success" />
                  <LoaderCircle v-else-if="downloadForVersion(version)?.state === 'downloading' || isVersionQueuing(model, version)" class="h-3.5 w-3.5 animate-spin text-accent" />
                  <Clock
                    v-else-if="downloadForVersion(version)"
                    class="h-3.5 w-3.5"
                    :class="downloadForVersion(version)?.state === 'queued' ? 'text-secondary' : 'text-accent'"
                  />
                  {{
                    downloadForVersion(version)?.state === 'complete'
                      ? 'Re-download'
                      : versionDownloadButtonLabel(version)
                  }}
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div
        class="flex min-w-0 flex-nowrap items-center gap-1.5 overflow-hidden text-[11px]"
        data-asset-card-badges
      >
        <div
          class="shrink-0 rounded-sm bg-secondary px-2 py-0.5 font-semibold text-secondary-foreground"
          :title="model.type"
        >
          {{ model.type }}
        </div>
        <div
          v-if="modelHasNsfw(model)"
          class="shrink-0 rounded-sm border border-destructive/50 bg-destructive/90 px-2 py-0.5 font-semibold text-destructive-foreground"
        >
          NSFW
        </div>
        <UiTooltip
          class="min-w-0 max-w-[8rem] shrink"
          :content="creatorLabel(model)"
        >
          <a
            v-if="creatorFilterHref(model.creator?.username)"
            class="inline-flex min-w-0 max-w-full shrink items-center gap-1 truncate rounded-sm border border-border bg-background px-2 py-1 text-muted-foreground transition hover:border-secondary/60 hover:text-secondary"
            data-asset-card-creator-badge
            :href="creatorFilterHref(model.creator?.username)"
            target="_blank"
            rel="noopener noreferrer"
            :aria-label="`Open assets by ${creatorLabel(model)}`"
            :title="creatorLabel(model)"
          >
            <UserRound class="h-3.5 w-3.5 shrink-0" />
            <span class="truncate">{{ creatorLabel(model) }}</span>
          </a>
          <span
            v-else
            class="inline-flex min-w-0 max-w-full shrink items-center gap-1 truncate rounded-sm border border-border bg-background px-2 py-1 text-muted-foreground"
            data-asset-card-creator-badge
            :title="creatorLabel(model)"
          >
            <UserRound class="h-3.5 w-3.5 shrink-0" />
            <span class="truncate">{{ creatorLabel(model) }}</span>
          </span>
        </UiTooltip>
        <UiTooltip
          class="min-w-0 flex-1"
          :content="versionLabel(model)"
        >
          <span
            class="block min-w-0 max-w-full truncate rounded-sm border border-accent/25 bg-accent/10 px-2 py-1 text-accent"
            data-asset-card-version-badge
            :title="versionLabel(model)"
          >
            {{ versionLabel(model) }}
          </span>
        </UiTooltip>
        <span
          v-if="hasDownloadedVersion(model) || activeDownloadForModel(model)"
          class="shrink-0 rounded-sm border px-2 py-1 font-semibold"
          :class="hasDownloadedVersion(model) ? 'border-success/40 bg-success/15 text-success' : activeDownloadForModel(model)?.state === 'queued' ? 'border-secondary/40 bg-secondary/15 text-secondary' : 'border-accent/35 bg-accent/15 text-accent'"
        >
          {{ hasDownloadedVersion(model) ? 'Downloaded' : downloadStatusLabel(activeDownloadForModel(model)) }}
        </span>
      </div>
    </div>
  </article>
</template>
