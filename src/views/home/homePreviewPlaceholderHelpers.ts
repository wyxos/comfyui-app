import type { ComputedRef, Ref } from 'vue'
import type { JobResponse, PreviewDisplayItem } from './homeTypes'

type HomePreviewPlaceholderContext = {
  errorMessage: Ref<string>
  isSubmittingGenerate: Ref<boolean>
  jobsList: Ref<JobResponse[]>
  previewDisplayItems: ComputedRef<PreviewDisplayItem[]>
  statusLine: Ref<string>
}

export function createHomePreviewPlaceholderHelpers(ctx: HomePreviewPlaceholderContext) {
const { errorMessage, isSubmittingGenerate, jobsList, previewDisplayItems, statusLine } = ctx

function getPreviewItemJob(item: PreviewDisplayItem) {
  if (item.job) {
    return item.job
  }

  if (!item.promptId) {
    return null
  }

  return jobsList.value.find((job) => job.promptId === item.promptId) ?? null
}

function getPreviewItemActiveVariantId(item: PreviewDisplayItem) {
  const job = getPreviewItemJob(item)
  if (!job || (job.state !== 'running' && job.state !== 'cancelling')) {
    return null
  }

  const normalizedNodeLabel = job.currentNodeLabel?.trim().toLowerCase() ?? ''
  if (normalizedNodeLabel.includes('original prompt')) {
    return 'original'
  }

  if (normalizedNodeLabel.includes('improved prompt')) {
    return 'improved'
  }

  const itemsForJob = previewDisplayItems.value.filter(
    (candidate) => candidate.isPlaceholder && candidate.promptId === item.promptId,
  )
  if (itemsForJob.length === 1) {
    const onlyItem = itemsForJob[0]
    return onlyItem?.variantId ?? null
  }

  return null
}

function isPlaceholderProgressActive(item: PreviewDisplayItem) {
  if (!item.isPlaceholder) {
    return false
  }

  const activeVariantId = getPreviewItemActiveVariantId(item)
  return Boolean(activeVariantId && item.variantId === activeVariantId)
}

function getPreviewPlaceholderStatus(item: PreviewDisplayItem) {
  const job = getPreviewItemJob(item)
  if (!job) {
    if (errorMessage.value) {
      return statusLine.value || 'Failed'
    }

    if (isSubmittingGenerate.value) {
      return 'Submitting'
    }

    return statusLine.value || 'Pending'
  }

  if (isPlaceholderProgressActive(item)) {
    return job.state === 'cancelling' ? 'Cancelling' : 'Generating'
  }

  if (job.state === 'running') {
    return 'Waiting'
  }

  if (job.state === 'queued') {
    return 'Queued'
  }

  if (job.state === 'cancelling') {
    return 'Waiting'
  }

  if (job.state === 'cancelled') {
    return 'Cancelled'
  }

  if (job.state === 'error') {
    return 'Failed'
  }

  if (job.state === 'complete') {
    return 'Complete'
  }

  return 'Pending'
}

function getPreviewPlaceholderProgressPercent(item: PreviewDisplayItem) {
  if (!isPlaceholderProgressActive(item)) {
    return null
  }

  return getPreviewItemJob(item)?.progressPercent ?? null
}

function shouldShowPreviewPlaceholderIndeterminate(item: PreviewDisplayItem) {
  if (!item.isPlaceholder) {
    return false
  }

  const job = getPreviewItemJob(item)
  if (!job) {
    return isSubmittingGenerate.value
  }

  if (job.state === 'queued') {
    return true
  }

  return (
    isPlaceholderProgressActive(item) &&
    (job.state === 'running' || job.state === 'cancelling') &&
    job.progressPercent === null
  )
}

function getPreviewPlaceholderBarClass(item: PreviewDisplayItem) {
  const job = getPreviewItemJob(item)
  if (job?.state === 'cancelling' && isPlaceholderProgressActive(item)) {
    return 'companion-indeterminate h-full w-1/3 bg-destructive'
  }

  return 'companion-indeterminate h-full w-1/3 bg-secondary'
}

return {
  getPreviewItemJob,
  getPreviewPlaceholderBarClass,
  getPreviewPlaceholderProgressPercent,
  getPreviewPlaceholderStatus,
  shouldShowPreviewPlaceholderIndeterminate,
}
}
