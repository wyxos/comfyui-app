<script setup lang="ts">
import { computed } from 'vue'
import UiSelect from '../../components/ui/UiSelect.vue'
import UiSwitch from '../../components/ui/UiSwitch.vue'
import { useProvidedHomeView } from './homeViewContext'

const {
  clipSkip,
  hiresCfg,
  hiresDenoise,
  hiresEnabled,
  hiresHeight,
  hiresSamplerName,
  hiresScheduler,
  hiresSteps,
  hiresUpscale,
  hiresUpscaler,
  hiresWidth,
  loadingGenerationOptions,
  hasAnimaCheckpointSelected,
  hiresSamplerSelectOptions,
  hiresSchedulerSelectOptions,
  samplerPlaceholder,
  schedulerPlaceholder,
  upscaleModelSelectOptions,
  vaeName,
  vaeNameSelectOptions,
} = useProvidedHomeView()

function defaultOptionLabel(value: string, fallback = 'Default') {
  return value ? `${fallback} (${value})` : fallback
}

function buildSelectOptions(defaultLabel: string, options: string[]) {
  return [
    { label: defaultLabel, value: '' },
    ...options.map((option) => ({ label: option, value: option })),
  ]
}

const vaeUiOptions = computed(() => buildSelectOptions('Checkpoint VAE', vaeNameSelectOptions.value))
const upscalerUiOptions = computed(() => buildSelectOptions('Image scale only', upscaleModelSelectOptions.value))
const hiresSamplerUiOptions = computed(() =>
  buildSelectOptions(defaultOptionLabel(samplerPlaceholder.value), hiresSamplerSelectOptions.value),
)
const hiresSchedulerUiOptions = computed(() =>
  buildSelectOptions(defaultOptionLabel(schedulerPlaceholder.value), hiresSchedulerSelectOptions.value),
)
</script>

