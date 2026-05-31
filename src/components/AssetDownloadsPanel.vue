<script setup lang="ts">
import { Check, Download, LoaderCircle, Pause, Play, Trash2, X } from 'lucide-vue-next'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useAssetDownloadPanel, type AssetDownloadItem } from '../composables/useAssetDownloads'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

const {
  downloads,
  activeDownloads,
  completedDownloads,
  pauseDownload,
  resumeDownload,
  cancelDownload,
  clearDownloads,
  startPolling,
  stopPolling,
} = useAssetDownloadPanel()

const clearing = ref(false)
let previousBodyOverflow: string | null = null

const panelCompletedDownloads = computed(() => {
  return completedDownloads.value.filter((item) => !item.dismissedAt)
})

const panelFailedDownloads = computed(() => {
  return downloads.value.filter((item) => {
    return (item.state === 'error' || item.state === 'cancelled') && !item.dismissedAt
  })
})

const clearableDownloads = computed(() => {
  return [
    ...panelCompletedDownloads.value,
    ...panelFailedDownloads.value,
  ]
})

const visibleDownloads = computed(() => {
  return [
    ...activeDownloads.value,
    ...panelFailedDownloads.value,
    ...panelCompletedDownloads.value,
  ]
})

const panelTitle = computed(() => {
  if (activeDownloads.value.length) {
    return `${activeDownloads.value.length} active download${activeDownloads.value.length === 1 ? '' : 's'}`
  }

  if (panelFailedDownloads.value.length) {
    return `${panelFailedDownloads.value.length} needs attention`
  }

  if (panelCompletedDownloads.value.length) {
    return `${panelCompletedDownloads.value.length} downloaded`
  }

  return 'Downloads'
})

async function clearDownloadList() {
  if (clearing.value || !clearableDownloads.value.length) {
    return
  }

  clearing.value = true
  try {
    await clearDownloads()
  } finally {
    clearing.value = false
  }
}

function closeSheet() {
  emit('close')
}

function lockBodyScroll() {
  if (typeof document === 'undefined' || previousBodyOverflow !== null) {
    return
  }

  previousBodyOverflow = document.body.style.overflow
  document.body.style.overflow = 'hidden'
}

function unlockBodyScroll() {
  if (typeof document === 'undefined' || previousBodyOverflow === null) {
    return
  }

  document.body.style.overflow = previousBodyOverflow
  previousBodyOverflow = null
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    closeSheet()
  }
}

function progressLabel(item: AssetDownloadItem) {
  if (item.state === 'complete') {
    return 'Downloaded'
  }

  if (item.state === 'paused') {
    return 'Paused'
  }

  if (item.state === 'queued') {
    return 'Queued'
  }

  if (item.state === 'error') {
    return 'Failed'
  }

  return item.progressPercent === null || item.progressPercent === undefined
    ? 'Downloading'
    : `${Math.round(item.progressPercent)}%`
}

function progressWidth(item: AssetDownloadItem) {
  if (item.state === 'complete') {
    return '100%'
  }

  return `${Math.max(0, Math.min(100, item.progressPercent ?? 0))}%`
}

watch(
  () => props.open,
  (open) => {
    if (typeof window === 'undefined') {
      return
    }

    if (open) {
      startPolling()
      lockBodyScroll()
      window.addEventListener('keydown', handleKeydown)
      return
    }

    stopPolling()
    unlockBodyScroll()
    window.removeEventListener('keydown', handleKeydown)
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('keydown', handleKeydown)
  }

  stopPolling()
  unlockBodyScroll()
})
</script>

