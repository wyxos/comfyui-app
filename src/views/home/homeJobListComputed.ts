import { computed } from 'vue'
import {
  getJobEntryTab,
} from './homeJobHelpers'
import type { HomePreviewComputed } from './homePreviewComputed'
import type { HomeSelectionComputed } from './homeSelectionComputed'
import type { HomeState } from './homeState'
import type { JobListEntry, JobResponse } from './homeTypes'
import type { HomeStatusComputed } from './homeStatusComputed'

export function createHomeJobListComputed(
  state: HomeState,
  selection: HomeSelectionComputed,
  preview: HomePreviewComputed,
  status: HomeStatusComputed,
) {
const {
  isImprovingPrompt,
  isUploadingInputImage,
  jobListTab,
  jobsList,
  loadingCheckpoints,
  uploadedInputImageName,
} = state
const {
  controlNetGenerationBlocker,
  enabledCheckpointEntries,
  requestedPromptVariants,
  selectedJob,
  shouldUseInputImage,
} = selection
void preview
const { improvePromptDisabledReason } = status

const jobListEntries = computed<JobListEntry[]>(() => {
  const jobsByBatchId = new Map<string, JobResponse[]>()
  for (const job of jobsList.value) {
    const batchId = job.batchId?.trim()
    if (!batchId) {
      continue
    }

    const groupedJobs = jobsByBatchId.get(batchId) ?? []
    groupedJobs.push(job)
    jobsByBatchId.set(batchId, groupedJobs)
  }

  const consumedBatchIds = new Set<string>()
  const entries: JobListEntry[] = []

  for (const job of jobsList.value) {
    const batchId = job.batchId?.trim()
    const groupedJobs = batchId ? jobsByBatchId.get(batchId) ?? [] : []
    if (batchId && groupedJobs.length > 1) {
      if (consumedBatchIds.has(batchId)) {
        continue
      }

      consumedBatchIds.add(batchId)
      const orderedJobs = [...groupedJobs].sort((leftJob, rightJob) => {
        const leftIndex = leftJob.batchIndex ?? Number.MAX_SAFE_INTEGER
        const rightIndex = rightJob.batchIndex ?? Number.MAX_SAFE_INTEGER
        if (leftIndex !== rightIndex) {
          return leftIndex - rightIndex
        }

        return leftJob.createdAt - rightJob.createdAt
      })

      entries.push({
        key: `batch:${batchId}`,
        batchId,
        promptIds: orderedJobs.map((entry) => entry.promptId),
        jobs: orderedJobs,
        leadJob: orderedJobs[0],
      })
      continue
    }

    entries.push({
      key: `job:${job.promptId}`,
      batchId: null,
      promptIds: [job.promptId],
      jobs: [job],
      leadJob: job,
    })
  }

  return entries
})
const runningJobEntries = computed(() => {
  return jobListEntries.value.filter((entry) => getJobEntryTab(entry) === 'running')
})
const queuedJobEntries = computed(() => {
  return jobListEntries.value.filter((entry) => getJobEntryTab(entry) === 'queued')
})
const historyJobEntries = computed(() => {
  return jobListEntries.value.filter((entry) => getJobEntryTab(entry) === 'history')
})
const jobListTabs = computed(() => {
  return [
    {
      value: 'running' as const,
      label: 'Running',
      count: runningJobEntries.value.length,
    },
    {
      value: 'queued' as const,
      label: 'Queued',
      count: queuedJobEntries.value.length,
    },
    {
      value: 'history' as const,
      label: 'History',
      count: historyJobEntries.value.length,
    },
  ]
})
const visibleJobEntries = computed(() => {
  if (jobListTab.value === 'queued') {
    return queuedJobEntries.value
  }

  if (jobListTab.value === 'history') {
    return historyJobEntries.value
  }

  return runningJobEntries.value
})
const visibleJobsEmptyState = computed(() => {
  if (!jobsList.value.length) {
    return 'No jobs submitted yet.'
  }

  if (jobListTab.value === 'queued') {
    return 'No workflows are waiting in the queue.'
  }

  if (jobListTab.value === 'history') {
    return 'Completed, failed, and cancelled workflows appear here.'
  }

  return 'No workflows are currently running.'
})
const canImprovePrompt = computed(() => {
  return !isImprovingPrompt.value && !improvePromptDisabledReason.value
})
const generateDisabledReason = computed(() => {
  if (loadingCheckpoints.value) {
    return 'Checkpoints are still loading.'
  }

  if (enabledCheckpointEntries.value.length === 0) {
    return 'Add and enable at least one checkpoint.'
  }

  if (shouldUseInputImage.value && isUploadingInputImage.value) {
    return 'Input image is still uploading.'
  }

  if (shouldUseInputImage.value && !uploadedInputImageName.value) {
    return 'Wait for the input image upload to finish.'
  }

  if (controlNetGenerationBlocker.value) {
    return controlNetGenerationBlocker.value
  }

  if (!requestedPromptVariants.value.length) {
    return 'Add prompt text or an improved prompt before generating.'
  }

  return ''
})
const canGenerate = computed(() => {
  return !generateDisabledReason.value
})
const canCancelSelectedJob = computed(() => {
  return Boolean(
    selectedJob.value &&
      (selectedJob.value.state === 'queued' ||
        selectedJob.value.state === 'running' ||
        selectedJob.value.state === 'cancelling'),
  )
})

return {
  jobListEntries,
  runningJobEntries,
  queuedJobEntries,
  historyJobEntries,
  jobListTabs,
  visibleJobEntries,
  visibleJobsEmptyState,
  canImprovePrompt,
  generateDisabledReason,
  canGenerate,
  canCancelSelectedJob,
}
}

export type HomeJobListComputed = ReturnType<typeof createHomeJobListComputed>
