<script setup lang="ts">
import { computed } from 'vue'
import {
  ArrowLeftRight,
  ArrowUpDown,
  History,
  RefreshCw,
  RotateCcw,
} from 'lucide-vue-next'
import UiSlider from '../../components/ui/UiSlider.vue'
import UiTooltip from '../../components/ui/UiTooltip.vue'
import { useProvidedHomeView } from './homeViewContext'

const {
  width,
  height,
  seed,
  steps,
  cfg,
  maintainAspectRatio,
  aspectRatioSliderValue,
  aspectRatioLabel,
  formTab,
  lastGeneratedSeed,
  stepsPlaceholder,
  cfgPlaceholder,
  lastGeneratedSeedTooltip,
  sizeValidation,
  sizeValidationClass,
  setAspectRatioLock,
  setAspectRatioSliderValue,
  resetAspectRatioScale,
  useLastGeneratedSeed,
  swapSizeValues,
} = useProvidedHomeView()

const aspectRatioSliderModel = computed({
  get: () => [Number.parseFloat(aspectRatioSliderValue.value) || 0],
  set: (value: number[]) => {
    setAspectRatioSliderValue(value[0] ?? 0)
  },
})

function handleAspectRatioInput(event: Event) {
  const target = event.target
  if (target instanceof HTMLInputElement) {
    setAspectRatioSliderValue(target.value)
  }
}
</script>

