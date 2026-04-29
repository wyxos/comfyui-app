import { computed } from 'vue'
import { formatCountWithLabel } from './homeJobHelpers'
import { createHomePreviewPlaceholderHelpers } from './homePreviewPlaceholderHelpers'
import type { HomeSelectionComputed } from './homeSelectionComputed'
import type { HomeState } from './homeState'
import type { InputImageSnapshot, JobResponse, PreviewDisplayItem, PreviewStatusItem } from './homeTypes'

type HomePreviewComputedDeps = {
  formatElapsed: (elapsedMs: number) => string
  getJobInputImageSnapshot: (job: JobResponse | null) => InputImageSnapshot | null
}

export function createHomePreviewComputed(
  state: HomeState,
  selection: HomeSelectionComputed,
  deps: HomePreviewComputedDeps,
) {
const {
  activeBatchCheckpoints,
  activeBatchId,
  activeBatchPromptIds,
  activePreviewIndex,
  activePromptId,
  batchPreviewMode,
  detailLine,
  errorMessage,
  isSubmittingGenerate,
  jobsList,
  loadingError,
  pendingSubmittedCheckpoints,
  pendingSubmittedInputImageSnapshot,
  pendingSubmittedVariants,
  previewOutputs,
  previewModalScale,
  queueSummary,
  statusLine,
  submissionError,
  submittedInputImageSnapshots,
} = state
const { selectedJob } = selection
const { formatElapsed, getJobInputImageSnapshot } = deps

function formatPreviewCheckpointName(checkpointName: string | null) {
  if (!checkpointName) {
    return ''
  }

  return checkpointName.replace(/\.(safetensors|ckpt|pt)$/i, '')
}

function buildPreviewItemLabel(checkpointName: string | null, variantLabel: string | null) {
  const resolvedVariantLabel = variantLabel ?? 'Pending output'
  if (!batchPreviewMode.value || !checkpointName) {
    return resolvedVariantLabel
  }

  const checkpointLabel = formatPreviewCheckpointName(checkpointName)
  return checkpointLabel ? `${checkpointLabel} · ${resolvedVariantLabel}` : resolvedVariantLabel
}

function buildPreviewItemsFromJob(
  job: JobResponse | null,
  checkpointNameOverride: string | null,
  promptIdOverride: string | null,
) {
  const remainingOutputs = [...(job?.outputs ?? [])]
  const variants = job?.promptVariants?.length ? job.promptVariants : pendingSubmittedVariants.value
  const promptId = promptIdOverride ?? job?.promptId ?? null
  const checkpointName = job?.checkpoint ?? checkpointNameOverride ?? null
  const items: PreviewDisplayItem[] = []

  for (const variant of variants) {
    const matchedOutputIndex = remainingOutputs.findIndex((output) => output.variantId === variant.id)
    const fallbackOutputIndex =
      matchedOutputIndex >= 0
        ? matchedOutputIndex
        : remainingOutputs.findIndex((output) => output.isImproved === variant.isImproved)
    const output =
      fallbackOutputIndex >= 0 ? remainingOutputs.splice(fallbackOutputIndex, 1)[0] ?? null : null

    items.push({
      key: `${promptId ?? checkpointName ?? 'pending'}:${variant.id}`,
      promptId,
      checkpointName,
      job,
      variantId: variant.id,
      variantLabel: buildPreviewItemLabel(checkpointName, variant.label),
      promptText: variant.promptText,
      isImproved: variant.isImproved,
      output,
      isPlaceholder: !output,
    })
  }

  if (!items.length) {
    return remainingOutputs.map((output, index) => ({
      key: `${promptId ?? checkpointName ?? 'pending'}:${output.variantId ?? output.url ?? `output-${index}`}`,
      promptId,
      checkpointName,
      job,
      variantId: output.variantId,
      variantLabel: buildPreviewItemLabel(checkpointName, output.variantLabel),
      promptText: output.promptText,
      isImproved: output.isImproved,
      output,
      isPlaceholder: false,
    }))
  }

  for (const [index, output] of remainingOutputs.entries()) {
    items.push({
      key: `${promptId ?? checkpointName ?? 'pending'}:${output.variantId ?? output.url ?? `output-extra-${index}`}`,
      promptId,
      checkpointName,
      job,
      variantId: output.variantId,
      variantLabel: buildPreviewItemLabel(checkpointName, output.variantLabel),
      promptText: output.promptText,
      isImproved: output.isImproved,
      output,
      isPlaceholder: false,
    })
  }

  return items
}
function getBatchJobs(batchId: string | null) {
  if (!batchId) {
    return []
  }

  return [...jobsList.value]
    .filter((job) => job.batchId === batchId)
    .sort((leftJob, rightJob) => {
      const leftIndex = leftJob.batchIndex ?? Number.MAX_SAFE_INTEGER
      const rightIndex = rightJob.batchIndex ?? Number.MAX_SAFE_INTEGER
      if (leftIndex !== rightIndex) {
        return leftIndex - rightIndex
      }

      return leftJob.createdAt - rightJob.createdAt
    })
}
const activeBatchJobs = computed(() => {
  const batchIds = [activeBatchId.value, selectedJob.value?.batchId ?? '']

  for (const batchId of batchIds) {
    const jobs = getBatchJobs(batchId || null)
    if (jobs.length > 1) {
      return jobs
    }
  }

  return []
})
const previewDisplayItems = computed<PreviewDisplayItem[]>(() => {
  if (activeBatchJobs.value.length > 1) {
    return activeBatchJobs.value.flatMap((job) =>
      buildPreviewItemsFromJob(job, job.checkpoint ?? null, job.promptId ?? null),
    )
  }

  if (batchPreviewMode.value) {
    const checkpointNames =
      activeBatchCheckpoints.value.length > 0
        ? activeBatchCheckpoints.value
        : pendingSubmittedCheckpoints.value
    const batchItems = checkpointNames.flatMap((checkpointName, index) => {
      const promptId = activeBatchPromptIds.value[index] ?? null
      const job = promptId ? jobsList.value.find((candidate) => candidate.promptId === promptId) ?? null : null
      return buildPreviewItemsFromJob(job, checkpointName, promptId)
    })

    if (batchItems.length) {
      return batchItems
    }
  }

  return buildPreviewItemsFromJob(
    selectedJob.value,
    selectedJob.value?.checkpoint ?? null,
    selectedJob.value?.promptId ?? null,
  )
})
const hasPreviewItems = computed(() => previewDisplayItems.value.length > 0)
const hasMultiplePreviewOutputs = computed(() => previewDisplayItems.value.length > 1)
const selectedPreviewItem = computed(() => {
  return previewDisplayItems.value[activePreviewIndex.value] ?? null
})
const selectedGenerationInputImageSnapshot = computed(() => {
  const previewJobSnapshot = getJobInputImageSnapshot(selectedPreviewItem.value?.job ?? null)
  if (previewJobSnapshot) {
    return previewJobSnapshot
  }

  const selectedJobSnapshot = getJobInputImageSnapshot(selectedJob.value)
  if (selectedJobSnapshot) {
    return selectedJobSnapshot
  }

  if (selectedJob.value) {
    return null
  }

  if (activePromptId.value) {
    return submittedInputImageSnapshots.value[activePromptId.value] ?? null
  }

  return pendingSubmittedInputImageSnapshot.value
})
const selectedPreviewOutput = computed(() => {
  return selectedPreviewItem.value?.output ?? null
})
const hasPreviewImage = computed(() => Boolean(selectedPreviewOutput.value))
const imageUrl = computed(() => selectedPreviewOutput.value?.url ?? null)
const latestOutput = computed(() => {
  if (selectedPreviewOutput.value) {
    return selectedPreviewOutput.value
  }

  if (batchPreviewMode.value && selectedPreviewItem.value) {
    return null
  }

  return previewOutputs.value[previewOutputs.value.length - 1] ?? null
})
const previewOutputCounter = computed(() => {
  if (!hasMultiplePreviewOutputs.value) {
    return ''
  }

  return `${activePreviewIndex.value + 1} / ${previewDisplayItems.value.length}`
})
const previewModalOutputIndexes = computed(() => {
  const indexes: number[] = []

  for (const [index, item] of previewDisplayItems.value.entries()) {
    if (item.output) {
      indexes.push(index)
    }
  }

  return indexes
})
const previewModalOutputItems = computed(() => {
  return previewModalOutputIndexes.value.map((index) => ({
    index,
    item: previewDisplayItems.value[index],
  }))
})
const selectedPreviewModalOutputPosition = computed(() => {
  return previewModalOutputIndexes.value.indexOf(activePreviewIndex.value)
})
const canNavigatePreviewModal = computed(() => {
  return previewModalOutputIndexes.value.length > 1
})
const previewModalOutputCounter = computed(() => {
  if (!canNavigatePreviewModal.value || selectedPreviewModalOutputPosition.value < 0) {
    return ''
  }

  return `${selectedPreviewModalOutputPosition.value + 1} / ${previewModalOutputIndexes.value.length}`
})
const isPreviewModalPannable = computed(() => {
  return previewModalScale.value > 1.01
})
const shouldShowPreviewStatus = computed(() => {
  return Boolean(
    selectedJob.value ||
      isSubmittingGenerate.value ||
      submissionError.value ||
      loadingError.value ||
      queueSummary.value.unavailable,
  )
})
const shouldShowStandalonePreviewStatus = computed(() => {
  return (
    shouldShowPreviewStatus.value &&
    (hasPreviewImage.value || !hasPreviewItems.value || Boolean(selectedPreviewItem.value?.isPlaceholder))
  )
})
const hasGroupedBatchPreview = computed(() => {
  return activeBatchJobs.value.length > 1 || activeBatchCheckpoints.value.length > 1 || pendingSubmittedCheckpoints.value.length > 1
})
const previewPlaceholderHelpers = createHomePreviewPlaceholderHelpers({
  errorMessage,
  isSubmittingGenerate,
  jobsList,
  previewDisplayItems,
  statusLine,
})
const {
  getPreviewItemJob,
  getPreviewPlaceholderProgressPercent,
  getPreviewPlaceholderStatus,
  shouldShowPreviewPlaceholderIndeterminate,
} = previewPlaceholderHelpers

const previewStatusItems = computed<PreviewStatusItem[]>(() => {
  if (previewDisplayItems.value.length <= 1) {
    return []
  }

  return previewDisplayItems.value.map((item, index) => {
    if (item.output) {
      return {
        key: item.key,
        label: item.variantLabel ?? `Output ${index + 1}`,
        statusLabel: 'Complete',
        progressPercent: 100,
        indeterminate: false,
        isComplete: true,
        isDestructive: false,
      }
    }

    const status = getPreviewPlaceholderStatus(item)
    return {
      key: item.key,
      label: item.variantLabel ?? `Output ${index + 1}`,
      statusLabel: status,
      progressPercent: getPreviewPlaceholderProgressPercent(item),
      indeterminate: shouldShowPreviewPlaceholderIndeterminate(item),
      isComplete: status === 'Complete',
      isDestructive: status === 'Failed' || status === 'Cancelled' || status === 'Cancelling',
    }
  })
})
const previewStatusElapsedMs = computed(() => {
  const elapsedValues: number[] = []
  const seenPromptIds = new Set<string>()

  for (const item of previewDisplayItems.value) {
    const job = getPreviewItemJob(item)
    if (!job || seenPromptIds.has(job.promptId)) {
      continue
    }

    seenPromptIds.add(job.promptId)
    elapsedValues.push(job.elapsedMs)
  }

  if (elapsedValues.length) {
    return Math.max(...elapsedValues)
  }

  return selectedJob.value?.elapsedMs ?? 0
})
const previewStatusElapsedLabel = computed(() => {
  return previewStatusElapsedMs.value > 0 ? formatElapsed(previewStatusElapsedMs.value) : ''
})
const previewStatusTitle = computed(() => {
  if (!previewStatusItems.value.length) {
    return statusLine.value
  }

  const titlePrefix = hasGroupedBatchPreview.value ? 'Batch' : 'Run'
  if (previewStatusItems.value.every((item) => item.isComplete)) {
    return `${titlePrefix} complete`
  }

  if (
    previewStatusItems.value.some((item) => item.isDestructive) &&
    previewStatusItems.value.every((item) => item.isComplete || item.isDestructive)
  ) {
    return `${titlePrefix} issues`
  }

  return `${titlePrefix} progress`
})
const previewStatusSummaryLine = computed(() => {
  if (!previewStatusItems.value.length) {
    return detailLine.value
  }

  const totalItems = previewStatusItems.value.length
  const completeItems = previewStatusItems.value.filter((item) => item.isComplete).length
  const failedItems = previewStatusItems.value.filter((item) => item.statusLabel === 'Failed').length
  const cancelledItems = previewStatusItems.value.filter((item) => item.statusLabel === 'Cancelled').length
  const pendingItems = Math.max(0, totalItems - completeItems - failedItems - cancelledItems)
  const segments: string[] = []

  if (completeItems === totalItems) {
    segments.push(formatCountWithLabel(completeItems, 'output ready', 'outputs ready'))
  } else {
    segments.push(`${completeItems} of ${totalItems} ready`)
  }

  if (pendingItems) {
    segments.push(`${pendingItems} pending`)
  }

  if (failedItems) {
    segments.push(formatCountWithLabel(failedItems, 'failed'))
  }

  if (cancelledItems) {
    segments.push(formatCountWithLabel(cancelledItems, 'cancelled'))
  }

  if (previewStatusElapsedLabel.value) {
    segments.push(previewStatusElapsedLabel.value)
  }

  return segments.join(' • ')
})

return {
  getBatchJobs,
  activeBatchJobs,
  previewDisplayItems,
  hasPreviewItems,
  hasMultiplePreviewOutputs,
  selectedPreviewItem,
  selectedGenerationInputImageSnapshot,
  selectedPreviewOutput,
  hasPreviewImage,
  imageUrl,
  latestOutput,
  previewOutputCounter,
  previewModalOutputIndexes,
  previewModalOutputItems,
  selectedPreviewModalOutputPosition,
  canNavigatePreviewModal,
  previewModalOutputCounter,
  isPreviewModalPannable,
  shouldShowPreviewStatus,
  shouldShowStandalonePreviewStatus,
  hasGroupedBatchPreview,
  previewStatusItems,
  previewStatusElapsedMs,
  previewStatusElapsedLabel,
  previewStatusTitle,
  previewStatusSummaryLine,
  ...previewPlaceholderHelpers,
}
}

export type HomePreviewComputed = ReturnType<typeof createHomePreviewComputed>
