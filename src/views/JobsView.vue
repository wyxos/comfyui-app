<script setup lang="ts">
import {
  AlertCircle,
  Image as ImageIcon,
  LoaderCircle,
  RefreshCw,
  Search,
} from 'lucide-vue-next'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import JobOutputsModal from '../components/JobOutputsModal.vue'
import UiPaginatedCardGrid from '../components/ui/UiPaginatedCardGrid.vue'
import UiPreviewCard from '../components/ui/UiPreviewCard.vue'
import { apiJson } from './home/homeApi'
import type { JobListResponse, JobResponse, JobState } from './home/homeTypes'

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
const error = ref('')
const query = ref('')
const stateFilter = ref<JobStateFilter>('all')
const currentPage = ref(1)
const selectedJob = ref<JobResponse | null>(null)
let refreshTimer: number | undefined

const sortedJobs = computed(() => {
  return [...jobs.value].sort((left, right) => (right.updatedAt ?? 0) - (left.updatedAt ?? 0))
})

const filteredJobs = computed(() => {
  const search = query.value.trim().toLowerCase()
  return sortedJobs.value.filter((job) => {
    if (stateFilter.value !== 'all' && stateGroup(job.state) !== stateFilter.value) {
      return false
    }

    if (!search) {
      return true
    }

    return [
      job.promptId,
      job.batchId,
      job.checkpoint,
      job.currentNodeLabel,
      job.error,
      ...job.promptVariants.map((variant) => variant.promptText),
      ...job.outputs.map((output) => output.filename),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(search)
  })
})

const pageCount = computed(() => Math.max(1, Math.ceil(filteredJobs.value.length / PAGE_SIZE)))
const pageStart = computed(() => (currentPage.value - 1) * PAGE_SIZE)
const pageEnd = computed(() => pageStart.value + PAGE_SIZE)
const pagedJobs = computed(() => filteredJobs.value.slice(pageStart.value, pageEnd.value))
const visibleRangeLabel = computed(() => {
  if (!filteredJobs.value.length) {
    return '0 of 0'
  }

  return `${pageStart.value + 1}-${Math.min(pageEnd.value, filteredJobs.value.length)} of ${filteredJobs.value.length}`
})
const stateCounts = computed(() => ({
  all: sortedJobs.value.length,
  running: sortedJobs.value.filter((job) => stateGroup(job.state) === 'running').length,
  queued: sortedJobs.value.filter((job) => stateGroup(job.state) === 'queued').length,
  history: sortedJobs.value.filter((job) => stateGroup(job.state) === 'history').length,
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

function stateGroup(state: JobState): Exclude<JobStateFilter, 'all'> {
  if (state === 'running' || state === 'cancelling') {
    return 'running'
  }

  if (state === 'queued') {
    return 'queued'
  }

  return 'history'
}

function stateLabel(state: JobState) {
  if (state === 'cancelling') {
    return 'Cancelling'
  }

  return state.charAt(0).toUpperCase() + state.slice(1)
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

function outputPreview(job: JobResponse) {
  return job.outputs[0]?.url ?? ''
}

function stateCount(filter: JobStateFilter) {
  return stateCounts.value[filter]
}

function goToPage(page: number) {
  currentPage.value = Math.max(1, Math.min(page, pageCount.value))
}

function openJobOutputs(job: JobResponse) {
  selectedJob.value = job
}

function closeJobOutputs() {
  selectedJob.value = null
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
      :items-present="pagedJobs.length > 0"
      :range-label="visibleRangeLabel"
      :current-page="currentPage"
      :page-count="pageCount"
      previous-label="Previous generation jobs page"
      next-label="Next generation jobs page"
      grid-class="grid grid-cols-2 gap-3 pb-4 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-10"
      @go-to-page="goToPage"
    >
      <UiPreviewCard
        v-for="job in pagedJobs"
        :key="job.promptId"
        tag="button"
        :aria-label="`Open outputs for generation job ${job.promptId}`"
        :preview-url="outputPreview(job)"
        :preview-label="`${job.promptId} output preview`"
        min-height-class="min-h-[13rem]"
        media-class="h-36"
        body-class="p-2"
        @click="openJobOutputs(job)"
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
            :class="stateToneClass(job.state)"
          >
            {{ stateLabel(job.state) }}
          </span>
        </template>

        <p
          class="truncate font-mono text-[11px] text-muted-foreground"
          :title="job.promptId"
        >
          {{ job.promptId }}
        </p>
        <div class="mt-auto grid grid-cols-3 gap-2 border-t border-border/70 pt-2 text-[11px] text-muted-foreground">
          <span class="truncate">
            {{ job.outputs.length }} output{{ job.outputs.length === 1 ? '' : 's' }}
          </span>
          <span class="truncate">
            {{ formatDuration(job.elapsedMs) }}
          </span>
          <span
            class="truncate text-right"
            :title="formatDate(job.updatedAt)"
          >
            {{ formatDate(job.updatedAt) }}
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
