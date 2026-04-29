import { JOB_ENTRY_PREVIEW_OUTPUT_LIMIT } from './homeConstants'
import type { JobListEntry, JobListTab, JobOutput, JobResponse, JobState } from './homeTypes'
import { coerceTrimmedFieldString } from './homeValueHelpers'

function formatPreviewCheckpointName(checkpointName: string | null) {
  if (!checkpointName) {
    return ''
  }

  return checkpointName.replace(/\.(safetensors|ckpt|pt)$/i, '')
}

export function getJobPrimaryLabel(job: JobResponse) {
  return job.checkpoint || 'Workflow'
}

export function getJobVariantSummary(job: JobResponse) {
  const labels = job.promptVariants
    .map((variant) => variant?.label?.trim())
    .filter((value): value is string => Boolean(value))

  return labels.length ? labels.join(' + ') : 'Prompt variants'
}

export function getJobStateLabel(job: JobResponse) {
  if (job.state === 'queued') {
    return job.queuePosition !== null ? `Queued #${job.queuePosition}` : 'Queued'
  }

  if (job.state === 'running') {
    return 'Running'
  }

  if (job.state === 'cancelling') {
    return 'Cancelling'
  }

  if (job.state === 'cancelled') {
    return 'Cancelled'
  }

  if (job.state === 'complete') {
    return 'Complete'
  }

  if (job.state === 'error') {
    return 'Error'
  }

  return 'Idle'
}

export function isLiveJobState(state: JobState | null | undefined) {
  return state === 'running' || state === 'cancelling'
}

export function getJobSecondaryLabel(job: JobResponse) {
  if (job.state === 'queued') {
    return job.queuePosition !== null ? `Queue position ${job.queuePosition}` : 'Waiting in queue'
  }

  if (job.state === 'running') {
    if (job.progressPercent !== null) {
      return `${job.currentNodeLabel ?? 'Sampling'} • ${job.progressPercent}%`
    }

    return job.currentNodeLabel ?? 'Generating'
  }

  if (job.state === 'cancelling') {
    return 'Cancellation requested'
  }

  if (job.state === 'cancelled') {
    return 'Stopped before completion'
  }

  if (job.state === 'complete') {
    if (job.outputs.length > 1) {
      return `${job.outputs.length} outputs ready`
    }

    if (job.outputs.length === 1) {
      return '1 output ready'
    }

    return 'Completed'
  }

  if (job.state === 'error') {
    return job.error || 'Generation failed'
  }

  return 'Ready'
}

export function getUniqueTrimmedValues(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))]
}

export function formatCountWithLabel(count: number, singularLabel: string, pluralLabel = singularLabel) {
  return `${count} ${count === 1 ? singularLabel : pluralLabel}`
}

export function getJobEntryAggregateState(entry: JobListEntry): JobState {
  if (entry.jobs.some((job) => job.state === 'running')) {
    return 'running'
  }

  if (entry.jobs.some((job) => job.state === 'cancelling')) {
    return 'cancelling'
  }

  if (entry.jobs.some((job) => job.state === 'queued')) {
    return 'queued'
  }

  if (entry.jobs.some((job) => job.state === 'error')) {
    return 'error'
  }

  if (entry.jobs.some((job) => job.state === 'cancelled')) {
    return 'cancelled'
  }

  if (entry.jobs.some((job) => job.state === 'complete')) {
    return 'complete'
  }

  return entry.leadJob.state
}

export function getJobEntryTab(entry: JobListEntry): JobListTab {
  return getJobListTabForState(getJobEntryAggregateState(entry))
}