<template>
  <div
    v-show="formTab === 'config'"
    class="space-y-5"
  >
    <div class="flex flex-col gap-2">
      <div class="flex items-center justify-between gap-3">
        <span class="field-label">Size</span>
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="inline-flex h-8 items-center justify-center rounded-sm border px-3 text-[11px] font-semibold uppercase tracking-[0.12em] transition focus:border-accent focus:ring-2 focus:ring-ring/25"
            :class="
              maintainAspectRatio
                ? 'border-secondary bg-secondary/16 text-secondary'
                : 'border-primary-foreground/12 bg-primary-foreground/6 text-primary-foreground/72 hover:border-accent hover:text-accent'
            "
            @click="setAspectRatioLock(!maintainAspectRatio)"
          >
            {{ maintainAspectRatio ? 'Ratio Locked' : 'Free Ratio' }}
          </button>

          <UiTooltip content="Swap width and height">
            <button
              type="button"
              aria-label="Swap width and height"
              class="inline-flex h-8 w-8 items-center justify-center rounded-sm border border-primary-foreground/12 bg-primary-foreground/6 text-primary-foreground transition hover:border-accent hover:text-accent focus:border-accent focus:ring-2 focus:ring-ring/25"
              @click="swapSizeValues"
            >
              <RefreshCw class="h-4 w-4" />
            </button>
          </UiTooltip>
        </div>
      </div>

      <div class="grid gap-4 sm:grid-cols-2">
        <div class="relative">
          <input
            v-model="width"
            type="number"
            min="64"
            step="1"
            aria-label="Width"
            class="h-11 w-full rounded-md border border-input bg-card px-3 py-2 pr-12 text-sm text-card-foreground outline-none transition placeholder:text-muted-foreground focus:border-accent focus:ring-2 focus:ring-ring/25"
            placeholder="1024"
          />
          <span
            class="pointer-events-none absolute top-1/2 right-1 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-sm border border-primary-foreground/12 bg-primary-foreground/6 text-primary-foreground"
            aria-hidden="true"
          >
            <ArrowLeftRight class="h-4 w-4" />
          </span>
        </div>

        <div class="relative">
          <input
            v-model="height"
            type="number"
            min="64"
            step="1"
            aria-label="Height"
            class="h-11 w-full rounded-md border border-input bg-card px-3 py-2 pr-12 text-sm text-card-foreground outline-none transition placeholder:text-muted-foreground focus:border-accent focus:ring-2 focus:ring-ring/25"
            placeholder="1024"
          />
          <span
            class="pointer-events-none absolute top-1/2 right-1 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-sm border border-primary-foreground/12 bg-primary-foreground/6 text-primary-foreground"
            aria-hidden="true"
          >
            <ArrowUpDown class="h-4 w-4" />
          </span>
        </div>
      </div>

      <div class="space-y-3 rounded-md border border-primary-foreground/10 bg-primary-foreground/4 p-3">
        <div class="flex items-center justify-between gap-3">
          <span class="text-xs font-semibold uppercase tracking-[0.12em] text-primary-foreground/72">
            Scale
          </span>
          <div class="flex items-center gap-2">
            <label>
              <span class="sr-only">Aspect ratio scale</span>
              <input
                :value="aspectRatioSliderValue"
                type="number"
                min="-10"
                max="10"
                step="0.25"
                aria-label="Aspect ratio scale"
                :disabled="!maintainAspectRatio"
                class="h-8 w-20 rounded-sm border border-input bg-card px-2 text-sm text-card-foreground outline-none transition focus:border-accent focus:ring-2 focus:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-45"
                @input="handleAspectRatioInput"
              />
            </label>
            <UiTooltip content="Reset scale">
              <button
                type="button"
                aria-label="Reset aspect ratio scale"
                class="inline-flex h-8 w-8 items-center justify-center rounded-sm border border-primary-foreground/12 bg-primary-foreground/6 text-primary-foreground transition hover:border-accent hover:text-accent focus:border-accent focus:ring-2 focus:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-45"
                :disabled="!maintainAspectRatio || aspectRatioSliderValue === '0'"
                @click="resetAspectRatioScale"
              >
                <RotateCcw class="h-4 w-4" />
              </button>
            </UiTooltip>
          </div>
        </div>

        <div class="flex items-center justify-between gap-3">
          <span class="text-xs text-primary-foreground/62">-10</span>
          <UiSlider
            v-model="aspectRatioSliderModel"
            :min="-10"
            :max="10"
            :step="0.25"
            aria-label="Aspect ratio scale"
            :disabled="!maintainAspectRatio"
            class="min-w-0 flex-1"
          />
          <span class="text-xs text-primary-foreground/62">10</span>
        </div>

        <p class="text-xs text-primary-foreground/52">
          {{ maintainAspectRatio ? aspectRatioLabel : 'Enable ratio lock to adjust the scale slider.' }}
        </p>
      </div>

      <p
        v-if="maintainAspectRatio"
        class="text-xs text-primary-foreground/52"
      >
        Scale adjusts both supplied dimensions while ratio lock is enabled.
      </p>
      <p
        class="text-xs"
        :class="sizeValidationClass"
      >
        {{ sizeValidation.message }}
      </p>
    </div>

    <div class="grid gap-4 sm:grid-cols-3">
      <label class="flex flex-col gap-2">
        <span class="field-label">Seed</span>
        <div class="relative">
          <input
            v-model="seed"
            type="number"
            min="-1"
            step="1"
            class="h-11 w-full rounded-md border border-input bg-card px-3 py-2 pr-12 text-sm text-card-foreground outline-none transition placeholder:text-muted-foreground focus:border-accent focus:ring-2 focus:ring-ring/25"
            placeholder="Random"
          />
          <UiTooltip
            class="absolute top-1/2 right-1 z-10 -translate-y-1/2"
            :content="lastGeneratedSeedTooltip"
          >
            <button
              type="button"
              aria-label="Use last generated seed"
              class="inline-flex h-9 w-9 items-center justify-center rounded-sm border border-primary-foreground/12 bg-primary-foreground/6 text-primary-foreground transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
              :disabled="lastGeneratedSeed === null"
              @click="useLastGeneratedSeed"
            >
              <History class="h-4 w-4" />
            </button>
          </UiTooltip>
        </div>
      </label>

      <label class="flex flex-col gap-2">
        <span class="field-label">Steps</span>
        <input
          v-model="steps"
          type="number"
          min="1"
          max="150"
          step="1"
          class="h-11 w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-card-foreground outline-none transition placeholder:text-muted-foreground focus:border-accent focus:ring-2 focus:ring-ring/25"
          :placeholder="stepsPlaceholder"
        />
      </label>

      <label class="flex flex-col gap-2">
        <span class="field-label">CFG</span>
        <input
          v-model="cfg"
          type="number"
          min="0"
          step="0.1"
          class="h-11 w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-card-foreground outline-none transition placeholder:text-muted-foreground focus:border-accent focus:ring-2 focus:ring-ring/25"
          :placeholder="cfgPlaceholder"
        />
      </label>
    </div>
  </div>
</template>
