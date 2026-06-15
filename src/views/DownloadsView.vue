<script setup lang="ts">
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Download,
  LoaderCircle,
  Search,
} from 'lucide-vue-next'
import { computed, onMounted, ref, watch } from 'vue'
import AssetPreviewModal from '../components/asset-preview/AssetPreviewModal.vue'
import { fetchAppSettings } from '../composables/useAppSettings'
import { useAssetDownloads } from '../composables/useAssetDownloads'
import { useConfirmDialog } from '../composables/useConfirmDialog'
import DownloadsTableRow from './downloads/DownloadsTableRow.vue'
import {
  isCheckpointOrLora,
  isVideoPreviewDownload,
  isWatchedCheckpointOrLora,
  normalizedModelType,
  previewForDownload,
  rowModelTypeLabel,
  statusGroup,
  watchedDownloadToRowItem,
  type DownloadViewRowItem,
} from './downloads/downloadsViewHelpers'

const PAGE_SIZE = 20

const typeFilters = [
  { label: 'All', value: 'all' },
  { label: 'Checkpoints', value: 'checkpoint' },
  { label: 'LoRAs', value: 'lora' },
] as const

const statusFilters = [
  { label: 'All', value: 'all' },
  { label: 'Downloaded', value: 'downloaded' },
  { label: 'Active', value: 'active' },
  { label: 'Watched', value: 'watched' },
  { label: 'Needs attention', value: 'attention' },
  { label: 'Deleted', value: 'deleted' },
] as const

type DownloadTypeFilter = (typeof typeFilters)[number]['value']
type DownloadStatusFilter = (typeof statusFilters)[number]['value']
type DownloadAction = 'pause' | 'resume' | 'cancel' | 'delete' | 'redownload' | 'keep-anyway'
type DownloadActionRunner = (id: string) => Promise<unknown>

const {
  downloads,
  watchedDownloads,
  loading,
  error,
  refreshDownloads,
  refreshWatchedDownloads,
  pauseDownload,
  resumeDownload,
  cancelDownload,
  deleteDownloadedFile,
  redownloadDownload,
  keepDownloadAnyway,
} = useAssetDownloads({ includeWatched: true })

const query = ref('')
const typeFilter = ref<DownloadTypeFilter>('all')
const statusFilter = ref<DownloadStatusFilter>('all')
const currentPage = ref(1)
const actionKey = ref('')
const actionError = ref('')
const includeNsfw = ref(false)
const blurNsfwContent = ref(true)
const selectedDownload = ref<DownloadViewRowItem | null>(null)
const confirm = useConfirmDialog()

const modelDownloads = computed(() => {
  return downloads.value
    .filter((item) => isCheckpointOrLora(item))
    .sort((left, right) => (right.updatedAt ?? 0) - (left.updatedAt ?? 0))
})

const watchedModelDownloads = computed(() => {
  return watchedDownloads.value
    .filter((item) => isWatchedCheckpointOrLora(item))
    .map((item) => watchedDownloadToRowItem(item))
    .sort((left, right) => (right.updatedAt ?? 0) - (left.updatedAt ?? 0))
})

const filterSourceDownloads = computed(() => {
  return statusFilter.value === 'watched' ? watchedModelDownloads.value : modelDownloads.value
})

