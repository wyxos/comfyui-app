<script setup lang="ts">
import { Image as ImageIcon } from 'lucide-vue-next'
import UiCarousel from '../../components/ui/UiCarousel.vue'
import { useProvidedHomeView } from './homeViewContext'

const {
  jobState,
  statusLine,
  detailLine,
  progressPercent,
  activePreviewIndex,
  errorMessage,
  previewDisplayItems,
  hasPreviewItems,
  hasMultiplePreviewOutputs,
  selectedPreviewItem,
  selectedGenerationInputImageSnapshot,
  selectedPreviewOutput,
  imageUrl,
  previewOutputCounter,
  shouldShowStandalonePreviewStatus,
  previewStatusItems,
  previewStatusTitle,
  previewStatusSummaryLine,
  getPreviewPlaceholderStatus,
  getPreviewPlaceholderProgressPercent,
  shouldShowPreviewPlaceholderIndeterminate,
  getPreviewPlaceholderBarClass,
  openPreviewModal,
  openGeneratedOutputContextMenu,
} = useProvidedHomeView()
</script>

<template>
      <aside class="flex min-h-0 min-w-0 flex-col bg-primary px-4 py-4 text-primary-foreground sm:px-6">
        <div class="flex min-h-0 flex-1 overflow-hidden">
          <div class="flex h-full min-h-0 w-full flex-col overflow-hidden">
            <div class="relative min-h-0 flex-1 overflow-hidden rounded-md border border-primary-foreground/12 bg-primary-foreground/8 shadow-[0_22px_70px_rgba(0,0,0,0.28)]">
              <template v-if="hasPreviewItems">
                <UiCarousel
                  v-if="hasMultiplePreviewOutputs"
                  v-model="activePreviewIndex"
                  :items="previewDisplayItems"
                  aria-label="Generated outputs"
                >
                  <template #item="{ item, index }">
                    <button
                      v-if="item.output"
                      type="button"
                      class="flex h-full w-full cursor-zoom-in items-center justify-center"
                      @click="openPreviewModal(index)"
                      @contextmenu="openGeneratedOutputContextMenu($event, item.output, item.checkpointName)"
                    >
                      <img
                        :src="item.output.url"
                        :alt="item.variantLabel ?? 'Generation preview'"
                        class="block h-full max-w-full object-contain"
                      />
                    </button>

                    <div
                      v-else
                      class="flex h-full w-full items-center justify-center p-6 text-primary-foreground/72"
                    >
                      <div class="rounded-md border border-primary-foreground/12 bg-primary/72 p-4 shadow-sm backdrop-blur-sm">
                        <ImageIcon class="h-14 w-14" :stroke-width="1.6" />
                      </div>
                    </div>
                  </template>
                </UiCarousel>

                <button
                  v-else-if="selectedPreviewOutput"
                  type="button"
                  class="flex h-full w-full cursor-zoom-in items-center justify-center"
                  @click="openPreviewModal()"
                  @contextmenu="openGeneratedOutputContextMenu($event, selectedPreviewOutput, selectedPreviewItem?.checkpointName ?? null)"
                >
                  <img
                    :src="imageUrl ?? ''"
                    alt="Generation preview"
                    class="block h-full max-w-full object-contain"
                  />
                </button>

                <div
                  v-else-if="selectedPreviewItem"
                  class="flex h-full w-full items-center justify-center p-6 text-primary-foreground/72"
                >
                  <div class="rounded-md border border-primary-foreground/12 bg-primary/72 p-4 shadow-sm backdrop-blur-sm">
                    <ImageIcon class="h-14 w-14" :stroke-width="1.6" />
                  </div>
                </div>

                <div class="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between gap-3 p-3">
                  <span
                    v-if="selectedPreviewItem?.variantLabel"
                    class="rounded-md border border-primary-foreground/12 bg-primary/82 px-3 py-1 text-xs font-semibold text-primary-foreground shadow-sm"
                  >
                    {{ selectedPreviewItem.variantLabel }}
                  </span>

                  <span
                    v-if="previewOutputCounter"
                    class="ml-auto rounded-md border border-primary-foreground/12 bg-primary/82 px-3 py-1 text-xs font-semibold text-primary-foreground shadow-sm"
                  >
                    {{ previewOutputCounter }}
                  </span>
                </div>

                <div
                  v-if="selectedGenerationInputImageSnapshot"
                  class="pointer-events-none absolute bottom-3 left-3 z-10"
                >
                  <div class="flex h-[300px] w-[300px] items-center justify-center overflow-hidden rounded-md border border-primary-foreground/12 bg-primary/82 shadow-lg backdrop-blur-sm">
                    <img
                      data-testid="generation-input-preview"
                      :src="selectedGenerationInputImageSnapshot.url"
                      :alt="selectedGenerationInputImageSnapshot.name"
                      class="block max-h-full max-w-full object-contain"
                    />
                  </div>
                </div>
              </template>

              <div
                v-else
                class="flex h-full w-full flex-col items-center justify-center gap-4 px-6 text-center text-primary-foreground/72"
              >
                <div class="rounded-md border border-primary-foreground/12 bg-primary-foreground/8 p-3">
                  <ImageIcon class="h-14 w-14" :stroke-width="1.6" />
                </div>
                <div class="space-y-1">
                  <p class="text-base font-semibold text-primary-foreground">No preview yet</p>
                  <p class="text-sm text-primary-foreground/62">
                    Run the workflow to render the first image here.
                  </p>
                </div>
              </div>
            </div>

            <div
              v-if="shouldShowStandalonePreviewStatus"
              class="mt-4 shrink-0 rounded-md border border-primary-foreground/12 bg-primary/88 px-3 py-3 shadow-sm"
            >
              <template v-if="previewStatusItems.length">
                <div class="flex items-center justify-between gap-4 text-sm font-semibold">
                  <span>{{ previewStatusTitle }}</span>
                  <span class="text-xs uppercase tracking-[0.12em] text-primary-foreground/62">
                    {{ previewStatusItems.length }} items
                  </span>
                </div>

                <div class="mt-3 flex gap-2 overflow-x-auto pb-1">
                  <div
                    v-for="item in previewStatusItems"
                    :key="item.key"
                    class="min-w-[8.5rem] flex-1 basis-0 rounded-sm border border-primary-foreground/10 bg-primary-foreground/4 px-2.5 py-2"
                  >
                    <div class="flex items-center justify-between gap-3 text-xs font-semibold">
                      <span class="min-w-0 truncate">{{ item.label }}</span>
                      <span class="shrink-0 text-primary-foreground/62">{{ item.statusLabel }}</span>
                    </div>

                    <div class="mt-2 h-1.5 overflow-hidden rounded-sm bg-primary-foreground/12">
                      <div
                        v-if="item.progressPercent !== null"
                        class="h-full transition-[width] duration-300 ease-out"
                        :class="item.isDestructive ? 'bg-destructive' : 'bg-secondary'"
                        :style="{ width: `${item.progressPercent}%` }"
                      />
                      <div
                        v-else-if="item.indeterminate"
                        class="companion-indeterminate h-full w-1/2"
                        :class="item.isDestructive ? 'bg-destructive' : 'bg-secondary'"
                      />
                      <div
                        v-else-if="item.isComplete"
                        class="h-full bg-secondary"
                      />
                      <div
                        v-else
                        class="h-full bg-primary-foreground/10"
                      />
                    </div>
                  </div>
                </div>

                <p class="mt-3 break-words text-sm text-primary-foreground/82">
                  {{ previewStatusSummaryLine }}
                </p>
              </template>

              <template v-else>
                <div class="flex items-center justify-between gap-4 text-sm font-semibold">
                  <span>{{ statusLine }}</span>
                  <span v-if="progressPercent !== null">{{ progressPercent }}%</span>
                </div>

                <div class="mt-3 h-2 overflow-hidden rounded-sm bg-primary-foreground/14">
                  <div
                    v-if="progressPercent !== null"
                    class="h-full bg-secondary transition-[width] duration-300 ease-out"
                    :style="{ width: `${progressPercent}%` }"
                  />
                  <div
                    v-else-if="jobState === 'queued' || jobState === 'running'"
                    class="companion-indeterminate h-full w-1/3 bg-secondary"
                  />
                  <div
                    v-else-if="jobState === 'cancelling'"
                    class="companion-indeterminate h-full w-1/3 bg-destructive"
                  />
                  <div
                    v-else
                    class="h-full bg-primary-foreground/10"
                  />
                </div>

                <p class="mt-3 break-words text-sm text-primary-foreground/82">
                  {{ detailLine }}
                </p>
              </template>

              <p
                v-if="errorMessage"
                class="mt-3 whitespace-pre-line break-words text-sm text-destructive"
              >
                {{ errorMessage }}
              </p>
            </div>

            <div
              v-if="hasMultiplePreviewOutputs"
              class="mt-4 shrink-0"
            >
              <div class="flex gap-3 overflow-x-auto pb-1">
                <button
                  v-for="(item, index) in previewDisplayItems"
                  :key="item.key"
                  type="button"
                  class="w-24 shrink-0 rounded-md border bg-primary-foreground/6 p-2 text-left transition"
                  :class="
                    index === activePreviewIndex
                      ? 'border-secondary ring-1 ring-secondary/80'
                      : 'border-primary-foreground/12 hover:border-accent hover:text-accent'
                  "
                  @click="activePreviewIndex = index"
                  @contextmenu="item.output && openGeneratedOutputContextMenu($event, item.output, item.checkpointName)"
                >
                  <div
                    v-if="item.output"
                    class="aspect-square overflow-hidden rounded-sm bg-primary-foreground/8"
                  >
                    <img
                      :src="item.output.url"
                      :alt="item.variantLabel ?? `Preview ${index + 1}`"
                      class="h-full w-full object-cover"
                    />
                  </div>

                  <div
                    v-else
                    class="flex aspect-square flex-col items-center justify-center gap-2 rounded-sm border border-dashed border-primary-foreground/16 bg-primary-foreground/8 px-2 text-center"
                  >
                    <ImageIcon class="h-6 w-6 text-primary-foreground/60" :stroke-width="1.6" />

                    <div class="w-full">
                      <div class="h-1.5 overflow-hidden rounded-sm bg-primary-foreground/12">
                        <div
                          v-if="getPreviewPlaceholderProgressPercent(item) !== null"
                          class="h-full bg-secondary transition-[width] duration-300 ease-out"
                          :style="{ width: `${getPreviewPlaceholderProgressPercent(item)}%` }"
                        />
                        <div
                          v-else-if="shouldShowPreviewPlaceholderIndeterminate(item)"
                          :class="getPreviewPlaceholderBarClass(item).replace('w-1/3', 'w-1/2')"
                        />
                        <div
                          v-else
                          class="h-full bg-primary-foreground/10"
                        />
                      </div>

                      <p class="mt-2 truncate text-[11px] font-semibold text-primary-foreground/82">
                        {{ getPreviewPlaceholderStatus(item) }}
                      </p>
                    </div>
                  </div>

                  <p class="mt-2 truncate text-[11px] font-semibold text-primary-foreground/82">
                    {{ item.variantLabel ?? `Output ${index + 1}` }}
                  </p>
                </button>
              </div>
            </div>
          </div>
        </div>

      </aside>
</template>
