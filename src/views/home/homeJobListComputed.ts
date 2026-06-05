import { computed } from 'vue'
import {
  getJobEntryTab,
  groupJobResponses,
} from './homeJobHelpers'
import type { HomePreviewComputed } from './homePreviewComputed'
import type { HomeSelectionComputed } from './homeSelectionComputed'
import type { HomeState } from './homeState'
import type { JobListEntry } from './homeTypes'
import type { HomeStatusComputed } from './homeStatusComputed'

export function createHomeJobListComputed(
  state: HomeState,
  selection: HomeSelectionComputed,
  preview: HomePreviewComputed,
  status: HomeStatusComputed,
) {
  const {
    isUploadingInputImage,
    jobCounts,
    jobHistory,
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
  void status

  const jobListEntries = computed<JobListEntry[]>(() => groupJobResponses(jobsList.value))
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
        count: jobCounts.value.running,
      },
      {
        value: 'queued' as const,
        label: 'Queued',
        count: jobCounts.value.queued,
      },
      {
        value: 'history' as const,
        label: 'History',
        count: jobCounts.value.history,
      },
    ]
  })
  const historyPageRangeLabel = computed(() => {
    if (!jobHistory.value.totalItems) {
      return '0 of 0'
    }

    const pageStart = (jobHistory.value.page - 1) * jobHistory.value.pageSize + 1
    const pageEnd = Math.min(jobHistory.value.page * jobHistory.value.pageSize, jobHistory.value.totalItems)
    return `${pageStart}-${pageEnd} of ${jobHistory.value.totalItems}`
  })
  const canGoPreviousHistoryPage = computed(() => jobHistory.value.page > 1)
  const canGoNextHistoryPage = computed(() => jobHistory.value.page < jobHistory.value.totalPages)
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
      return jobCounts.value.history
        ? 'No workflows found on this history page.'
        : 'Completed, failed, and cancelled workflows appear here.'
    }

    return 'No workflows are currently running.'
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
      return 'Add prompt text before generating.'
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
    historyPageRangeLabel,
    canGoPreviousHistoryPage,
    canGoNextHistoryPage,
    visibleJobEntries,
    visibleJobsEmptyState,
    generateDisabledReason,
    canGenerate,
    canCancelSelectedJob,
  }
}

export type HomeJobListComputed = ReturnType<typeof createHomeJobListComputed>
