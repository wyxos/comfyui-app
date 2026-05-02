import { IMPROVE_PROMPT_TIMEOUT_MS } from './homeConstants'
import type { HomeJobListComputed } from './homeJobListComputed'
import type { HomeJobPollingActions } from './homeJobPollingActions'
import { getJobListTabForState, isLiveJobState } from './homeJobHelpers'
import type { HomeSelectionComputed } from './homeSelectionComputed'
import type { HomeState } from './homeState'
import type { HomeStatusComputed } from './homeStatusComputed'
import type { GenerateResponse, ImprovePromptResponse, JobResponse } from './homeTypes'
import {
  coerceTrimmedFieldString,
  normalizeControlNetNumericField,
} from './homeValueHelpers'

type HomeGenerationDeps = {
  apiJson: <T>(path: string, init?: RequestInit & { timeoutMs?: number; signal?: AbortSignal }) => Promise<T>
  buildCurrentInputImageSnapshot: () => { name: string; url: string } | null
  buildImprovedPromptForGeneration: () => string
  buildPromptForImprovement: () => string
  capturePromptImprovementElapsed: () => number
  finishPromptImprovementTimer: () => number
  formatElapsedDuration: (milliseconds: number) => string
  getCheckpointActiveLoraTriggerWords: (checkpoint: HomeState['selectedCheckpoints']['value'][number]) => Array<{ word: string; weight: number }>
  normalizeControlNetResolutionFromOutputSize: () => number
  normalizeLoraStrength: (value: string | number, fallback?: number) => number
  refreshJobs: () => Promise<void>
  sizeValidation: HomeStatusComputed['sizeValidation']
  startPromptImprovementTimer: () => void
  syncSubmittedInputImageSnapshots: (promptIds: string[], snapshot: { name: string; url: string } | null) => void
}