const filteredDownloads = computed(() => {
  const search = query.value.trim().toLowerCase()

  return filterSourceDownloads.value.filter((item) => {
    if (typeFilter.value !== 'all' && normalizedModelType(item) !== typeFilter.value) {
      return false
    }

    if (statusFilter.value !== 'all' && statusGroup(item) !== statusFilter.value) {
      return false
    }

    if (!search) {
      return true
    }

    return [
      item.modelName,
      item.versionName,
      item.fileName,
      item.baseModel,
      item.targetPath,
      item.error,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(search)
  })
})

const pageCount = computed(() => Math.max(1, Math.ceil(filteredDownloads.value.length / PAGE_SIZE)))
const pageStart = computed(() => (currentPage.value - 1) * PAGE_SIZE)
const pageEnd = computed(() => pageStart.value + PAGE_SIZE)
const pagedDownloads = computed(() => filteredDownloads.value.slice(pageStart.value, pageEnd.value))

const visibleRangeLabel = computed(() => {
  if (!filteredDownloads.value.length) {
    return '0 of 0'
  }

  return `${pageStart.value + 1}-${Math.min(pageEnd.value, filteredDownloads.value.length)} of ${filteredDownloads.value.length}`
})

const statusCounts = computed(() => ({
  all: modelDownloads.value.length,
  downloaded: modelDownloads.value.filter((item) => statusGroup(item) === 'downloaded').length,
  active: modelDownloads.value.filter((item) => statusGroup(item) === 'active').length,
  watched: watchedModelDownloads.value.length,
  attention: modelDownloads.value.filter((item) => statusGroup(item) === 'attention').length,
  deleted: modelDownloads.value.filter((item) => statusGroup(item) === 'deleted').length,
}))

watch([query, typeFilter, statusFilter], () => {
  currentPage.value = 1
})

watch(pageCount, (nextPageCount) => {
  currentPage.value = Math.min(currentPage.value, nextPageCount)
})

async function runDownloadAction(item: DownloadViewRowItem, action: DownloadAction, runner: DownloadActionRunner) {
  if (actionKey.value) {
    return
  }

  if (action === 'delete') {
    const confirmed = await confirm({
      title: 'Delete downloaded file?',
      description: `Delete ${item.fileName} from disk? The download record will remain for redownload.`,
      confirmLabel: 'Delete file',
      destructive: true,
    })
    if (!confirmed) {
      return
    }
  }

  if (action === 'redownload' && item.state === 'complete') {
    const confirmed = await confirm({
      title: 'Re-download file?',
      description: `Re-download ${item.fileName}? This will replace the existing downloaded file.`,
      confirmLabel: 'Re-download',
      destructive: true,
    })
    if (!confirmed) {
      return
    }
  }

  if (action === 'keep-anyway') {
    const confirmed = await confirm({
      title: 'Keep hash-mismatched file?',
      description: `Download ${item.fileName} again and keep it even if Civitai's served bytes still do not match its SHA-256 metadata.`,
      confirmLabel: 'Keep anyway',
      destructive: true,
    })
    if (!confirmed) {
      return
    }
  }

  actionKey.value = `${action}:${item.id}`
  actionError.value = ''
  try {
    await runner(item.id)
  } catch (caughtError) {
    actionError.value = caughtError instanceof Error ? caughtError.message : 'Download action failed.'
  } finally {
    if (actionKey.value === `${action}:${item.id}`) {
      actionKey.value = ''
    }
  }
}

function goToPage(page: number) {
  currentPage.value = Math.max(1, Math.min(page, pageCount.value))
}

function openDownloadPreview(item: DownloadViewRowItem) {
  selectedDownload.value = item
}

function closeDownloadPreview() {
  selectedDownload.value = null
}

async function loadAppSettingsDefaults() {
  try {
    const settings = await fetchAppSettings()
    includeNsfw.value = settings.includeNsfw
    blurNsfwContent.value = settings.blurNsfwContent !== false
  } catch {
    includeNsfw.value = false
    blurNsfwContent.value = true
  }
}

async function refreshDownloadLists() {
  await Promise.allSettled([refreshDownloads(), refreshWatchedDownloads()])
}

onMounted(() => {
  void loadAppSettingsDefaults()
})
</script>

<template>
  <main class="flex h-full min-h-0 flex-col bg-background text-foreground">
    <section class="border-b border-border bg-card/82 px-4 py-3 sm:px-6">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="min-w-0">
          <h1 class="text-base font-semibold tracking-normal">Downloads</h1>
          <p class="mt-1 text-xs text-muted-foreground">
            {{ statusCounts.downloaded }} downloaded, {{ statusCounts.active }} active, {{ statusCounts.watched }} watched, {{ statusCounts.deleted }} deleted
          </p>
        </div>

        <button
          class="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-background px-3 text-xs font-semibold text-card-foreground transition hover:border-secondary/60 hover:text-secondary focus:outline-none focus:ring-2 focus:ring-ring/25 disabled:cursor-wait disabled:opacity-60"
          type="button"
          :disabled="loading"
          @click="refreshDownloadLists"
        >
          <LoaderCircle
            v-if="loading"
            class="h-4 w-4 animate-spin"
          />
          <Download
            v-else
            class="h-4 w-4"
          />
          Refresh
        </button>
      </div>

      <div class="mt-3 flex flex-wrap items-center gap-2">
        <label class="relative min-w-[16rem] flex-1 sm:max-w-md">
          <span class="sr-only">Search downloads</span>
          <Search class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            v-model="query"
            class="h-9 w-full rounded-md border border-input bg-primary px-9 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-accent focus:ring-2 focus:ring-ring/25"
            type="search"
            placeholder="Search model, version, file, path"
          >
        </label>

        <div
          class="flex h-9 overflow-hidden rounded-md border border-border"
          role="group"
          aria-label="Download type filter"
        >
          <button
            v-for="option in typeFilters"
            :key="option.value"
            class="border-r border-border px-3 text-xs font-semibold last:border-r-0"
            :class="typeFilter === option.value ? 'bg-secondary text-secondary-foreground' : 'bg-background text-muted-foreground hover:bg-accent/10 hover:text-accent'"
            type="button"
            @click="typeFilter = option.value"
          >
            {{ option.label }}
          </button>
        </div>

        <div
          class="flex h-9 overflow-hidden rounded-md border border-border"
          role="group"
          aria-label="Download status filter"
        >
          <button
            v-for="option in statusFilters"
            :key="option.value"
            class="border-r border-border px-3 text-xs font-semibold last:border-r-0"
            :class="statusFilter === option.value ? 'bg-secondary text-secondary-foreground' : 'bg-background text-muted-foreground hover:bg-accent/10 hover:text-accent'"
            type="button"
            :aria-label="`Show ${option.label.toLowerCase()} downloads`"
            @click="statusFilter = option.value"
          >
            {{ option.label }}
          </button>
        </div>

        <label class="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-background px-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground transition hover:border-secondary/55 hover:text-foreground">
          <input
            v-model="includeNsfw"
            class="h-4 w-4 accent-secondary"
            type="checkbox"
            aria-label="Include NSFW downloads"
          >
          NSFW
        </label>
      </div>

      <p
        v-if="actionError || error"
        class="mt-3 inline-flex items-center gap-2 rounded-sm border border-destructive/35 bg-destructive/10 px-3 py-2 text-xs text-destructive"
      >
        <AlertCircle class="h-4 w-4" />
        {{ actionError || error }}
      </p>
    </section>

    <section class="min-h-0 flex-1 overflow-auto px-4 py-4 sm:px-6">
      <div
        v-if="!pagedDownloads.length"
        class="flex min-h-48 items-center justify-center rounded-md border border-border bg-card px-4 text-sm text-muted-foreground"
      >
        No downloads match the current filters.
      </div>

      <div
        v-else
        class="min-w-[74rem] overflow-hidden rounded-md border border-border bg-card"
      >
        <table class="w-full border-collapse text-left text-xs">
          <thead class="bg-primary text-[11px] uppercase text-muted-foreground">
            <tr>
              <th class="w-[25rem] px-3 py-2 font-semibold">Model</th>
              <th class="w-28 px-3 py-2 font-semibold">Type</th>
              <th class="w-32 px-3 py-2 font-semibold">Status</th>
              <th class="w-28 px-3 py-2 font-semibold">Size</th>
              <th class="px-3 py-2 font-semibold">Path</th>
              <th class="w-36 px-3 py-2 font-semibold">Updated</th>
              <th class="sticky right-0 z-20 w-64 border-l border-border bg-primary px-3 py-2 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-border">
            <DownloadsTableRow
              v-for="item in pagedDownloads"
              :key="item.id"
              :item="item"
              :action-key="actionKey"
              :blur-nsfw-preview="blurNsfwContent"
              @open-preview="openDownloadPreview"
              @pause="runDownloadAction($event, 'pause', pauseDownload)"
              @resume="runDownloadAction($event, 'resume', resumeDownload)"
              @cancel="runDownloadAction($event, 'cancel', cancelDownload)"
              @redownload="runDownloadAction($event, 'redownload', redownloadDownload)"
              @keep-anyway="runDownloadAction($event, 'keep-anyway', keepDownloadAnyway)"
              @delete-file="runDownloadAction($event, 'delete', deleteDownloadedFile)"
            />
          </tbody>
        </table>
      </div>
    </section>

    <footer class="flex shrink-0 items-center justify-between gap-3 border-t border-border bg-card/82 px-4 py-3 text-xs text-muted-foreground sm:px-6">
      <span>{{ visibleRangeLabel }}</span>
      <div class="flex items-center gap-2">
        <button
          class="inline-flex h-8 w-8 items-center justify-center rounded-sm border border-border text-muted-foreground transition hover:border-secondary/60 hover:text-secondary disabled:cursor-not-allowed disabled:opacity-50"
          type="button"
          :disabled="currentPage <= 1"
          aria-label="Previous downloads page"
          @click="goToPage(currentPage - 1)"
        >
          <ChevronLeft class="h-4 w-4" />
        </button>
        <span class="min-w-20 text-center font-semibold text-card-foreground">
          Page {{ currentPage }} / {{ pageCount }}
        </span>
        <button
          class="inline-flex h-8 w-8 items-center justify-center rounded-sm border border-border text-muted-foreground transition hover:border-secondary/60 hover:text-secondary disabled:cursor-not-allowed disabled:opacity-50"
          type="button"
          :disabled="currentPage >= pageCount"
          aria-label="Next downloads page"
          @click="goToPage(currentPage + 1)"
        >
          <ChevronRight class="h-4 w-4" />
        </button>
      </div>
    </footer>

    <AssetPreviewModal
      :open="Boolean(selectedDownload)"
      :model-id="selectedDownload?.modelId ?? null"
      :version-id="selectedDownload?.versionId ?? null"
      :preview-url="previewForDownload(selectedDownload)"
      :is-video="isVideoPreviewDownload(selectedDownload)"
      :include-nsfw="includeNsfw"
      :blur-nsfw-content="blurNsfwContent"
      :title="selectedDownload?.modelName ?? 'Preview'"
      :subtitle="selectedDownload?.versionName ?? null"
      :kind-label="rowModelTypeLabel(selectedDownload)"
      :model-type="selectedDownload?.modelType ?? null"
      :base-model="selectedDownload?.baseModel ?? null"
      :file-name="selectedDownload?.fileName ?? null"
      @close="closeDownloadPreview"
    />
  </main>
</template>