export function groupJobResponses(jobs: JobResponse[]): JobListEntry[] {
  const jobsByBatchId = new Map<string, JobResponse[]>()
  for (const job of jobs) {
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

  for (const job of jobs) {
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
}

export function isJobEntryActive(entry: JobListEntry, activePromptId = '') {
  return entry.promptIds.includes(activePromptId)
}

export function getJobEntryPrimaryLabel(entry: JobListEntry) {
  if (entry.jobs.length === 1) {
    return getJobPrimaryLabel(entry.leadJob)
  }

  const checkpointLabels = getUniqueTrimmedValues(
    entry.jobs.map((job) => formatPreviewCheckpointName(job.checkpoint) || job.checkpoint),
  )

  if (!checkpointLabels.length) {
    return getJobPrimaryLabel(entry.leadJob)
  }

  if (checkpointLabels.length === 1) {
    return checkpointLabels[0]
  }

  if (checkpointLabels.length === 2) {
    return `${checkpointLabels[0]} + ${checkpointLabels[1]}`
  }

  return `${checkpointLabels[0]} + ${checkpointLabels.length - 1} more`
}

export function getJobEntryVariantSummary(entry: JobListEntry) {
  if (entry.jobs.length === 1) {
    return getJobVariantSummary(entry.leadJob)
  }

  const variantSummary = getUniqueTrimmedValues(
    entry.jobs.flatMap((job) => job.promptVariants.map((variant) => variant?.label)),
  )
  const resolvedVariantSummary = variantSummary.length ? variantSummary.join(' + ') : 'Prompt variants'
  return `${formatCountWithLabel(entry.jobs.length, 'workflow', 'workflows')} • ${resolvedVariantSummary}`
}

export function getJobEntryStateLabel(entry: JobListEntry) {
  if (entry.jobs.length === 1) {
    return getJobStateLabel(entry.leadJob)
  }

  const states = [...new Set(entry.jobs.map((job) => job.state))]
  if (states.length > 1 && states.some((state) => state === 'error' || state === 'cancelled')) {
    return 'Mixed'
  }

  const aggregateState = getJobEntryAggregateState(entry)
  if (aggregateState === 'queued') {
    return 'Queued'
  }

  if (aggregateState === 'running') {
    return 'Running'
  }

  if (aggregateState === 'cancelling') {
    return 'Cancelling'
  }

  if (aggregateState === 'complete') {
    return 'Complete'
  }

  if (aggregateState === 'error') {
    return 'Failed'
  }

  if (aggregateState === 'cancelled') {
    return 'Cancelled'
  }

  return 'Idle'
}

export function getJobEntrySecondaryLabel(entry: JobListEntry) {
  if (entry.jobs.length === 1) {
    return getJobSecondaryLabel(entry.leadJob)
  }

  const runningCount = entry.jobs.filter((job) => job.state === 'running').length
  const cancellingCount = entry.jobs.filter((job) => job.state === 'cancelling').length
  const queuedCount = entry.jobs.filter((job) => job.state === 'queued').length
  const failedCount = entry.jobs.filter((job) => job.state === 'error').length
  const cancelledCount = entry.jobs.filter((job) => job.state === 'cancelled').length
  const outputsReady = entry.jobs.reduce((total, job) => total + job.outputs.length, 0)
  const segments: string[] = []

  if (runningCount) {
    segments.push(formatCountWithLabel(runningCount, 'running'))
  }

  if (cancellingCount) {
    segments.push(formatCountWithLabel(cancellingCount, 'cancelling'))
  }

  if (queuedCount) {
    segments.push(formatCountWithLabel(queuedCount, 'queued'))
  }

  if (outputsReady) {
    segments.push(formatCountWithLabel(outputsReady, 'output ready', 'outputs ready'))
  }

  if (failedCount) {
    segments.push(formatCountWithLabel(failedCount, 'failed'))
  }

  if (cancelledCount) {
    segments.push(formatCountWithLabel(cancelledCount, 'cancelled'))
  }

  return segments.length
    ? segments.join(' • ')
    : formatCountWithLabel(entry.jobs.length, 'workflow', 'workflows')
}

export function getJobEntryElapsedMs(entry: JobListEntry) {
  return Math.max(...entry.jobs.map((job) => job.elapsedMs), 0)
}

export function getJobEntryReferenceLabel(entry: JobListEntry) {
  if (entry.batchId && entry.jobs.length > 1) {
    return `Batch ${formatPromptIdShort(entry.batchId)}`
  }

  return formatPromptIdShort(entry.leadJob.promptId)
}

export function getJobEntryPreviewOutputs(entry: JobListEntry) {
  return entry.jobs
    .flatMap((job) => (Array.isArray(job.outputs) ? job.outputs : []))
    .filter((output) => Boolean(output.url))
}

export function getJobEntryPreviewVisibleOutputs(entry: JobListEntry) {
  return getJobEntryPreviewOutputs(entry).slice(0, JOB_ENTRY_PREVIEW_OUTPUT_LIMIT)
}

export function getJobEntryPreviewHiddenOutputCount(entry: JobListEntry) {
  return Math.max(0, getJobEntryPreviewOutputs(entry).length - JOB_ENTRY_PREVIEW_OUTPUT_LIMIT)
}

export function getJobEntryPreviewOutputKey(output: JobOutput, index: number) {
  return [output.variantId ?? index, output.type, output.subfolder, output.filename].join(':')
}

export function formatPromptIdShort(promptId: string) {
  if (!promptId) {
    return ''
  }

  if (promptId.length <= 16) {
    return promptId
  }

  return `${promptId.slice(0, 8)}...${promptId.slice(-6)}`
}

export function formatElapsedDuration(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  }

  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

export function getJobListTabForState(state: JobState): JobListTab {
  if (state === 'queued') {
    return 'queued'
  }

  if (state === 'running' || state === 'cancelling') {
    return 'running'
  }

  return 'history'
}

export function parseDimensionField(value: string, fallback: number) {
  const trimmedValue = coerceTrimmedFieldString(value)
  if (!trimmedValue) {
    return { value: fallback, usedFallback: true }
  }

  if (!/^-?\d+$/.test(trimmedValue)) {
    return { value: null, usedFallback: false }
  }

  const parsedValue = Number.parseInt(trimmedValue, 10)
  if (!Number.isSafeInteger(parsedValue)) {
    return { value: null, usedFallback: false }
  }

  return { value: parsedValue, usedFallback: false }
}

export function validateRequestedSize(widthValue: string, heightValue: string) {
  const parsedWidth = parseDimensionField(widthValue, 1024)
  const parsedHeight = parseDimensionField(heightValue, 1024)
  const resolvedWidth = parsedWidth.value
  const resolvedHeight = parsedHeight.value

  if (resolvedWidth === null || resolvedHeight === null) {
    return {
      isValid: false,
      tone: 'error' as const,
      message: 'Width and height must be whole numbers. Decimals trigger invalid size errors.',
      width: null,
      height: null,
    }
  }

  if (resolvedWidth < 64 || resolvedHeight < 64) {
    return {
      isValid: false,
      tone: 'error' as const,
      message: 'Width and height must be at least 64 px.',
      width: resolvedWidth,
      height: resolvedHeight,
    }
  }

  if (resolvedWidth > 16384 || resolvedHeight > 16384) {
    return {
      isValid: false,
      tone: 'error' as const,
      message: 'Width and height must stay at or below 16384 px.',
      width: resolvedWidth,
      height: resolvedHeight,
    }
  }

  if (resolvedWidth % 32 !== 0 || resolvedHeight % 32 !== 0) {
    return {
      isValid: true,
      tone: 'warning' as const,
      message: `${resolvedWidth} x ${resolvedHeight} will submit. Whole numbers are required, and multiples of 32 are still the safest choice.`,
      width: resolvedWidth,
      height: resolvedHeight,
    }
  }

  return {
    isValid: true,
    tone: 'neutral' as const,
    message: `${resolvedWidth} x ${resolvedHeight}. Whole numbers only, minimum 64 px.`,
    width: resolvedWidth,
    height: resolvedHeight,
  }
}
