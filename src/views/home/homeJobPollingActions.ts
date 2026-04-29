import { createEmptyQueueSummary } from './homeConstants'
import { getJobListTabForState, isLiveJobState } from './homeJobHelpers'
import type { HomeJobListComputed } from './homeJobListComputed'
import type { HomePreviewComputed } from './homePreviewComputed'
import type { HomeSelectionComputed } from './homeSelectionComputed'
import type { HomeState } from './homeState'
import type { HomeStatusComputed } from './homeStatusComputed'
import type { JobListEntry, JobListResponse, JobListTab, JobResponse } from './homeTypes'

type HomeJobPollingDeps = {
  apiJson: <T>(path: string, init?: RequestInit & { timeoutMs?: number }) => Promise<T>
  formatElapsed: (elapsedMs: number) => string
  setIdleState: (message?: string) => void
  syncBatchPreviewState: (job: JobResponse | null) => void
}

export function createHomeJobPollingActions(
  state: HomeState,
  selection: HomeSelectionComputed,
  preview: HomePreviewComputed,
  status: HomeStatusComputed,
  jobList: HomeJobListComputed,
  deps: HomeJobPollingDeps,
) {
const {
  activeBatchCheckpoints,
  activeBatchId,
  activeBatchPromptIds,
  activePreviewIndex,
  activePromptId,
  batchPreviewMode,
  copiedOutputPath,
  currentNodeLabel,
  currentSeed,
  detailLine,
  errorMessage,
  isSubmittingGenerate,
  jobListTab,
  jobState,
  jobsList,
  lastGeneratedSeed,
  loadingError,
  pendingSubmittedCheckpoints,
  pendingSubmittedVariants,
  previewOutputs,
  progressMax,
  progressPercent,
  progressValue,
  queueSummary,
  statusLine,
  submissionError,
} = state
const { selectedJob } = selection
const { previewDisplayItems } = preview
const { queueSummaryText } = status
const { visibleJobEntries } = jobList
const { apiJson, formatElapsed, setIdleState, syncBatchPreviewState } = deps
let pollTimer: number | null = null

function clearPolling() {
  if (pollTimer !== null) {
    window.clearInterval(pollTimer)
    pollTimer = null
  }
}

function applySelectedJobState(job: JobResponse | null) {
  if (!job) {
    previewOutputs.value = []
    currentNodeLabel.value = ''
    currentSeed.value = null
    progressValue.value = null
    progressMax.value = null
    progressPercent.value = null
    jobState.value = 'idle'
    errorMessage.value = submissionError.value

    if (submissionError.value) {
      statusLine.value = 'Failed'
      detailLine.value = 'Submission failed.'
      return
    }

    if (loadingError.value) {
      statusLine.value = 'Unavailable'
      detailLine.value = loadingError.value
      return
    }

    if (isSubmittingGenerate.value) {
      statusLine.value = 'Submitting'
      detailLine.value = 'Submitting workflow to ComfyUI.'
      return
    }

    setIdleState(queueSummary.value.unavailable ? queueSummaryText.value : 'Waiting for a prompt.')
    return
  }

  if (!batchPreviewMode.value) {
    pendingSubmittedVariants.value = []
    pendingSubmittedCheckpoints.value = []
    activeBatchId.value = ''
    activeBatchPromptIds.value = []
    activeBatchCheckpoints.value = []
  }
  jobState.value = job.state
  currentNodeLabel.value = job.currentNodeLabel ?? ''
  currentSeed.value = job.seed
  progressValue.value = job.progressValue
  progressMax.value = job.progressMax
  progressPercent.value = job.progressPercent
  errorMessage.value = job.error ?? ''
  previewOutputs.value = Array.isArray(job.outputs) ? job.outputs : []
  activePreviewIndex.value = previewDisplayItems.value.length
    ? Math.min(activePreviewIndex.value, previewDisplayItems.value.length - 1)
    : 0

  if (job.state === 'queued') {
    statusLine.value = 'Queued'
    detailLine.value =
      job.queuePosition !== null
        ? `Queue position ${job.queuePosition} • ${formatElapsed(job.elapsedMs)}`
        : `Waiting in ComfyUI • ${formatElapsed(job.elapsedMs)}`
    return
  }

  if (job.state === 'running') {
    statusLine.value = 'Generating'
    if (job.progressPercent !== null && job.progressValue !== null && job.progressMax !== null) {
      detailLine.value = `${job.currentNodeLabel ?? 'Sampling'} ${job.progressValue}/${job.progressMax} • ${formatElapsed(job.elapsedMs)}`
    } else {
      detailLine.value = `${job.currentNodeLabel ?? 'Running'} • ${formatElapsed(job.elapsedMs)}`
    }
    return
  }

  if (job.state === 'cancelling') {
    statusLine.value = 'Cancelling'
    detailLine.value = `Attempting to cancel this workflow • ${formatElapsed(job.elapsedMs)}`
    return
  }

  if (job.state === 'cancelled') {
    statusLine.value = 'Cancelled'
    detailLine.value = `Cancelled after ${formatElapsed(job.elapsedMs)}`
    return
  }

  if (job.state === 'complete') {
    if (job.seed !== null) {
      lastGeneratedSeed.value = job.seed
    }

    statusLine.value = 'Complete'
    if (previewOutputs.value.length > 0) {
      detailLine.value = `Generated ${previewOutputs.value.length} output${previewOutputs.value.length === 1 ? '' : 's'} • ${formatElapsed(job.elapsedMs)}`
    } else {
      detailLine.value = `Finished in ${formatElapsed(job.elapsedMs)}`
    }
    return
  }

  if (job.state === 'error') {
    statusLine.value = 'Failed'
    detailLine.value = job.currentNodeLabel ?? 'Generation failed.'
    return
  }

  setIdleState()
}

async function refreshJobs() {
  const payload = await apiJson<JobListResponse>('/api/jobs', {
    method: 'GET',
  })

  const previousSelectedState = selectedJob.value?.state ?? null
  const previousJobsByPromptId = new Map(jobsList.value.map((job) => [job.promptId, job]))
  let forcedJobListTab: JobListTab | null = null
  jobsList.value = Array.isArray(payload.jobs) ? payload.jobs : []
  queueSummary.value = payload.queue ?? createEmptyQueueSummary()

  const promotedRunningJob =
    jobsList.value.find((job) => {
      const previousState = previousJobsByPromptId.get(job.promptId)?.state ?? null
      return previousState === 'queued' && isLiveJobState(job.state)
    }) ?? null

  if (promotedRunningJob) {
    activePromptId.value = promotedRunningJob.promptId
    forcedJobListTab = 'running'
  } else if (!jobsList.value.length) {
    if (!pendingSubmittedVariants.value.length && !isSubmittingGenerate.value) {
      activePromptId.value = ''
    }
  } else if (
    !jobsList.value.some((job) => job.promptId === activePromptId.value) &&
    (!activePromptId.value || (!pendingSubmittedVariants.value.length && !isSubmittingGenerate.value))
  ) {
    activePromptId.value = jobsList.value[0].promptId
  }

  syncBatchPreviewState(selectedJob.value)
  applySelectedJobState(selectedJob.value)

  if (forcedJobListTab) {
    jobListTab.value = forcedJobListTab
    return
  }

  if (selectedJob.value?.state && !previousSelectedState && !visibleJobEntries.value.length) {
    jobListTab.value = getJobListTabForState(selectedJob.value.state)
  }

  if (selectedJob.value?.state && previousSelectedState && selectedJob.value.state !== previousSelectedState) {
    jobListTab.value = getJobListTabForState(selectedJob.value.state)
  }
}

async function pollJobs() {
  try {
    await refreshJobs()
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not read generation status.'
    queueSummary.value = {
      ...createEmptyQueueSummary(),
      unavailable: true,
      error: message,
    }

    if (selectedJob.value) {
      errorMessage.value = message
    } else {
      statusLine.value = 'Unavailable'
      detailLine.value = message
    }
  }
}

function startPolling() {
  clearPolling()
  void pollJobs()
  pollTimer = window.setInterval(() => {
    void pollJobs()
  }, 1200)
}

function selectJob(promptId: string) {
  if (!promptId || (activePromptId.value === promptId && !batchPreviewMode.value)) {
    return
  }

  activePromptId.value = promptId
  syncBatchPreviewState(selectedJob.value)
  activePreviewIndex.value = 0
  copiedOutputPath.value = false
  if (selectedJob.value) {
    jobListTab.value = getJobListTabForState(selectedJob.value.state)
  }
  applySelectedJobState(selectedJob.value)
}

function selectJobEntry(entry: JobListEntry) {
  const promptId =
    activePromptId.value && entry.promptIds.includes(activePromptId.value)
      ? activePromptId.value
      : entry.promptIds[0] ?? entry.leadJob.promptId
  selectJob(promptId)
}

return {
  clearPolling,
  applySelectedJobState,
  refreshJobs,
  pollJobs,
  startPolling,
  selectJob,
  selectJobEntry,
}
}

export type HomeJobPollingActions = ReturnType<typeof createHomeJobPollingActions>
