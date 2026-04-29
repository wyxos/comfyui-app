<script setup lang="ts">
import {
  AlertCircle,
  Ban,
  Check,
  Clock,
  Download,
  ExternalLink,
  Image as ImageIcon,
  LoaderCircle,
  MessageCircle,
  Star,
  UserRound,
} from 'lucide-vue-next'
import UiPaginatedCardGrid from '../../components/ui/UiPaginatedCardGrid.vue'
import UiTooltip from '../../components/ui/UiTooltip.vue'
import { useProvidedAssetsView } from './assetsViewContext'

const {
  loading,
  error,
  searched,
  activeQuery,
  activeUsername,
  openDownloadMenuKey,
  queuingDownloadKey,
  visibleModels,
  hasRenderableState,
  resultSummary,
  currentPage,
  canGoPrevious,
  canGoNext,
  pageCount,
  pageLabel,
  formatNumber,
  firstVersion,
  isVideoPreview,
  thumbnailMediaFor,
  thumbnailFor,
  versionLabel,
  modelVersionLabel,
  creatorLabel,
  favoriteCountFor,
  modelHasNsfw,
  formatFileSize,
  versionsForModel,
  primaryFileForVersion,
  fileSizeFor,
  modelDownloadKey,
  downloadForVersion,
  hasDownloadedVersion,
  activeDownloadForModel,
  downloadStatusLabel,
  downloadButtonLabel,
  canQueueVersion,
  versionDownloadButtonLabel,
  queueAssetDownload,
  handleDownloadClick,
  modelUrl,
  blacklistModel,
  creatorFilterHref,
  goToPage,
  openImageModal,
} = useProvidedAssetsView()
</script>