<template>
  <section class="space-y-4 rounded-md border border-primary-foreground/10 bg-primary-foreground/4 p-3">
    <div class="flex items-center justify-between gap-3">
      <span class="field-label">Replay metadata</span>
      <label class="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-primary-foreground/72">
        <span>Hires fix</span>
        <UiSwitch
          :checked="hiresEnabled"
          aria-label="Toggle hires fix replay"
          @click="hiresEnabled = !hiresEnabled"
        />
      </label>
    </div>

    <div class="grid gap-4 sm:grid-cols-2">
      <label class="flex flex-col gap-2">
        <span class="text-xs font-semibold uppercase tracking-[0.12em] text-primary-foreground/72">
          CLIP skip
        </span>
        <input
          v-model="clipSkip"
          type="number"
          min="1"
          max="12"
          step="1"
          class="h-11 w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-card-foreground outline-none transition placeholder:text-muted-foreground focus:border-accent focus:ring-2 focus:ring-ring/25"
          placeholder="Default"
        />
      </label>

      <label
        v-if="!hasAnimaCheckpointSelected"
        class="flex flex-col gap-2"
      >
        <span class="text-xs font-semibold uppercase tracking-[0.12em] text-primary-foreground/72">
          VAE
        </span>
        <UiSelect
          v-model="vaeName"
          :options="vaeUiOptions"
          placeholder="Checkpoint VAE"
          aria-label="VAE"
          searchable
          search-placeholder="Search VAE files..."
          :disabled="loadingGenerationOptions"
        />
      </label>
    </div>

    <div
      v-if="hiresEnabled"
      class="space-y-4"
    >
      <div class="grid gap-4 sm:grid-cols-3">
        <label class="flex flex-col gap-2">
          <span class="text-xs font-semibold uppercase tracking-[0.12em] text-primary-foreground/72">
            Hires width
          </span>
          <input
            v-model="hiresWidth"
            type="number"
            min="64"
            step="1"
            class="h-11 w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-card-foreground outline-none transition placeholder:text-muted-foreground focus:border-accent focus:ring-2 focus:ring-ring/25"
            placeholder="Auto"
          />
        </label>

        <label class="flex flex-col gap-2">
          <span class="text-xs font-semibold uppercase tracking-[0.12em] text-primary-foreground/72">
            Hires height
          </span>
          <input
            v-model="hiresHeight"
            type="number"
            min="64"
            step="1"
            class="h-11 w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-card-foreground outline-none transition placeholder:text-muted-foreground focus:border-accent focus:ring-2 focus:ring-ring/25"
            placeholder="Auto"
          />
        </label>

        <label class="flex flex-col gap-2">
          <span class="text-xs font-semibold uppercase tracking-[0.12em] text-primary-foreground/72">
            Upscale
          </span>
          <input
            v-model="hiresUpscale"
            type="number"
            min="1"
            max="8"
            step="0.05"
            class="h-11 w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-card-foreground outline-none transition placeholder:text-muted-foreground focus:border-accent focus:ring-2 focus:ring-ring/25"
            placeholder="2"
          />
        </label>
      </div>

      <div class="grid gap-4 sm:grid-cols-3">
        <label class="flex flex-col gap-2">
          <span class="text-xs font-semibold uppercase tracking-[0.12em] text-primary-foreground/72">
            Hires steps
          </span>
          <input
            v-model="hiresSteps"
            type="number"
            min="1"
            max="150"
            step="1"
            class="h-11 w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-card-foreground outline-none transition placeholder:text-muted-foreground focus:border-accent focus:ring-2 focus:ring-ring/25"
            placeholder="Base"
          />
        </label>

        <label class="flex flex-col gap-2">
          <span class="text-xs font-semibold uppercase tracking-[0.12em] text-primary-foreground/72">
            Hires CFG
          </span>
          <input
            v-model="hiresCfg"
            type="number"
            min="0"
            step="0.1"
            class="h-11 w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-card-foreground outline-none transition placeholder:text-muted-foreground focus:border-accent focus:ring-2 focus:ring-ring/25"
            placeholder="Base"
          />
        </label>

        <label class="flex flex-col gap-2">
          <span class="text-xs font-semibold uppercase tracking-[0.12em] text-primary-foreground/72">
            Hires denoise
          </span>
          <input
            v-model="hiresDenoise"
            type="number"
            min="0"
            max="1"
            step="0.01"
            class="h-11 w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-card-foreground outline-none transition placeholder:text-muted-foreground focus:border-accent focus:ring-2 focus:ring-ring/25"
            placeholder="0.5"
          />
        </label>
      </div>

      <label class="flex flex-col gap-2">
        <span class="text-xs font-semibold uppercase tracking-[0.12em] text-primary-foreground/72">
          Hires upscaler
        </span>
        <UiSelect
          v-model="hiresUpscaler"
          :options="upscalerUiOptions"
          placeholder="Image scale only"
          aria-label="Hires upscaler"
          searchable
          search-placeholder="Search upscale models..."
          :disabled="loadingGenerationOptions"
        />
      </label>

      <div class="grid gap-4 sm:grid-cols-2">
        <label class="flex flex-col gap-2">
          <span class="text-xs font-semibold uppercase tracking-[0.12em] text-primary-foreground/72">
            Hires sampler
          </span>
          <UiSelect
            v-model="hiresSamplerName"
            :options="hiresSamplerUiOptions"
            :placeholder="defaultOptionLabel(samplerPlaceholder)"
            aria-label="Hires sampler"
            searchable
            search-placeholder="Search samplers..."
            :disabled="loadingGenerationOptions"
          />
        </label>

        <label class="flex flex-col gap-2">
          <span class="text-xs font-semibold uppercase tracking-[0.12em] text-primary-foreground/72">
            Hires scheduler
          </span>
          <UiSelect
            v-model="hiresScheduler"
            :options="hiresSchedulerUiOptions"
            :placeholder="defaultOptionLabel(schedulerPlaceholder)"
            aria-label="Hires scheduler"
            searchable
            search-placeholder="Search schedulers..."
            :disabled="loadingGenerationOptions"
          />
        </label>
      </div>
    </div>
  </section>
</template>
