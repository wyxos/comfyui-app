<script setup lang="ts">
import {
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
  X,
} from 'lucide-vue-next'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { isVideoUrl, preloadImage } from './asset-preview/assetPreviewHelpers'
import UiPreloadedMedia from './ui/UiPreloadedMedia.vue'
import type { JobOutput, JobResponse } from '../views/home/homeTypes'

const props = withDefaults(
  defineProps<{
    open?: boolean
    job?: JobResponse | null
  }>(),
  {
    open: false,
    job: null,
  },
)

const emit = defineEmits<{
  close: []
}>()

const activeIndex = ref(0)
const displayedUrl = ref('')
const mediaLoading = ref(false)
let mediaLoadToken = 0

const outputs = computed(() => props.job?.outputs.filter((output) => Boolean(output.url)) ?? [])
const activeOutput = computed(() => outputs.value[activeIndex.value] ?? null)
const modalSubtitle = computed(() => props.job?.promptId ?? 'Generation job')
const negativePrompt = computed(() => props.job?.negativePrompt?.trim() ?? '')
const generationSettings = computed(() => {
  const job = props.job
  if (!job) {
    return []
  }

  const rows: Array<{ label: string; value: string }> = []

  if (hasNumber(job.width) && hasNumber(job.height)) {
    rows.push({ label: 'Size', value: `${job.width} x ${job.height}` })
  }

  appendSetting(rows, 'Seed', job.seed)
  appendSetting(rows, 'CFG', job.cfg)
  appendSetting(rows, 'Denoise', job.denoise)
  appendSetting(rows, 'Input image', job.inputImageDisplayName || job.inputImageName)

  const loras = job.loras?.map(formatLora).filter(Boolean) ?? []
  if (loras.length) {
    rows.push({ label: 'LoRAs', value: loras.join(', ') })
  }

  return rows
})

function close() {
  emit('close')
}

function showPreviousOutput() {
  const total = outputs.value.length
  if (total >= 2) {
    activeIndex.value = (activeIndex.value - 1 + total) % total
  }
}

function showNextOutput() {
  const total = outputs.value.length
  if (total >= 2) {
    activeIndex.value = (activeIndex.value + 1) % total
  }
}

function handleModalVideoReady(url: string) {
  if (displayedUrl.value === url) {
    mediaLoading.value = false
  }
}

function promptLabel(job: JobResponse | null) {
  return job?.promptVariants[0]?.promptText || job?.promptVariants[0]?.label || 'Generation output'
}

function stateLabel(job: JobResponse | null) {
  if (!job) {
    return 'Unknown'
  }

  if (job.state === 'cancelling') {
    return 'Cancelling'
  }

  return job.state.charAt(0).toUpperCase() + job.state.slice(1)
}

function hasNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function appendSetting(rows: Array<{ label: string; value: string }>, label: string, value: unknown) {
  if (value === null || value === undefined) {
    return
  }

  const text = typeof value === 'number' ? String(value) : String(value).trim()
  if (text) {
    rows.push({ label, value: text })
  }
}

function formatLora(lora: NonNullable<JobResponse['loras']>[number]) {
  const name = String(lora.name ?? '').trim()
  if (!name) {
    return ''
  }

  return hasNumber(lora.strength) ? `${name} (${lora.strength})` : name
}

