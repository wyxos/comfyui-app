<script setup lang="ts">
import {
  AlertCircle,
  Image as ImageIcon,
  LoaderCircle,
  RefreshCw,
  Search,
  XCircle,
} from 'lucide-vue-next'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import JobOutputsModal from '../components/JobOutputsModal.vue'
import UiPaginatedCardGrid from '../components/ui/UiPaginatedCardGrid.vue'
import UiPreviewCard from '../components/ui/UiPreviewCard.vue'
import { apiJson } from './home/homeApi'
import {
  formatCountWithLabel,
  formatPromptIdShort,
  getJobEntryAggregateState,
  getJobEntryElapsedMs,
  getJobEntryPreviewOutputs,
  getJobEntryPrimaryLabel,
  getJobEntryReferenceLabel,
  getJobEntrySecondaryLabel,
  getJobEntryStateLabel,
  getJobEntryTab,
  groupJobResponses,
} from './home/homeJobHelpers'
import type {
  CancelQueuedJobsResponse,
  JobListEntry,
  JobListResponse,
  JobOutput,
  JobResponse,
  JobState,
} from './home/homeTypes'

const PAGE_SIZE = 40

const stateFilters = [
  { label: 'All', value: 'all' },
  { label: 'Running', value: 'running' },
  { label: 'Queued', value: 'queued' },
  { label: 'History', value: 'history' },
] as const

type JobStateFilter = (typeof stateFilters)[number]['value']

const jobs = ref<JobResponse[]>([])
const loading = ref(false)
const cancellingQueued = ref(false)
const error = ref('')
const query = ref('')
const stateFilter = ref<JobStateFilter>('all')
const currentPage = ref(1)
const selectedJob = ref<JobResponse | null>(null)
let refreshTimer: number | undefined

const sortedJobs = computed(() => {
  return [...jobs.value].sort((left, right) => (right.updatedAt ?? 0) - (left.updatedAt ?? 0))
})

const jobEntries = computed(() => groupJobResponses(sortedJobs.value))

const filteredJobEntries = computed(() => {
  const search = query.value.trim().toLowerCase()
  return jobEntries.value.filter((entry) => {
    if (stateFilter.value !== 'all' && getJobEntryTab(entry) !== stateFilter.value) {
      return false
    }

    if (!search) {
      return true
    }

    return getJobEntrySearchText(entry).includes(search)
  })
})

const pageCount = computed(() => Math.max(1, Math.ceil(filteredJobEntries.value.length / PAGE_SIZE)))
const pageStart = computed(() => (currentPage.value - 1) * PAGE_SIZE)
const pageEnd = computed(() => pageStart.value + PAGE_SIZE)
const pagedJobEntries = computed(() => filteredJobEntries.value.slice(pageStart.value, pageEnd.value))
const visibleRangeLabel = computed(() => {
  if (!filteredJobEntries.value.length) {
    return '0 of 0'
  }

  return `${pageStart.value + 1}-${Math.min(pageEnd.value, filteredJobEntries.value.length)} of ${
    filteredJobEntries.value.length
  }`
})
const stateCounts = computed(() => ({
  all: jobEntries.value.length,
  running: jobEntries.value.filter((entry) => getJobEntryTab(entry) === 'running').length,
  queued: jobEntries.value.filter((entry) => getJobEntryTab(entry) === 'queued').length,
  history: jobEntries.value.filter((entry) => getJobEntryTab(entry) === 'history').length,
}))

watch([query, stateFilter], () => {
  currentPage.value = 1
})

watch(pageCount, (nextPageCount) => {
  currentPage.value = Math.min(currentPage.value, nextPageCount)
})

async function refreshJobs() {
  loading.value = true
  error.value = ''
  try {
    const payload = await apiJson<JobListResponse>('/api/jobs', { method: 'GET' })
    jobs.value = Array.isArray(payload.jobs) ? payload.jobs : []
  } catch (caughtError) {
    error.value = caughtError instanceof Error ? caughtError.message : 'Could not load generation jobs.'
  } finally {
    loading.value = false
  }
}

