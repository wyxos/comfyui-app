import { computed } from 'vue'
import { validateRequestedSize } from './homeJobHelpers'
import type { HomeSelectionComputed } from './homeSelectionComputed'
import type { HomeState } from './homeState'
import {
  formatAspectRatioScale,
  formatSignedAspectRatioScale,
  parseAspectRatioScale,
} from './homeValueHelpers'

type HomeStatusComputedDeps = {
  getScaledAspectRatioSize: () => { width: number; height: number } | null
  normalizeControlNetResolutionFromOutputSize: () => number
}

export function createHomeStatusComputed(
  state: HomeState,
  selection: HomeSelectionComputed,
  deps: HomeStatusComputedDeps,
) {
const {
  aspectRatioScale,
  height,
  lastGeneratedSeed,
  queueSummary,
  width,
} = state
void selection
const { getScaledAspectRatioSize, normalizeControlNetResolutionFromOutputSize } = deps

const lastGeneratedSeedTooltip = computed(() => {
  if (lastGeneratedSeed.value === null) {
    return 'No generated seed yet'
  }

  return `Use last generated seed (${lastGeneratedSeed.value})`
})
const queueSummaryText = computed(() => {
  if (queueSummary.value.unavailable) {
    return queueSummary.value.error || 'Queue data unavailable.'
  }

  const segments = [
    `${queueSummary.value.running} running`,
    `${queueSummary.value.pending} pending`,
  ]

  if (queueSummary.value.externalRunning || queueSummary.value.externalPending) {
    segments.push(
      `${queueSummary.value.externalRunning + queueSummary.value.externalPending} external`,
    )
  }

  return `ComfyUI queue: ${segments.join(' • ')}`
})
const queuePanelNotice = computed(() => {
  if (queueSummary.value.unavailable) {
    return queueSummary.value.error || 'Queue data unavailable.'
  }

  const externalSegments: string[] = []
  if (queueSummary.value.externalRunning) {
    externalSegments.push(`${queueSummary.value.externalRunning} external running`)
  }

  if (queueSummary.value.externalPending) {
    externalSegments.push(`${queueSummary.value.externalPending} external queued`)
  }

  return externalSegments.length ? `Other ComfyUI jobs: ${externalSegments.join(' • ')}` : ''
})
const sizeValidation = computed(() => {
  return validateRequestedSize(width.value, height.value)
})
const aspectRatioSliderValue = computed(() => {
  return formatAspectRatioScale(parseAspectRatioScale(aspectRatioScale.value))
})
const aspectRatioLabel = computed(() => {
  const scaledSize = getScaledAspectRatioSize()
  if (!scaledSize) {
    return `scale ${formatSignedAspectRatioScale(aspectRatioSliderValue.value)}`
  }

  return `scale ${formatSignedAspectRatioScale(aspectRatioSliderValue.value)} -> ${scaledSize.width} x ${scaledSize.height}`
})
const sizeValidationClass = computed(() => {
  if (sizeValidation.value.tone === 'error') {
    return 'text-destructive'
  }

  if (sizeValidation.value.tone === 'warning') {
    return 'text-secondary'
  }

  return 'text-primary-foreground/70'
})
const dropzoneResolutionHint = computed(() => {
  if (sizeValidation.value.width !== null && sizeValidation.value.height !== null) {
    return `Target ${sizeValidation.value.width} x ${sizeValidation.value.height}`
  }

  return 'Target resolution follows the Size fields'
})
const controlNetOutputResolutionLabel = computed(() => {
  const requestedSize = sizeValidation.value
  const controlResolution = normalizeControlNetResolutionFromOutputSize()

  if (requestedSize.width !== null && requestedSize.height !== null) {
    return `${controlResolution} px from ${requestedSize.width} x ${requestedSize.height}`
  }

  return `${controlResolution} px`
})

return {
  lastGeneratedSeedTooltip,
  queueSummaryText,
  queuePanelNotice,
  sizeValidation,
  aspectRatioSliderValue,
  aspectRatioLabel,
  sizeValidationClass,
  dropzoneResolutionHint,
  controlNetOutputResolutionLabel,
}
}

export type HomeStatusComputed = ReturnType<typeof createHomeStatusComputed>
