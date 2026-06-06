import { computed, type ComputedRef, type Ref } from 'vue'
import type { JobResponse, PreviewDisplayItem } from './homeTypes'

type HomePreviewModalContext = {
  activePreviewIndex: Ref<number>
  canNavigatePreviewModal: ComputedRef<boolean>
  closeResetDialog: () => void
  errorMessage: Ref<string>
  isPreviewModalDragging: Ref<boolean>
  isPreviewModalOpen: Ref<boolean>
  isPreviewModalPannable: ComputedRef<boolean>
  isResetDialogOpen: Ref<boolean>
  isSubmittingGenerate: Ref<boolean>
  jobsList: Ref<JobResponse[]>
  previewDisplayItems: ComputedRef<PreviewDisplayItem[]>
  previewModalOffsetX: Ref<number>
  previewModalOffsetY: Ref<number>
  previewModalOutputIndexes: ComputedRef<number[]>
  previewModalPanField: Ref<HTMLElement | null>
  previewModalScale: Ref<number>
  previewModalViewport: Ref<HTMLElement | null>
  selectedPreviewModalOutputPosition: ComputedRef<number>
  statusLine: Ref<string>
}

export function createHomePreviewModalActions(ctx: HomePreviewModalContext) {
const {
  activePreviewIndex,
  canNavigatePreviewModal,
  closeResetDialog,
  errorMessage,
  isPreviewModalDragging,
  isPreviewModalOpen,
  isPreviewModalPannable,
  isResetDialogOpen,
  isSubmittingGenerate,
  jobsList,
  previewDisplayItems,
  previewModalOffsetX,
  previewModalOffsetY,
  previewModalOutputIndexes,
  previewModalPanField,
  previewModalScale,
  previewModalViewport,
  selectedPreviewModalOutputPosition,
  statusLine,
} = ctx
let previewModalPointerId: number | null = null
let previewModalDragOriginX = 0
let previewModalDragOriginY = 0

const previewModalImageStyle = computed(() => ({
  transform: `scale(${previewModalScale.value})`,
}))
const previewModalPanStyle = computed(() => ({
  transform: `translate(${previewModalOffsetX.value}px, ${previewModalOffsetY.value}px)`,
}))

function clampPreviewModalScale(value: number) {
  return Math.min(4, Math.max(1, Number.parseFloat(value.toFixed(2))))
}

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

function resetPreviewModalPan() {
  previewModalOffsetX.value = 0
  previewModalOffsetY.value = 0
  isPreviewModalDragging.value = false
  previewModalPointerId = null
}

function clampPreviewModalPan(nextX: number, nextY: number) {
  const viewportRect = previewModalViewport.value?.getBoundingClientRect() ?? null
  const panFieldRect = previewModalPanField.value?.getBoundingClientRect() ?? null

  if (!viewportRect || !panFieldRect || !isPreviewModalPannable.value) {
    return { x: 0, y: 0 }
  }

  const scaledWidth = panFieldRect.width * previewModalScale.value
  const scaledHeight = panFieldRect.height * previewModalScale.value
  const maxOffsetX = Math.max(0, (scaledWidth - viewportRect.width) / 2)
  const maxOffsetY = Math.max(0, (scaledHeight - viewportRect.height) / 2)

  return {
    x: Math.min(maxOffsetX, Math.max(-maxOffsetX, nextX)),
    y: Math.min(maxOffsetY, Math.max(-maxOffsetY, nextY)),
  }
}

function setPreviewModalPan(nextX: number, nextY: number) {
  const clampedPan = clampPreviewModalPan(nextX, nextY)
  previewModalOffsetX.value = clampedPan.x
  previewModalOffsetY.value = clampedPan.y
}

function setPreviewModalPreviewIndex(index: number, preserveZoom = true) {
  activePreviewIndex.value = index
  if (!preserveZoom) {
    previewModalScale.value = 1
  }
  resetPreviewModalPan()
}

function openPreviewModal(index = activePreviewIndex.value) {
  const previewItem = previewDisplayItems.value[index] ?? null
  if (!previewItem?.output) {
    return
  }

  setPreviewModalPreviewIndex(index, false)
  isPreviewModalOpen.value = true
}

function closePreviewModal() {
  isPreviewModalOpen.value = false
  previewModalScale.value = 1
  resetPreviewModalPan()
}

function stepPreviewModal(direction: 1 | -1) {
  if (!canNavigatePreviewModal.value) {
    return
  }

  const currentPosition = selectedPreviewModalOutputPosition.value
  if (currentPosition < 0) {
    return
  }

  const nextPosition =
    (currentPosition + direction + previewModalOutputIndexes.value.length) %
    previewModalOutputIndexes.value.length

  setPreviewModalPreviewIndex(previewModalOutputIndexes.value[nextPosition], true)
}

function zoomPreviewModal(direction: 1 | -1) {
  previewModalScale.value = clampPreviewModalScale(previewModalScale.value + direction * 0.25)
  if (!isPreviewModalPannable.value) {
    resetPreviewModalPan()
    return
  }

  setPreviewModalPan(previewModalOffsetX.value, previewModalOffsetY.value)
}

function resetPreviewModalZoom() {
  previewModalScale.value = 1
  resetPreviewModalPan()
}

function handlePreviewModalWheel(event: WheelEvent) {
  if (!isPreviewModalOpen.value) {
    return
  }

  event.preventDefault()
  previewModalScale.value = clampPreviewModalScale(
    previewModalScale.value + (event.deltaY < 0 ? 0.2 : -0.2),
  )
  if (!isPreviewModalPannable.value) {
    resetPreviewModalPan()
    return
  }

  setPreviewModalPan(previewModalOffsetX.value, previewModalOffsetY.value)
}

function handlePreviewModalPointerDown(event: PointerEvent) {
  if (!isPreviewModalPannable.value || !(event.currentTarget instanceof HTMLElement)) {
    return
  }

  if (
    event.target instanceof Element &&
    event.target.closest('[data-preview-modal-control="true"]')
  ) {
    return
  }

  previewModalPointerId = event.pointerId
  previewModalDragOriginX = event.clientX - previewModalOffsetX.value
  previewModalDragOriginY = event.clientY - previewModalOffsetY.value
  isPreviewModalDragging.value = true
  event.currentTarget.setPointerCapture(event.pointerId)
}

function handlePreviewModalPointerMove(event: PointerEvent) {
  if (!isPreviewModalDragging.value || previewModalPointerId !== event.pointerId) {
    return
  }

  setPreviewModalPan(
    event.clientX - previewModalDragOriginX,
    event.clientY - previewModalDragOriginY,
  )
}

function stopPreviewModalPointerTracking(event: PointerEvent) {
  if (
    event.currentTarget instanceof HTMLElement &&
    event.currentTarget.hasPointerCapture(event.pointerId)
  ) {
    event.currentTarget.releasePointerCapture(event.pointerId)
  }

  if (previewModalPointerId !== event.pointerId) {
    return
  }

  isPreviewModalDragging.value = false
  previewModalPointerId = null
}

function handlePreviewModalKeydown(event: KeyboardEvent) {
  if (isResetDialogOpen.value && event.key === 'Escape') {
    closeResetDialog()
    return
  }

  if (!isPreviewModalOpen.value) {
    return
  }

  if (event.key === 'Escape') {
    closePreviewModal()
    return
  }

  if (event.key === '+' || event.key === '=') {
    event.preventDefault()
    zoomPreviewModal(1)
    return
  }

  if (event.key === '-') {
    event.preventDefault()
    zoomPreviewModal(-1)
    return
  }

  if (event.key === '0') {
    event.preventDefault()
    resetPreviewModalZoom()
    return
  }

  if (event.key === 'ArrowLeft') {
    event.preventDefault()
    stepPreviewModal(-1)
    return
  }

  if (event.key === 'ArrowRight') {
    event.preventDefault()
    stepPreviewModal(1)
  }
}

return {
  closePreviewModal,
  previewModalImageStyle,
  previewModalPanStyle,
  getPreviewPlaceholderBarClass,
  getPreviewPlaceholderProgressPercent,
  getPreviewPlaceholderStatus,
  handlePreviewModalKeydown,
  handlePreviewModalPointerDown,
  handlePreviewModalPointerMove,
  handlePreviewModalWheel,
  openPreviewModal,
  resetPreviewModalZoom,
  setPreviewModalPreviewIndex,
  shouldShowPreviewPlaceholderIndeterminate,
  stepPreviewModal,
  stopPreviewModalPointerTracking,
  zoomPreviewModal,
}
}