function formatDate(value: number | null | undefined) {
  if (!value) {
    return 'Unknown'
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function formatDuration(elapsedMs: number | null | undefined) {
  const totalSeconds = Math.max(0, Math.floor((elapsedMs ?? 0) / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`
}

function isVideoOutput(output: JobOutput | null | undefined) {
  return isVideoUrl(output?.url)
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    close()
  } else if (event.key === 'ArrowLeft') {
    showPreviousOutput()
  } else if (event.key === 'ArrowRight') {
    showNextOutput()
  }
}

watch(
  () => [props.open, props.job?.promptId ?? null],
  () => {
    activeIndex.value = 0
    displayedUrl.value = ''
    mediaLoading.value = false
  },
  { immediate: true },
)

watch(
  () => activeOutput.value?.url ?? '',
  async (url) => {
    const loadToken = mediaLoadToken + 1
    mediaLoadToken = loadToken

    if (!props.open || !url) {
      displayedUrl.value = ''
      mediaLoading.value = false
      return
    }

    mediaLoading.value = true
    displayedUrl.value = ''

    if (isVideoOutput(activeOutput.value)) {
      displayedUrl.value = url
      return
    }

    try {
      await preloadImage(url)
    } catch {
      // Let the native media element show its failure state.
    } finally {
      if (mediaLoadToken === loadToken) {
        displayedUrl.value = url
        mediaLoading.value = false
      }
    }
  },
  { immediate: true },
)

watch(
  () => props.open,
  (open) => {
    if (typeof window === 'undefined') {
      return
    }

    if (open) {
      window.addEventListener('keydown', handleKeydown)
    } else {
      window.removeEventListener('keydown', handleKeydown)
    }
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('keydown', handleKeydown)
  }
})
</script>

<template>
  <div
    v-if="open && job"
    class="fixed inset-0 z-50 grid bg-background/96 text-foreground backdrop-blur-sm lg:grid-cols-[4fr_1fr]"
    role="dialog"
    aria-modal="true"
    :aria-label="`${modalSubtitle} outputs preview`"
  >
    <section
      class="relative min-h-0 overflow-hidden bg-black/35"
      @click.self="close"
    >
      <div class="absolute right-4 top-4 z-20 flex items-center gap-2">
        <span
          v-if="outputs.length"
          class="rounded-md border border-primary-foreground/10 bg-primary/80 px-3 py-1.5 text-sm font-semibold text-primary-foreground shadow-sm backdrop-blur"
        >
          {{ activeIndex + 1 }} / {{ outputs.length }}
        </span>
        <button
          class="inline-flex h-10 w-10 items-center justify-center rounded-md border border-border bg-card text-muted-foreground transition hover:border-secondary/60 hover:bg-secondary hover:text-secondary-foreground"
          type="button"
          aria-label="Close job outputs preview"
          @click="close"
        >
          <X class="h-4 w-4" />
        </button>
      </div>

      <button
        class="absolute left-4 top-1/2 z-20 inline-flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-md border border-primary-foreground/10 bg-primary/70 text-primary-foreground transition hover:bg-secondary hover:text-secondary-foreground disabled:cursor-not-allowed disabled:opacity-40"
        type="button"
        aria-label="Previous output"
        :disabled="outputs.length < 2"
        @click="showPreviousOutput"
      >
        <ChevronLeft class="h-6 w-6" />
      </button>

      <div class="flex h-full min-h-0 items-center justify-center p-6">
        <div
          v-if="mediaLoading"
          class="absolute inset-0 z-10 flex items-center justify-center bg-background/55 text-sm font-semibold text-foreground backdrop-blur-sm"
          aria-live="polite"
        >
          <LoaderCircle class="mr-2 h-5 w-5 animate-spin text-secondary" />
          Loading output...
        </div>

        <UiPreloadedMedia
          v-if="displayedUrl"
          :src="displayedUrl"
          :is-video="isVideoOutput(activeOutput)"
          :alt="`${modalSubtitle} output image`"
          label=""
          media-class="max-h-full max-w-full object-contain"
          loading-class="hidden"
          controls
          autoplay
          loop
          playsinline
          preload="auto"
          @ready="handleModalVideoReady"
        />
        <div
          v-else-if="!mediaLoading"
          class="rounded-md border border-primary-foreground/12 bg-primary/72 px-5 py-4 text-sm font-semibold text-primary-foreground/72"
        >
          No output image available.
        </div>
      </div>

      <button
        class="absolute right-4 top-1/2 z-20 inline-flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-md border border-primary-foreground/10 bg-primary/70 text-primary-foreground transition hover:bg-secondary hover:text-secondary-foreground disabled:cursor-not-allowed disabled:opacity-40"
        type="button"
        aria-label="Next output"
        :disabled="outputs.length < 2"
        @click="showNextOutput"
      >
        <ChevronRight class="h-6 w-6" />
      </button>
    </section>

    <aside class="min-h-0 overflow-y-auto border-l border-border bg-card p-5">
      <div class="space-y-6">
        <section class="space-y-3">
          <div>
            <p class="text-xs font-semibold uppercase tracking-[0.22em] text-secondary">
              Generation job
            </p>
            <p class="mt-2 break-all font-mono text-xs text-muted-foreground">
              {{ modalSubtitle }}
            </p>
          </div>

          <dl class="grid gap-2 text-sm">
            <div class="rounded-md border border-border bg-background p-3">
              <dt class="text-xs uppercase tracking-[0.14em] text-muted-foreground">Status</dt>
              <dd class="mt-1 font-semibold text-card-foreground">{{ stateLabel(job) }}</dd>
            </div>
            <div class="rounded-md border border-border bg-background p-3">
              <dt class="text-xs uppercase tracking-[0.14em] text-muted-foreground">Checkpoint</dt>
              <dd class="mt-1 break-words font-semibold text-card-foreground">{{ job.checkpoint || 'Unknown' }}</dd>
            </div>
            <div class="rounded-md border border-border bg-background p-3">
              <dt class="text-xs uppercase tracking-[0.14em] text-muted-foreground">Outputs</dt>
              <dd class="mt-1 font-semibold text-card-foreground">{{ outputs.length }}</dd>
            </div>
            <div class="rounded-md border border-border bg-background p-3">
              <dt class="text-xs uppercase tracking-[0.14em] text-muted-foreground">Elapsed</dt>
              <dd class="mt-1 font-semibold text-card-foreground">{{ formatDuration(job.elapsedMs) }}</dd>
            </div>
            <div class="rounded-md border border-border bg-background p-3">
              <dt class="text-xs uppercase tracking-[0.14em] text-muted-foreground">Updated</dt>
              <dd class="mt-1 font-semibold text-card-foreground">{{ formatDate(job.updatedAt) }}</dd>
            </div>
          </dl>
        </section>

        <section
          v-if="generationSettings.length"
          class="space-y-3 border-t border-border pt-5"
        >
          <p class="text-xs font-semibold uppercase tracking-[0.22em] text-secondary">
            Generation settings
          </p>
          <dl class="grid gap-2 text-xs text-card-foreground">
            <div
              v-for="setting in generationSettings"
              :key="setting.label"
              class="flex items-center justify-between gap-3 rounded-md border border-border bg-background p-3"
            >
              <dt class="text-muted-foreground">{{ setting.label }}</dt>
              <dd class="min-w-0 truncate text-right font-semibold">{{ setting.value }}</dd>
            </div>
          </dl>
        </section>

        <section
          v-if="activeOutput"
          class="space-y-3 border-t border-border pt-5"
        >
          <p class="text-xs font-semibold uppercase tracking-[0.22em] text-secondary">
            Selected output
          </p>
          <dl class="grid gap-2 text-xs text-card-foreground">
            <div class="flex items-center justify-between gap-3 rounded-md border border-border bg-background p-3">
              <dt class="text-muted-foreground">File</dt>
              <dd class="min-w-0 truncate font-semibold">{{ activeOutput.filename }}</dd>
            </div>
            <div class="flex items-center justify-between gap-3 rounded-md border border-border bg-background p-3">
              <dt class="text-muted-foreground">Variant</dt>
              <dd class="min-w-0 truncate font-semibold">{{ activeOutput.variantLabel || 'Original output' }}</dd>
            </div>
            <div
              v-if="activeOutput.fullPath"
              class="rounded-md border border-border bg-background p-3"
            >
              <dt class="text-muted-foreground">Path</dt>
              <dd class="mt-1 break-all font-mono text-[11px] text-card-foreground">{{ activeOutput.fullPath }}</dd>
            </div>
          </dl>
        </section>

        <section class="space-y-3 border-t border-border pt-5">
          <p class="text-xs font-semibold uppercase tracking-[0.22em] text-secondary">
            Prompt
          </p>
          <p class="whitespace-pre-wrap break-words rounded-md border border-border bg-background p-3 text-xs leading-5 text-card-foreground">
            {{ activeOutput?.promptText || promptLabel(job) }}
          </p>
        </section>

        <section class="space-y-3 border-t border-border pt-5">
          <p class="text-xs font-semibold uppercase tracking-[0.22em] text-secondary">
            Negative prompt
          </p>
          <p class="whitespace-pre-wrap break-words rounded-md border border-border bg-background p-3 text-xs leading-5 text-card-foreground">
            {{ negativePrompt || 'None' }}
          </p>
        </section>
      </div>
    </aside>
  </div>
</template>
