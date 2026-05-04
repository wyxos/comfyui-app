<script setup lang="ts">
import {
  ChevronLeft,
  ChevronRight,
  Minus,
  Plus,
  RotateCcw,
  X,
} from 'lucide-vue-next'
import { useProvidedHomeView } from './homeViewContext'

const {
  activePreviewIndex,
  isPreviewModalOpen,
  previewModalScale,
  isPreviewModalDragging,
  previewModalViewport,
  previewModalPanField,
  selectedPreviewItem,
  selectedPreviewOutput,
  previewModalOutputItems,
  canNavigatePreviewModal,
  previewModalOutputCounter,
  isPreviewModalPannable,
  previewModalImageStyle,
  previewModalPanStyle,
  setPreviewModalPreviewIndex,
  closePreviewModal,
  stepPreviewModal,
  zoomPreviewModal,
  resetPreviewModalZoom,
  handlePreviewModalWheel,
  handlePreviewModalPointerDown,
  handlePreviewModalPointerMove,
  stopPreviewModalPointerTracking,
  openGeneratedOutputContextMenu,
} = useProvidedHomeView()

void [previewModalViewport, previewModalPanField]
</script>

<template>
  <Teleport to="body">
    <div
      v-if="isPreviewModalOpen && selectedPreviewOutput"
      class="fixed inset-0 z-[90] bg-primary/92 backdrop-blur-sm"
    >
      <div
        ref="previewModalViewport"
        class="relative h-full w-full overflow-hidden text-primary-foreground"
        :class="
          isPreviewModalPannable
            ? isPreviewModalDragging
              ? 'cursor-grabbing touch-none'
              : 'cursor-grab touch-none'
            : 'cursor-default'
        "
        @click.self="closePreviewModal"
        @wheel.prevent="handlePreviewModalWheel"
        @pointerdown="handlePreviewModalPointerDown"
        @pointermove="handlePreviewModalPointerMove"
        @pointerup="stopPreviewModalPointerTracking"
        @pointercancel="stopPreviewModalPointerTracking"
        @lostpointercapture="stopPreviewModalPointerTracking"
      >
        <div class="pointer-events-none absolute inset-x-0 top-0 z-20 bg-gradient-to-b from-primary/96 via-primary/84 to-transparent p-4 sm:p-6">
          <div class="flex items-start justify-between gap-4">
            <div class="min-w-0 rounded-md border border-primary-foreground/12 bg-primary/70 px-3 py-2 shadow-sm backdrop-blur-sm">
              <div class="flex items-center gap-2">
                <p class="truncate text-sm font-semibold">
                  {{ selectedPreviewItem?.variantLabel ?? 'Generation preview' }}
                </p>
                <span
                  v-if="previewModalOutputCounter"
                  class="rounded-sm border border-primary-foreground/12 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-primary-foreground/72"
                >
                  {{ previewModalOutputCounter }}
                </span>
              </div>
              <p class="truncate text-xs text-primary-foreground/62">
                {{ selectedPreviewOutput.filename }}
              </p>
            </div>

            <div class="pointer-events-auto flex items-center gap-2">
              <button
                data-preview-modal-control="true"
                type="button"
                class="inline-flex h-10 w-10 items-center justify-center rounded-md border border-primary-foreground/12 bg-primary/70 text-primary-foreground shadow-sm backdrop-blur-sm transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-45"
                :disabled="previewModalScale <= 1"
                @click="zoomPreviewModal(-1)"
              >
                <Minus class="h-4 w-4" />
              </button>

              <button
                data-preview-modal-control="true"
                type="button"
                class="inline-flex h-10 items-center justify-center rounded-md border border-primary-foreground/12 bg-primary/70 px-3 text-xs font-semibold uppercase tracking-[0.12em] text-primary-foreground shadow-sm backdrop-blur-sm transition hover:border-accent hover:text-accent"
                @click="resetPreviewModalZoom"
              >
                <RotateCcw class="mr-2 h-4 w-4" />
                {{ Math.round(previewModalScale * 100) }}%
              </button>

              <button
                data-preview-modal-control="true"
                type="button"
                class="inline-flex h-10 w-10 items-center justify-center rounded-md border border-primary-foreground/12 bg-primary/70 text-primary-foreground shadow-sm backdrop-blur-sm transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-45"
                :disabled="previewModalScale >= 4"
                @click="zoomPreviewModal(1)"
              >
                <Plus class="h-4 w-4" />
              </button>

              <button
                data-preview-modal-control="true"
                type="button"
                class="inline-flex h-10 w-10 items-center justify-center rounded-md border border-primary-foreground/12 bg-primary/70 text-primary-foreground shadow-sm backdrop-blur-sm transition hover:border-accent hover:text-accent"
                @click="closePreviewModal"
              >
                <X class="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        <div
          v-if="canNavigatePreviewModal"
          class="pointer-events-none absolute inset-y-0 left-0 right-0 z-20 flex items-center justify-between p-4 sm:p-6"
        >
          <button
            data-preview-modal-control="true"
            type="button"
            class="pointer-events-auto inline-flex h-12 w-12 items-center justify-center rounded-full border border-primary-foreground/12 bg-primary/70 text-primary-foreground shadow-sm backdrop-blur-sm transition hover:border-accent hover:text-accent"
            @click="stepPreviewModal(-1)"
          >
            <ChevronLeft class="h-5 w-5" />
          </button>

          <button
            data-preview-modal-control="true"
            type="button"
            class="pointer-events-auto inline-flex h-12 w-12 items-center justify-center rounded-full border border-primary-foreground/12 bg-primary/70 text-primary-foreground shadow-sm backdrop-blur-sm transition hover:border-accent hover:text-accent"
            @click="stepPreviewModal(1)"
          >
            <ChevronRight class="h-5 w-5" />
          </button>
        </div>

        <div class="flex h-full w-full items-center justify-center overflow-hidden p-4 sm:p-6">
          <div
            ref="previewModalPanField"
            class="will-change-transform"
            :style="previewModalPanStyle"
          >
            <img
              :src="selectedPreviewOutput.url"
              :alt="selectedPreviewItem?.variantLabel ?? 'Generation preview'"
              class="block max-h-[100vh] max-w-[100vw] select-none object-contain transition-transform duration-150 ease-out"
              :style="previewModalImageStyle"
              draggable="false"
              @contextmenu="openGeneratedOutputContextMenu($event, selectedPreviewOutput, selectedPreviewItem?.checkpointName ?? null)"
            />
          </div>
        </div>

        <div
          v-if="canNavigatePreviewModal"
          class="pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-primary/96 via-primary/84 to-transparent p-4 sm:p-6"
        >
          <div class="pointer-events-auto mx-auto flex max-w-full gap-3 overflow-x-auto pb-1">
            <button
              v-for="entry in previewModalOutputItems"
              :key="entry.item?.key ?? entry.index"
              data-preview-modal-control="true"
              type="button"
              class="w-24 shrink-0 rounded-md border bg-primary/72 p-2 text-left shadow-sm backdrop-blur-sm transition"
              :class="
                entry.index === activePreviewIndex
                  ? 'border-secondary ring-1 ring-secondary/80'
                  : 'border-primary-foreground/12 hover:border-accent hover:text-accent'
              "
              @click="setPreviewModalPreviewIndex(entry.index, true)"
            >
              <div class="aspect-square overflow-hidden rounded-sm bg-primary-foreground/8">
                <img
                  v-if="entry.item?.output"
                  :src="entry.item.output.url"
                  :alt="entry.item.variantLabel ?? `Preview ${entry.index + 1}`"
                  class="h-full w-full object-cover"
                  draggable="false"
                  @contextmenu="openGeneratedOutputContextMenu($event, entry.item.output, entry.item.checkpointName)"
                />
              </div>

              <p class="mt-2 truncate text-[11px] font-semibold text-primary-foreground">
                {{ entry.item?.variantLabel ?? `Output ${entry.index + 1}` }}
              </p>
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