export function createHomeGenerationActions(
  state: HomeState,
  selection: HomeSelectionComputed,
  jobList: HomeJobListComputed,
  polling: HomeJobPollingActions,
  deps: HomeGenerationDeps,
) {
const {
  activeBatchCheckpoints,
  activeBatchId,
  activeBatchPromptIds,
  activePreviewIndex,
  activePromptId,
  batchPreviewMode,
  cfg,
  imageDenoise,
  improvedPrompt,
  isCancellingJob,
  isImprovingPrompt,
  isSubmittingGenerate,
  jobListTab,
  llmInstruction,
  pendingSubmittedCheckpoints,
  pendingSubmittedInputImageSnapshot,
  pendingSubmittedVariants,
  promptImprovementError,
  promptImprovementNotice,
  previewOutputs,
  seed,
  selectedOllamaModel,
  submissionError,
  uploadedInputImageName,
  useImprovedPrompt,
  useOriginalPrompt,
} = state
const {
  compiledNegativePrompt,
  compiledPrompt,
  enabledCheckpointEntries,
  enabledControlNetSelections,
  promptImproverCheckpointName,
  requestedPromptVariants,
  selectedInputImageName,
  selectedJob,
  shouldUseInputImage,
} = selection
const { canCancelSelectedJob, canGenerate, canImprovePrompt } = jobList
const { applySelectedJobState } = polling
const {
  apiJson,
  buildCurrentInputImageSnapshot,
  buildImprovedPromptForGeneration,
  buildPromptForImprovement,
  capturePromptImprovementElapsed,
  finishPromptImprovementTimer,
  formatElapsedDuration,
  getCheckpointActiveLoraTriggerWords,
  normalizeControlNetResolutionFromOutputSize,
  normalizeLoraStrength,
  refreshJobs,
  sizeValidation,
  startPromptImprovementTimer,
  syncSubmittedInputImageSnapshots,
} = deps
let improvePromptRequestController: AbortController | null = null
let suppressPromptImprovementStoppedNotice = false

function suppressNextPromptImprovementStoppedNotice() {
  suppressPromptImprovementStoppedNotice = true
}

async function improvePrompt() {
  if (!canImprovePrompt.value) {
    return
  }

  promptImprovementError.value = ''
  promptImprovementNotice.value = ''
  submissionError.value = ''
  improvedPrompt.value = ''
  isImprovingPrompt.value = true
  startPromptImprovementTimer()
  const abortController = new AbortController()
  improvePromptRequestController = abortController

  try {
    const payload = await apiJson<ImprovePromptResponse>('/api/improve-prompt', {
      method: 'POST',
      body: JSON.stringify({
        prompt: buildPromptForImprovement(),
        negativePrompt: compiledNegativePrompt.value,
        checkpoint: promptImproverCheckpointName.value,
        llmInstruction: llmInstruction.value,
        ollamaModel: selectedOllamaModel.value,
        inputImageName: shouldUseInputImage.value ? uploadedInputImageName.value : null,
      }),
      timeoutMs: IMPROVE_PROMPT_TIMEOUT_MS,
      signal: abortController.signal,
    })

    if (!payload.improvedPrompt) {
      throw new Error('Ollama did not return an improved prompt.')
    }

    improvedPrompt.value = payload.improvedPrompt
    if (payload.model) {
      selectedOllamaModel.value = payload.model
    }
    promptImprovementNotice.value = `Prompt improvement finished in ${formatElapsedDuration(capturePromptImprovementElapsed())}.`
  } catch (error) {
    if (error instanceof Error && error.message === 'Request cancelled.') {
      if (!suppressPromptImprovementStoppedNotice) {
        promptImprovementNotice.value = `Prompt improvement stopped after ${formatElapsedDuration(capturePromptImprovementElapsed())}.`
      }
    } else {
      const message = error instanceof Error ? error.message : 'Could not improve the prompt.'
      promptImprovementError.value = message
    }
  } finally {
    if (improvePromptRequestController === abortController) {
      improvePromptRequestController = null
    }
    finishPromptImprovementTimer()
    isImprovingPrompt.value = false
    suppressPromptImprovementStoppedNotice = false
  }
}

function stopPromptImprovement() {
  improvePromptRequestController?.abort()
}

async function cancelSelectedJob() {
  if (!selectedJob.value || !canCancelSelectedJob.value || isCancellingJob.value) {
    return
  }

  submissionError.value = ''
  isCancellingJob.value = true

  try {
    await apiJson<JobResponse>(`/api/jobs/${selectedJob.value.promptId}/cancel`, {
      method: 'POST',
    })
    await refreshJobs()
  } catch (error) {
    submissionError.value =
      error instanceof Error ? error.message : 'Could not cancel the selected workflow.'
    applySelectedJobState(selectedJob.value)
  } finally {
    isCancellingJob.value = false
  }
}

async function generate() {
  if (!canGenerate.value || isSubmittingGenerate.value) {
    return
  }

  const requestedSize = sizeValidation.value
  if (!requestedSize.isValid || requestedSize.width === null || requestedSize.height === null) {
    submissionError.value = requestedSize.message
    return
  }

  submissionError.value = ''
  promptImprovementError.value = ''
  const enabledCheckpointNames = enabledCheckpointEntries.value.map((checkpoint) => checkpoint.name)
  const shouldUseBatchPreview = enabledCheckpointNames.length > 1
  const previousActivePromptId = activePromptId.value
  const shouldPreserveLiveFocus = isLiveJobState(selectedJob.value?.state)
  const submittedInputImageSnapshot = buildCurrentInputImageSnapshot()
  pendingSubmittedVariants.value = requestedPromptVariants.value.map((variant) => ({ ...variant }))
  pendingSubmittedCheckpoints.value = shouldUseBatchPreview ? [...enabledCheckpointNames] : []
  pendingSubmittedInputImageSnapshot.value = submittedInputImageSnapshot
  activeBatchId.value = ''
  activeBatchPromptIds.value = []
  activeBatchCheckpoints.value = shouldUseBatchPreview ? [...enabledCheckpointNames] : []
  batchPreviewMode.value = shouldUseBatchPreview
  previewOutputs.value = []
  activePreviewIndex.value = 0
  isSubmittingGenerate.value = true
  applySelectedJobState(null)

  try {
    const payloadBody: Record<string, unknown> = {
      prompt: useOriginalPrompt.value ? compiledPrompt.value : '',
      improvedPrompt: useImprovedPrompt.value ? buildImprovedPromptForGeneration() : '',
      negativePrompt: compiledNegativePrompt.value,
      checkpoints: enabledCheckpointEntries.value.map((checkpoint) => ({
        name: checkpoint.name,
        loras: checkpoint.loras
          .filter((lora) => lora.enabled && lora.name.trim())
          .map((lora) => ({
            name: lora.name,
            strength: normalizeLoraStrength(lora.strength),
            triggerWords: getCheckpointActiveLoraTriggerWords({
              ...checkpoint,
              loras: [lora],
            }),
          })),
      })),
      width: requestedSize.width,
      height: requestedSize.height,
    }

    const trimmedSeed = coerceTrimmedFieldString(seed.value)
    if (trimmedSeed) {
      payloadBody.seed = Number.parseInt(trimmedSeed, 10)
    }

    const trimmedCfg = coerceTrimmedFieldString(cfg.value)
    if (trimmedCfg) {
      payloadBody.cfg = Number.parseFloat(trimmedCfg)
    }

    if (shouldUseInputImage.value && uploadedInputImageName.value) {
      payloadBody.inputImageName = uploadedInputImageName.value
      payloadBody.inputImageDisplayName = selectedInputImageName.value

      const trimmedImageDenoise = coerceTrimmedFieldString(imageDenoise.value)
      if (trimmedImageDenoise) {
        payloadBody.imageDenoise = Number.parseFloat(trimmedImageDenoise)
      }
    }

    if (enabledControlNetSelections.value.length) {
      payloadBody.controlNets = enabledControlNetSelections.value.map((controlNet) => ({
        id: controlNet.id,
        model: controlNet.model,
        inputImageName: controlNet.inputImageName,
        preprocessor: controlNet.preprocessor,
        lineartPolarity: controlNet.lineartPolarity,
        previewResolution: normalizeControlNetNumericField(
          controlNet.previewResolution,
          normalizeControlNetResolutionFromOutputSize(),
          64,
          16384,
        ),
        strength: normalizeControlNetNumericField(controlNet.strength, 1, 0, 10),
        startPercent: normalizeControlNetNumericField(controlNet.startPercent, 0, 0, 1),
        endPercent: normalizeControlNetNumericField(controlNet.endPercent, 1, 0, 1),
      }))
    }

    const payload = await apiJson<GenerateResponse>('/api/generate', {
      method: 'POST',
      body: JSON.stringify(payloadBody),
      timeoutMs: 30000,
    })

    if (!payload.promptId && !payload.promptIds?.length) {
      throw new Error('ComfyUI did not return a prompt id.')
    }

    if (Array.isArray(payload.promptVariants) && payload.promptVariants.length) {
      pendingSubmittedVariants.value = payload.promptVariants.map((variant) => ({ ...variant }))
    }

    submissionError.value = payload.partialFailure ? payload.message ?? '' : ''
    activeBatchId.value = shouldUseBatchPreview ? payload.batchId ?? '' : ''
    const submittedPromptIds = Array.isArray(payload.promptIds)
      ? payload.promptIds.filter((promptId): promptId is string => Boolean(promptId))
      : payload.promptId
        ? [payload.promptId]
        : []
    activeBatchPromptIds.value = submittedPromptIds
    activeBatchCheckpoints.value = shouldUseBatchPreview ? [...enabledCheckpointNames] : []
    batchPreviewMode.value = shouldUseBatchPreview
    syncSubmittedInputImageSnapshots(submittedPromptIds, submittedInputImageSnapshot)
    const submittedPromptId = payload.promptIds?.[0] ?? payload.promptId ?? ''
    activePromptId.value =
      shouldPreserveLiveFocus && previousActivePromptId ? previousActivePromptId : submittedPromptId
    await refreshJobs()
    if (selectedJob.value) {
      jobListTab.value = getJobListTabForState(selectedJob.value.state)
    }
  } catch (error) {
    pendingSubmittedVariants.value = []
    pendingSubmittedCheckpoints.value = []
    activeBatchId.value = ''
    activeBatchPromptIds.value = []
    activeBatchCheckpoints.value = []
    pendingSubmittedInputImageSnapshot.value = null
    batchPreviewMode.value = false
    submissionError.value = error instanceof Error ? error.message : 'Could not start generation.'
    applySelectedJobState(selectedJob.value)
  } finally {
    isSubmittingGenerate.value = false
    applySelectedJobState(selectedJob.value)
  }
}

return {
  improvePrompt,
  suppressNextPromptImprovementStoppedNotice,
  stopPromptImprovement,
  cancelSelectedJob,
  generate,
}
}

export type HomeGenerationActions = ReturnType<typeof createHomeGenerationActions>