<template>
  <template v-if="hasRenderableState">
    <section
      v-if="loading && !visibleModels.length"
      data-assets-results-scroll
      class="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6"
      aria-live="polite"
    >
      <div
        class="flex h-full items-center justify-center rounded-md border border-border bg-card text-sm text-card-foreground"
      >
        <LoaderCircle class="mr-2 h-5 w-5 animate-spin text-secondary" />
        Searching Civitai...
      </div>
    </section>

    <section
      v-else-if="error"
      data-assets-results-scroll
      class="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6"
      aria-live="polite"
    >
      <div class="rounded-md border border-destructive/35 bg-destructive/10 p-4 text-sm">
        <div class="flex items-start gap-3">
          <AlertCircle class="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
          <div>
            <p class="font-medium text-card-foreground">Search failed</p>
            <p class="mt-1 text-muted-foreground">
              {{ error }}
            </p>
          </div>
        </div>
      </div>
    </section>

    <section
      v-else-if="searched && !visibleModels.length"
      data-assets-results-scroll
      class="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6"
      aria-live="polite"
    >
      <div class="rounded-md border border-border bg-card p-4 text-sm text-muted-foreground">
        <template v-if="activeUsername">
          No Civitai models found for @{{ activeUsername }}.
        </template>
        <template v-else>
          No Civitai models matched "{{ activeQuery }}".
        </template>
      </div>
    </section>

    <UiPaginatedCardGrid
      v-else
      data-assets-results-scroll
      :items-present="visibleModels.length > 0"
      :range-label="resultSummary || pageLabel"
      :current-page="currentPage"
      :page-count="pageCount"
      :page-text="pageLabel || `Page ${currentPage}`"
      :can-go-previous="canGoPrevious"
      :can-go-next="canGoNext"
      previous-label="Previous Civitai models page"
      next-label="Next Civitai models page"
      content-class="relative min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6"
      grid-class="asset-card-grid grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
      @go-to-page="goToPage"
    >
          <article
            v-for="model in visibleModels"
            :key="model.id"
            class="group flex min-h-[17.5rem] min-w-0 flex-col overflow-hidden rounded-md border border-border bg-card shadow-sm transition hover:-translate-y-0.5 hover:border-accent/70 hover:shadow-[0_18px_50px_rgba(0,0,0,0.22)]"
            :class="{
              'border-secondary/70 shadow-[0_0_0_1px_rgba(255,198,0,0.28)]': hasDownloadedVersion(model),
              'border-accent/70 shadow-[0_0_0_1px_rgba(0,175,255,0.25)]': activeDownloadForModel(model),
            }"
          >
            <div class="relative h-56 shrink-0 border-b border-border bg-muted">
              <button
                class="block h-full w-full disabled:cursor-default"
                type="button"
                :aria-label="thumbnailFor(model) ? `Open ${model.name} image preview` : `${model.name} has no preview available`"
                :disabled="!thumbnailFor(model)"
                @click="openImageModal(model)"
              >
                <div class="flex h-full w-full items-center justify-center overflow-hidden">
                  <video
                    v-if="isVideoPreview(thumbnailMediaFor(model))"
                    class="h-full w-auto max-w-none object-contain transition duration-300 group-hover:scale-[1.03]"
                    :src="thumbnailFor(model) ?? undefined"
                    muted
                    loop
                    autoplay
                    playsinline
                    preload="metadata"
                    :aria-label="`${model.name} video preview`"
                  />
                  <img
                    v-else-if="thumbnailFor(model)"
                    class="h-full w-auto max-w-none object-contain transition duration-300 group-hover:scale-[1.03]"
                    :src="thumbnailFor(model) ?? undefined"
                    :alt="`${model.name} thumbnail`"
                    loading="lazy"
                  />
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
                </div>
              </button>

              <div class="pointer-events-none absolute inset-x-3 top-3 z-10 flex min-w-0 flex-wrap items-center gap-2 text-xs">
                <div class="shrink-0 rounded-sm bg-secondary px-2 py-0.5 font-semibold text-secondary-foreground shadow-sm">
                  {{ model.type }}
                </div>
                <div
                  v-if="modelHasNsfw(model)"
                  class="shrink-0 rounded-sm border border-destructive/50 bg-destructive/90 px-2 py-0.5 font-semibold text-destructive-foreground shadow-sm"
                >
                  NSFW
                </div>
                <UiTooltip :content="creatorLabel(model)">
                  <a
                    v-if="creatorFilterHref(model.creator?.username)"
                    class="pointer-events-auto inline-flex min-w-0 max-w-[8rem] shrink items-center gap-1 rounded-sm border border-primary-foreground/12 bg-primary/82 px-2 py-1 text-primary-foreground/82 shadow-sm backdrop-blur-sm transition hover:border-secondary/60 hover:bg-secondary/15 hover:text-secondary"
                    :href="creatorFilterHref(model.creator?.username)"
                    target="_blank"
                    rel="noopener noreferrer"
                    :aria-label="`Open assets by ${creatorLabel(model)}`"
                  >
                    <UserRound class="h-3.5 w-3.5 shrink-0" />
                    <span class="truncate">{{ creatorLabel(model) }}</span>
                  </a>
                  <span
                    v-else
                    class="pointer-events-auto inline-flex min-w-0 max-w-[8rem] shrink items-center gap-1 rounded-sm border border-primary-foreground/12 bg-primary/82 px-2 py-1 text-primary-foreground/82 shadow-sm backdrop-blur-sm"
                  >
                    <UserRound class="h-3.5 w-3.5 shrink-0" />
                    <span class="truncate">{{ creatorLabel(model) }}</span>
                  </span>
                </UiTooltip>
                <UiTooltip :content="versionLabel(model)">
                  <span class="pointer-events-auto block min-w-0 flex-1 truncate rounded-sm border border-accent/25 bg-primary/82 px-2 py-1 text-accent shadow-sm backdrop-blur-sm">
                    {{ versionLabel(model) }}
                  </span>
                </UiTooltip>
                <span
                  v-if="hasDownloadedVersion(model) || activeDownloadForModel(model)"
                  class="shrink-0 rounded-sm border px-2 py-1 font-semibold shadow-sm backdrop-blur-sm"
                  :class="hasDownloadedVersion(model) ? 'border-secondary/40 bg-secondary/15 text-secondary' : 'border-accent/35 bg-accent/15 text-accent'"
                >
                  {{ hasDownloadedVersion(model) ? 'Downloaded' : downloadStatusLabel(activeDownloadForModel(model)) }}
                </span>
              </div>

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

            <div class="flex min-w-0 flex-col gap-3 p-3">
              <div class="flex items-start justify-between gap-3">
                <a
                  class="line-clamp-2 text-base font-semibold leading-5 tracking-tight text-card-foreground transition hover:text-secondary"
                  :href="modelUrl(model)"
                  target="_blank"
                  rel="noreferrer"
                >
                  {{ model.name }}
                </a>
                <ExternalLink class="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
              </div>

              <div class="relative flex items-center justify-between gap-3 border-t border-border/70 pt-3">
                <div class="min-w-0 text-xs text-muted-foreground">
                  <p class="truncate font-semibold text-card-foreground">
                    {{ firstVersion(model)?.name ?? 'No version' }}
                  </p>
                  <p class="truncate">
                    {{ primaryFileForVersion(firstVersion(model))?.name ?? 'No model file' }}
                  </p>
                </div>

                <div class="flex shrink-0 items-center gap-2">
                  <button
                    class="inline-flex h-9 items-center gap-2 rounded-md border border-destructive/35 bg-destructive/10 px-3 text-xs font-semibold text-destructive transition hover:border-destructive/70 hover:bg-destructive hover:text-destructive-foreground"
                    type="button"
                    :aria-label="`Blacklist ${model.name}`"
                    title="Blacklist model"
                    @click="blacklistModel(model)"
                  >
                    <Ban class="h-4 w-4" />
                    Hide
                  </button>

                  <button
                    class="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-background px-3 text-xs font-semibold text-card-foreground transition hover:border-secondary/60 hover:text-secondary disabled:cursor-not-allowed disabled:opacity-50"
                    type="button"
                    :disabled="!versionsForModel(model).length || Boolean(queuingDownloadKey) || (versionsForModel(model).length === 1 && !canQueueVersion(firstVersion(model)))"
                    @click="handleDownloadClick(model)"
                  >
                    <Check
                      v-if="hasDownloadedVersion(model)"
                      class="h-4 w-4 text-secondary"
                    />
                    <LoaderCircle
                      v-else-if="activeDownloadForModel(model)?.state === 'downloading' || queuingDownloadKey.startsWith(`${model.id}__`)"
                      class="h-4 w-4 animate-spin text-accent"
                    />
                    <Clock
                      v-else-if="activeDownloadForModel(model)?.state === 'queued' || activeDownloadForModel(model)?.state === 'paused'"
                      class="h-4 w-4 text-accent"
                    />
                    <Download
                      v-else
                      class="h-4 w-4"
                    />
                    {{ downloadButtonLabel(model) }}
                  </button>
                </div>

                <div
                  v-if="openDownloadMenuKey === String(model.id)"
                  class="absolute bottom-11 right-0 z-30 w-80 overflow-hidden rounded-md border border-border bg-card text-card-foreground shadow-[0_18px_60px_rgba(0,0,0,0.35)]"
                >
                  <div class="border-b border-border px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Download version
                  </div>
                  <div class="max-h-72 overflow-auto p-1">
                    <button
                      v-for="version in versionsForModel(model)"
                      :key="version.id"
                      class="flex w-full items-start justify-between gap-3 rounded-sm px-3 py-2 text-left text-xs transition hover:bg-accent/10 disabled:cursor-not-allowed disabled:opacity-50"
                      type="button"
                      :disabled="!canQueueVersion(version) || queuingDownloadKey === modelDownloadKey(model, version)"
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
                        <Check
                          v-if="downloadForVersion(version)?.state === 'complete'"
                          class="h-3.5 w-3.5 text-secondary"
                        />
                        <LoaderCircle
                          v-else-if="downloadForVersion(version)?.state === 'downloading' || queuingDownloadKey === modelDownloadKey(model, version)"
                          class="h-3.5 w-3.5 animate-spin text-accent"
                        />
                        <Clock
                          v-else-if="downloadForVersion(version)"
                          class="h-3.5 w-3.5 text-accent"
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
          </article>

      <template #overlay>
        <div
          v-if="loading && visibleModels.length"
          class="absolute inset-0 z-20 flex items-start justify-center bg-background/45 pt-16 text-sm font-semibold text-foreground backdrop-blur-[1px]"
          aria-live="polite"
        >
          <span class="inline-flex items-center rounded-md border border-border bg-card px-4 py-3 shadow-[0_18px_50px_rgba(0,0,0,0.25)]">
            <LoaderCircle class="mr-2 h-5 w-5 animate-spin text-secondary" />
            Refreshing models...
          </span>
        </div>
      </template>
    </UiPaginatedCardGrid>
  </template>
</template>