async function cancelQueuedJobs() {
  if (cancellingQueued.value || stateCounts.value.queued === 0) {
    return
  }

  cancellingQueued.value = true
  error.value = ''

  try {
    await apiJson<CancelQueuedJobsResponse>('/api/jobs/queued/cancel', { method: 'POST' })
    await refreshJobs()
  } catch (caughtError) {
    error.value = caughtError instanceof Error ? caughtError.message : 'Could not cancel queued generation jobs.'
  } finally {
    cancellingQueued.value = false
  }
}

function stateToneClass(state: JobState) {
  if (state === 'complete') {
    return 'border-secondary/45 bg-secondary/10 text-secondary'
  }

  if (state === 'error' || state === 'cancelled') {
    return 'border-destructive/45 bg-destructive/10 text-destructive'
  }

  if (state === 'queued') {
    return 'border-accent/35 bg-accent/10 text-accent'
  }

  return 'border-secondary/35 bg-secondary/10 text-secondary'
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

function formatDuration(elapsedMs: number) {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`
}

function getJobEntrySearchText(entry: JobListEntry) {
  return [
    entry.batchId,
    ...entry.promptIds,
    getJobEntryPrimaryLabel(entry),
    getJobEntrySecondaryLabel(entry),
    getJobEntryReferenceLabel(entry),
    ...entry.jobs.flatMap((job) => [
      job.promptId,
      job.batchId,
      job.checkpoint,
      job.currentNodeLabel,
      job.error,
      ...job.promptVariants.flatMap((variant) => [variant.label, variant.promptText]),
      ...job.outputs.flatMap((output) => [
        output.filename,
        output.fullPath,
        output.variantLabel,
        output.promptText,
      ]),
    ]),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

function entryTitle(entry: JobListEntry) {
  return entry.jobs.length > 1 ? getJobEntryPrimaryLabel(entry) : entry.leadJob.promptId
}

function entrySubtitle(entry: JobListEntry) {
  return entry.jobs.length > 1 ? getJobEntrySecondaryLabel(entry) : ''
}

function entryReference(entry: JobListEntry) {
  return entry.jobs.length > 1 ? getJobEntryReferenceLabel(entry) : ''
}

function entryAriaLabel(entry: JobListEntry) {
  return `Open outputs for generation ${entry.batchId ? 'batch' : 'job'} ${
    entry.batchId ?? entry.leadJob.promptId
  }`
}

function outputPreview(entry: JobListEntry) {
  return getJobEntryPreviewOutputs(entry)[0]?.url ?? ''
}

function outputPreviewLabel(entry: JobListEntry) {
  return `${entryTitle(entry)} output preview`
}

function entryOutputCount(entry: JobListEntry) {
  return entry.jobs.reduce((total, job) => total + job.outputs.length, 0)
}

function entryUpdatedAt(entry: JobListEntry) {
  return Math.max(...entry.jobs.map((job) => job.updatedAt ?? 0), 0)
}

function stateCount(filter: JobStateFilter) {
  return stateCounts.value[filter]
}

function goToPage(page: number) {
  currentPage.value = Math.max(1, Math.min(page, pageCount.value))
}

function openJobOutputs(entry: JobListEntry) {
  selectedJob.value = buildJobEntryModalJob(entry)
}

function closeJobOutputs() {
  selectedJob.value = null
}

function buildJobEntryModalJob(entry: JobListEntry): JobResponse {
  if (entry.jobs.length === 1) {
    return entry.leadJob
  }

  const outputs = entry.jobs.flatMap((job) => {
    const checkpointName = formatModalCheckpointName(job.checkpoint)
    return job.outputs.map((output) => ({
      ...output,
      variantLabel: formatModalOutputLabel(checkpointName, output),
    }))
  })
  const errors = entry.jobs.map((job) => job.error?.trim()).filter((value): value is string => Boolean(value))

  return {
    ...entry.leadJob,
    promptId: entry.batchId ? `Batch ${formatPromptIdShort(entry.batchId)}` : entry.leadJob.promptId,
    batchId: entry.batchId,
    batchIndex: null,
    state: getJobEntryAggregateState(entry),
    checkpoint: getJobEntryPrimaryLabel(entry),
    currentNodeLabel: getJobEntrySecondaryLabel(entry),
    outputs,
    error: errors.length ? errors.join(' • ') : null,
    elapsedMs: getJobEntryElapsedMs(entry),
    createdAt: Math.min(...entry.jobs.map((job) => job.createdAt)),
    updatedAt: entryUpdatedAt(entry),
    queuePosition: null,
    queueNumber: null,
    cancelRequested: entry.jobs.some((job) => job.cancelRequested),
  }
}

function formatModalCheckpointName(checkpointName: string | null | undefined) {
  return checkpointName?.replace(/\.(safetensors|ckpt|pt)$/i, '').trim() || 'Workflow'
}

function formatModalOutputLabel(checkpointName: string, output: JobOutput) {
  const outputLabel = output.variantLabel?.trim()
  return outputLabel ? `${checkpointName} · ${outputLabel}` : checkpointName
}

onMounted(() => {
  void refreshJobs()
  refreshTimer = window.setInterval(() => {
    void refreshJobs()
  }, 3000)
})

onBeforeUnmount(() => {
  window.clearInterval(refreshTimer)
})
</script>

<template>
  <main class="flex h-full min-h-0 flex-col bg-background text-foreground">
    <section class="border-b border-border bg-card/82 px-4 py-3 sm:px-6">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="min-w-0">
          <h1 class="text-base font-semibold tracking-normal">Generation jobs</h1>
          <p class="mt-1 text-xs text-muted-foreground">
            {{ stateCounts.running }} running, {{ stateCounts.queued }} queued, {{ stateCounts.history }} history
          </p>
        </div>

        <div class="flex items-center gap-2">
          <button
            v-if="stateCounts.queued > 0"
            class="inline-flex h-9 items-center gap-2 rounded-md border border-destructive/45 bg-destructive/10 px-3 text-xs font-semibold text-destructive transition hover:bg-destructive/16 focus:outline-none focus:ring-2 focus:ring-ring/25 disabled:cursor-wait disabled:opacity-60"
            type="button"
            :disabled="loading || cancellingQueued"
            @click="cancelQueuedJobs"
          >
            <LoaderCircle
              v-if="cancellingQueued"
              class="h-4 w-4 animate-spin"
            />
            <XCircle
              v-else
              class="h-4 w-4"
            />
            Cancel queued ({{ stateCounts.queued }})
          </button>

          <button
            class="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-background px-3 text-xs font-semibold text-card-foreground transition hover:border-secondary/60 hover:text-secondary focus:outline-none focus:ring-2 focus:ring-ring/25 disabled:cursor-wait disabled:opacity-60"
            type="button"
            :disabled="loading"
            @click="refreshJobs"
          >
            <LoaderCircle
              v-if="loading"
              class="h-4 w-4 animate-spin"
            />
            <RefreshCw
              v-else
              class="h-4 w-4"
            />
            Refresh
          </button>
        </div>
      </div>

      <div class="mt-3 flex flex-wrap items-center gap-2">
        <label class="relative min-w-[16rem] flex-1 sm:max-w-md">
          <span class="sr-only">Search generation jobs</span>
          <Search class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            v-model="query"
            class="h-9 w-full rounded-md border border-input bg-primary px-9 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-accent focus:ring-2 focus:ring-ring/25"
            type="search"
            placeholder="Search prompt, checkpoint, output, prompt id"
          >
        </label>

        <div
          class="flex h-9 overflow-hidden rounded-md border border-border"
          role="group"
          aria-label="Generation job state filter"
        >
          <button
            v-for="option in stateFilters"
            :key="option.value"
            class="border-r border-border px-3 text-xs font-semibold last:border-r-0"
            :class="stateFilter === option.value ? 'bg-secondary text-secondary-foreground' : 'bg-background text-muted-foreground hover:bg-accent/10 hover:text-accent'"
            type="button"
            @click="stateFilter = option.value"
          >
            {{ option.label }}
            <span class="ml-2 rounded-sm border border-primary-foreground/14 bg-background px-1.5 py-0.5 text-[10px] leading-none text-primary-foreground">
              {{ stateCount(option.value) }}
            </span>
          </button>
        </div>
      </div>

      <p
        v-if="error"
        class="mt-3 inline-flex items-center gap-2 rounded-sm border border-destructive/45 bg-destructive/16 px-3 py-2 text-xs font-semibold text-destructive"
      >
        <AlertCircle class="h-4 w-4" />
        {{ error }}
      </p>
    </section>

    <UiPaginatedCardGrid
      :items-present="pagedJobEntries.length > 0"
      :range-label="visibleRangeLabel"
      :current-page="currentPage"
      :page-count="pageCount"
      previous-label="Previous generation jobs page"
      next-label="Next generation jobs page"
      grid-class="grid grid-cols-2 gap-3 pb-4 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-10"
      @go-to-page="goToPage"
    >
      <UiPreviewCard
        v-for="entry in pagedJobEntries"
        :key="entry.key"
        tag="button"
        :aria-label="entryAriaLabel(entry)"
        :preview-url="outputPreview(entry)"
        :preview-label="outputPreviewLabel(entry)"
        min-height-class="min-h-[13rem]"
        media-class="h-36"
        body-class="p-2"
        @click="openJobOutputs(entry)"
      >
        <template #placeholder>
          <ImageIcon class="h-8 w-8 text-primary-foreground/35" />
          <span class="text-xs font-semibold uppercase tracking-[0.16em] text-primary-foreground/68">
            No output preview
          </span>
        </template>

        <template #media-overlay>
          <span
            class="absolute right-3 top-3 rounded-sm border px-2 py-1 text-[11px] font-semibold shadow-sm backdrop-blur-sm"
            :class="stateToneClass(getJobEntryAggregateState(entry))"
          >
            {{ getJobEntryStateLabel(entry) }}
          </span>
        </template>

        <p
          class="truncate text-[11px]"
          :class="entry.jobs.length > 1 ? 'font-semibold text-card-foreground' : 'font-mono text-muted-foreground'"
          :title="entryTitle(entry)"
        >
          {{ entryTitle(entry) }}
        </p>
        <p
          v-if="entrySubtitle(entry)"
          class="mt-1 truncate text-[11px] text-muted-foreground"
          :title="entrySubtitle(entry)"
        >
          {{ entrySubtitle(entry) }}
        </p>
        <p
          v-if="entryReference(entry)"
          class="mt-1 truncate font-mono text-[11px] text-muted-foreground"
          :title="entry.batchId ?? undefined"
        >
          {{ entryReference(entry) }}
        </p>
        <div class="mt-auto grid grid-cols-3 gap-2 border-t border-border/70 pt-2 text-[11px] text-muted-foreground">
          <span class="truncate">
            {{ formatCountWithLabel(entryOutputCount(entry), 'output') }}
          </span>
          <span class="truncate">
            {{ formatDuration(getJobEntryElapsedMs(entry)) }}
          </span>
          <span
            class="truncate text-right"
            :title="formatDate(entryUpdatedAt(entry))"
          >
            {{ formatDate(entryUpdatedAt(entry)) }}
          </span>
        </div>
      </UiPreviewCard>

      <template #empty>
        No generation jobs match the current filters.
      </template>
    </UiPaginatedCardGrid>

    <JobOutputsModal
      :open="Boolean(selectedJob)"
      :job="selectedJob"
      @close="closeJobOutputs"
    />
  </main>
</template>
