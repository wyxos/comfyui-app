<script setup lang="ts">
import {
  Ruler,
  Upload,
  X,
} from 'lucide-vue-next'
import UiTooltip from '../../components/ui/UiTooltip.vue'
import { useProvidedHomeView } from './homeViewContext'

const {
  imageDenoise,
  inputImageField,
  selectedImagePreviewUrl,
  selectedImageDimensions,
  useInputImage,
  isDraggingImage,
  isUploadingInputImage,
  inputImageUploadError,
  formTab,
  hasInputImage,
  shouldUseInputImage,
  selectedInputImageName,
  imageDenoisePlaceholder,
  sourceImageDimensionLabel,
  dropzoneResolutionHint,
  handleImageSelection,
  clearSelectedImage,
  applySourceImageResolution,
  openImagePicker,
  handleImageDragEnter,
  handleImageDragOver,
  handleImageDragLeave,
  handleImageDrop,
} = useProvidedHomeView()

void inputImageField
</script>

<template>
            <div
              v-show="formTab === 'image'"
              class="space-y-5"
            >
            <div class="flex flex-col gap-3">
              <div class="flex items-center justify-between gap-3">
                <span class="field-label">Input image</span>
                <div class="flex items-center gap-2">
                  <span
                    class="text-xs font-medium"
                    :class="shouldUseInputImage ? 'text-secondary' : 'text-muted-foreground'"
                  >
                    {{ shouldUseInputImage ? 'Enabled' : 'Disabled' }}
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-label="Use input image"
                    :aria-checked="shouldUseInputImage"
                    class="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition focus:outline-none focus:ring-2 focus:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-50"
                    :class="
                      useInputImage
                        ? 'border-secondary bg-secondary'
                        : 'border-primary-foreground/12 bg-primary-foreground/8 hover:border-accent'
                    "
                    :disabled="!hasInputImage"
                    @click="useInputImage = !useInputImage"
                  >
                    <span
                      class="inline-block h-4 w-4 rounded-full bg-primary-foreground shadow-sm transition-transform"
                      :class="useInputImage ? 'translate-x-5' : 'translate-x-1'"
                    />
                  </button>
                </div>
              </div>
              <input
                ref="inputImageField"
                type="file"
                accept="image/png,image/jpeg,image/webp,image/avif"
                class="hidden"
                @change="handleImageSelection"
              />

              <div class="w-[450px] max-w-full">
                <div
                  role="button"
                  tabindex="0"
                  class="relative aspect-square w-full overflow-hidden rounded-md border bg-card outline-none transition focus:border-accent focus:ring-2 focus:ring-ring/25"
                  :class="
                    isDraggingImage
                      ? 'border-accent bg-accent/10 ring-2 ring-ring/25'
                      : 'border-input hover:border-accent/60'
                  "
                  @click="openImagePicker"
                  @keydown.enter.prevent="openImagePicker"
                  @keydown.space.prevent="openImagePicker"
                  @dragenter.prevent="handleImageDragEnter"
                  @dragover.prevent="handleImageDragOver"
                  @dragleave.prevent="handleImageDragLeave"
                  @drop.prevent="handleImageDrop"
                >
                  <img
                    v-if="hasInputImage"
                    :src="selectedImagePreviewUrl ?? ''"
                    alt="Selected input preview"
                    class="h-full w-full object-contain"
                  />

                  <div
                    v-if="hasInputImage && !shouldUseInputImage"
                    class="absolute left-3 top-3 rounded-sm border border-destructive/35 bg-destructive px-2 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-destructive-foreground shadow-sm"
                  >
                    Ignored
                  </div>

                  <UiTooltip
                    v-if="selectedImageDimensions"
                    class="absolute top-3 right-14 z-10"
                    :content="sourceImageDimensionLabel"
                  >
                    <button
                      type="button"
                      aria-label="Use source image resolution"
                      class="inline-flex h-9 w-9 items-center justify-center rounded-md border border-primary-foreground/12 bg-primary text-primary-foreground shadow-sm transition hover:border-secondary hover:text-secondary focus:border-accent focus:ring-2 focus:ring-ring/25"
                      @click.stop="applySourceImageResolution"
                    >
                      <Ruler class="h-4 w-4" />
                    </button>
                  </UiTooltip>

                  <UiTooltip
                    v-if="hasInputImage"
                    class="absolute top-3 right-3 z-10"
                    content="Clear image"
                  >
                    <button
                      type="button"
                      aria-label="Clear image"
                      class="inline-flex h-9 w-9 items-center justify-center rounded-md border border-destructive/25 bg-destructive text-destructive-foreground shadow-sm transition hover:bg-destructive/92 focus:border-accent focus:ring-2 focus:ring-ring/25"
                      @click.stop="clearSelectedImage"
                    >
                      <X class="h-4 w-4" />
                    </button>
                  </UiTooltip>

                  <div
                    v-else
                    class="flex h-full w-full flex-col items-center justify-center gap-5 px-6 text-center text-card-foreground"
                  >
                    <div class="rounded-md border border-primary-foreground/12 bg-primary px-3 py-3 text-primary-foreground/82">
                      <Upload class="h-12 w-12" :stroke-width="1.6" />
                    </div>
                    <div class="space-y-2">
                      <p class="text-base font-semibold">Drop image here</p>
                      <p class="text-xs text-primary-foreground/60">
                        {{ dropzoneResolutionHint }}
                      </p>
                      <p class="text-sm text-muted-foreground">or click to browse from disk</p>
                    </div>
                  </div>

                  <div
                    v-if="hasInputImage"
                    class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-primary via-primary/82 to-transparent px-2 pb-2 pt-8"
                  >
                    <p class="truncate text-sm font-semibold text-primary-foreground">
                      {{ selectedInputImageName }}
                    </p>
                    <p class="mt-1 text-xs text-primary-foreground/70">
                      Drop a new image or click to replace
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <label class="flex flex-col gap-2">
                  <span class="field-label">Image denoise</span>
                  <input
                    v-model="imageDenoise"
                    type="number"
                    min="0"
                    max="1"
                    step="0.01"
                    :disabled="!shouldUseInputImage"
                    class="h-11 w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-card-foreground outline-none transition placeholder:text-muted-foreground focus:border-accent focus:ring-2 focus:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-55"
                    :placeholder="imageDenoisePlaceholder"
                  />
                </label>
              </div>

              <p
                v-if="selectedImageDimensions"
                class="text-xs text-primary-foreground/70"
              >
                Source image detected at {{ selectedImageDimensions.width }} x {{ selectedImageDimensions.height }}.
              </p>

              <p
                v-if="hasInputImage && !shouldUseInputImage"
                class="text-xs text-muted-foreground"
              >
                Image is loaded but ignored until the input image toggle is enabled.
              </p>

              <p
                v-if="isUploadingInputImage"
                class="text-xs text-primary-foreground/70"
              >
                Uploading input image to the companion app...
              </p>

              <p
                v-if="inputImageUploadError"
                class="text-xs text-destructive"
              >
                {{ inputImageUploadError }}
              </p>
            </div>
            </div>
</template>
