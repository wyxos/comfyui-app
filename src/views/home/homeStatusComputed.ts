import { computed } from 'vue'
import { IMPROVE_PROMPT_TIMEOUT_MS } from './homeConstants'
import { formatElapsedDuration, validateRequestedSize } from './homeJobHelpers'
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
  isImprovingPrompt,
  isUploadingInputImage,
  lastGeneratedSeed,
  loadingOllamaModels,
  ollamaModelError,
  promptImprovementElapsedMs,
  promptImprovementError,
  promptImprovementNotice,
  queueSummary,
  selectedOllamaModel,
  uploadedInputImageName,
  useImprovedPrompt,
  usePromptImprover,
  width,
} = state
const { compiledPrompt, hasImprovedPromptText, promptImproverCheckpointName, shouldUseInputImage } = selection
const { getScaledAspectRatioSize, normalizeControlNetResolutionFromOutputSize } = deps

const promptImprovementState = computed(() => {
  if (promptImprovementError.value) {
    return `Prompt improvement failed. ${promptImprovementError.value}`
  }

  if (promptImprovementNotice.value) {
    return promptImprovementNotice.value
  }

  if (isImprovingPrompt.value) {
    return `Improving prompt with Ollama... Elapsed: ${promptImprovementElapsedLabel.value}.`
  }

  if (hasImprovedPromptText.value) {
    return useImprovedPrompt.value
      ? 'Improved prompt ready.'
      : 'Improved prompt ready but excluded from generation.'
  }

  if (!usePromptImprover.value) {
    return 'Fill this manually or enable Ollama prompt improvement.'
  }

  if (ollamaModelError.value) {
    return ollamaModelError.value
  }

  if (loadingOllamaModels.value) {
    return 'Loading Ollama models...'
  }

  if (!promptImproverCheckpointName.value) {
    return 'Add and enable at least one checkpoint before improving the prompt.'
  }

  if (!selectedOllamaModel.value) {
    return 'Choose an Ollama model to improve the prompt.'
  }

  return 'Use the Improve CTA to generate a second prompt variant.'
})
const lastGeneratedSeedTooltip = computed(() => {
  if (lastGeneratedSeed.value === null) {
    return 'No generated seed yet'
  }

  return `Use last generated seed (${lastGeneratedSeed.value})`
})
const promptImprovementElapsedLabel = computed(() => {
  return formatElapsedDuration(promptImprovementElapsedMs.value)
})
const promptImprovementTimeoutLabel = computed(() => {
  return formatElapsedDuration(IMPROVE_PROMPT_TIMEOUT_MS)
})
const shouldShowPromptImprovementStatus = computed(() => {
  return Boolean(
    usePromptImprover.value ||
      isImprovingPrompt.value ||
      promptImprovementError.value ||
      promptImprovementNotice.value ||
      hasImprovedPromptText.value,
  )
})
const promptImprovementStatusTitle = computed(() => {
  if (isImprovingPrompt.value) {
    return 'Improving prompt'
  }

  if (promptImprovementError.value) {
    return 'Prompt improvement failed'
  }

  if (promptImprovementNotice.value) {
    return promptImprovementNotice.value.includes('stopped') ? 'Prompt improvement stopped' : 'Prompt improved'
  }

  if (hasImprovedPromptText.value) {
    return 'Improved prompt ready'
  }

  return 'Prompt improver ready'
})
const promptImprovementStatusMeta = computed(() => {
  if (isImprovingPrompt.value) {
    return `${selectedOllamaModel.value || 'Ollama'} • ${promptImproverCheckpointName.value || 'No checkpoint'} • ${promptImprovementElapsedLabel.value} elapsed`
  }

  if (promptImprovementError.value) {
    return promptImprovementError.value
  }

  if (promptImprovementNotice.value) {
    return promptImprovementNotice.value
  }

  if (!usePromptImprover.value) {
    return 'Enable Ollama to improve the prompt.'
  }

  if (loadingOllamaModels.value) {
    return 'Loading Ollama models...'
  }

  if (!compiledPrompt.value) {
    return 'Write a prompt before improving it.'
  }

  if (!promptImproverCheckpointName.value) {
    return 'Waiting for an enabled checkpoint.'
  }

  if (!selectedOllamaModel.value) {
    return 'Waiting for an Ollama model.'
  }

  return `${selectedOllamaModel.value} • ${promptImproverCheckpointName.value}`
})
const promptImprovementStatusTone = computed(() => {
  if (promptImprovementError.value) {
    return 'border-destructive/35 bg-destructive/10 text-destructive'
  }

  if (isImprovingPrompt.value) {
    return 'border-secondary/35 bg-secondary/10 text-secondary'
  }

  if (promptImprovementNotice.value || hasImprovedPromptText.value) {
    return 'border-secondary/25 bg-secondary/8 text-secondary'
  }

  return 'border-primary-foreground/12 bg-primary-foreground/6 text-primary-foreground/72'
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
const improvePromptDisabledReason = computed(() => {
  if (isImprovingPrompt.value) {
    return ''
  }

  if (!usePromptImprover.value) {
    return 'Enable Ollama prompt improver first.'
  }

  if (loadingOllamaModels.value) {
    return 'Ollama models are still loading.'
  }

  if (shouldUseInputImage.value && isUploadingInputImage.value) {
    return 'Input image is still uploading.'
  }

  if (!compiledPrompt.value) {
    return 'Write a prompt first.'
  }

  if (!promptImproverCheckpointName.value) {
    return 'Add and enable a checkpoint first.'
  }

  if (!selectedOllamaModel.value) {
    return 'Choose an Ollama model first.'
  }

  if (shouldUseInputImage.value && !uploadedInputImageName.value) {
    return 'Wait for the input image upload to finish.'
  }

  return ''
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
  promptImprovementState,
  lastGeneratedSeedTooltip,
  promptImprovementElapsedLabel,
  promptImprovementTimeoutLabel,
  shouldShowPromptImprovementStatus,
  promptImprovementStatusTitle,
  promptImprovementStatusMeta,
  promptImprovementStatusTone,
  queueSummaryText,
  improvePromptDisabledReason,
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