<template>
  <div
    v-if="open"
    class="fixed inset-0 z-50"
    role="dialog"
    aria-modal="true"
    aria-label="Asset downloads"
    @keydown.esc="closeSheet"
  >
    <button
      class="absolute inset-0 h-full w-full cursor-default bg-background/70 backdrop-blur-sm"
      type="button"
      aria-label="Dismiss asset downloads"
      @click="closeSheet"
    />

    <aside
      class="absolute right-0 top-0 flex h-full w-[28rem] max-w-[100vw] flex-col border-l border-border bg-card text-card-foreground shadow-[0_18px_70px_rgba(0,0,0,0.45)]"
      aria-label="Asset downloads sheet"
    >
      <header class="shrink-0 border-b border-border px-4 py-4">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-secondary">
              <Download class="h-4 w-4" />
              Asset downloads
            </p>
            <h2 class="mt-2 truncate text-lg font-semibold text-card-foreground">{{ panelTitle }}</h2>
          </div>

          <button
            class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground transition hover:border-secondary/60 hover:bg-secondary hover:text-secondary-foreground focus:outline-none focus:ring-2 focus:ring-ring/25"
            type="button"
            aria-label="Close asset downloads"
            @click="closeSheet"
          >
            <X class="h-4 w-4" />
          </button>
        </div>

        <div class="mt-3 flex items-center justify-between gap-3">
          <span class="rounded-sm border border-border bg-background px-2 py-1 text-xs font-semibold text-muted-foreground">
            {{ panelCompletedDownloads.length }} done
          </span>
          <button
            v-if="clearableDownloads.length"
            class="inline-flex h-8 items-center gap-2 rounded-sm border border-border px-3 text-xs font-semibold text-muted-foreground transition hover:border-destructive/70 hover:text-destructive focus:outline-none focus:ring-2 focus:ring-ring/25 disabled:cursor-wait disabled:opacity-60"
            type="button"
            :disabled="clearing"
            aria-label="Clear finished downloads"
            @click="clearDownloadList"
          >
            <LoaderCircle
              v-if="clearing"
              class="h-3.5 w-3.5 animate-spin"
            />
            <Trash2
              v-else
              class="h-3.5 w-3.5"
            />
            Clear finished
          </button>
        </div>
      </header>

      <div class="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 py-4">
        <div
          v-if="!visibleDownloads.length"
          class="flex min-h-48 items-center justify-center rounded-md border border-border bg-background px-4 text-center text-sm text-muted-foreground"
        >
          No downloads to show.
        </div>

        <div
          v-else
          class="grid gap-2"
        >
            <div
              v-for="item in visibleDownloads"
              :key="item.id"
              class="min-w-0 overflow-hidden rounded-md border border-border bg-background p-2"
            >
              <div class="flex min-w-0 items-start justify-between gap-2">
                <div class="min-w-0 flex-1 overflow-hidden">
                  <p
                    class="block max-w-full truncate text-xs font-semibold"
                    :title="item.modelName"
                  >
                    {{ item.modelName }}
                  </p>
                  <p
                    class="block max-w-full truncate text-[0.7rem] text-muted-foreground"
                    :title="`${item.versionName} · ${item.fileName}`"
                  >
                    {{ item.versionName }} · {{ item.fileName }}
                  </p>
                </div>
                <div class="flex shrink-0 items-center gap-1">
                  <button
                    v-if="item.state === 'downloading' || item.state === 'queued'"
                    class="inline-flex h-7 w-7 items-center justify-center rounded-sm border border-border text-muted-foreground transition hover:border-secondary/60 hover:text-secondary"
                    type="button"
                    aria-label="Pause download"
                    @click="pauseDownload(item.id)"
                  >
                    <Pause class="h-3.5 w-3.5" />
                  </button>
                  <button
                    v-if="item.state === 'paused' || item.state === 'error' || item.state === 'cancelled'"
                    class="inline-flex h-7 w-7 items-center justify-center rounded-sm border border-border text-muted-foreground transition hover:border-secondary/60 hover:text-secondary"
                    type="button"
                    aria-label="Resume download"
                    @click="resumeDownload(item.id)"
                  >
                    <Play class="h-3.5 w-3.5" />
                  </button>
                  <button
                    v-if="item.state !== 'complete'"
                    class="inline-flex h-7 w-7 items-center justify-center rounded-sm border border-border text-muted-foreground transition hover:border-destructive/70 hover:text-destructive"
                    type="button"
                    aria-label="Cancel download"
                    @click="cancelDownload(item.id)"
                  >
                    <X class="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <div class="mt-2 flex min-w-0 items-center gap-2">
                <div class="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    class="h-full rounded-full transition-all"
                    :class="item.state === 'complete' ? 'bg-secondary' : item.state === 'error' ? 'bg-destructive' : 'bg-accent'"
                    :style="{ width: progressWidth(item) }"
                  />
                </div>
                <span class="inline-flex min-w-[4.5rem] shrink-0 justify-end text-[0.7rem] font-semibold text-muted-foreground">
                  <Check
                    v-if="item.state === 'complete'"
                    class="mr-1 h-3.5 w-3.5 text-secondary"
                  />
                  <LoaderCircle
                    v-else-if="item.state === 'downloading'"
                    class="mr-1 h-3.5 w-3.5 animate-spin text-accent"
                  />
                  {{ progressLabel(item) }}
                </span>
              </div>
            </div>
        </div>
      </div>

      <footer class="shrink-0 border-t border-border px-4 py-3 text-xs text-muted-foreground">
        {{ visibleDownloads.length }} shown
      </footer>
    </aside>
  </div>
</template>
