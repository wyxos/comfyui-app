import type { HomeJobListComputed } from './homeJobListComputed'
import type { HomeJobPollingActions } from './homeJobPollingActions'
import { getJobListTabForState, isLiveJobState } from './homeJobHelpers'
import type { HomeSelectionComputed } from './homeSelectionComputed'
import type { HomeState } from './homeState'
import type { HomeStatusComputed } from './homeStatusComputed'
import type { GenerateResponse, JobResponse } from './homeTypes'
import {
  coerceTrimmedFieldString,
  normalizeControlNetNumericField,
} from './homeValueHelpers'

type HomeGenerationDeps = {
  apiJson: <T>(path: string, init?: RequestInit & { timeoutMs?: number; signal?: AbortSignal }) => Promise<T>
  buildCurrentInputImageSnapshot: () => { name: string; url: string } | null
  getCheckpointActiveLoraTriggerWords: (checkpoint: HomeState['selectedCheckpoints']['value'][number]) => Array<{ word: string; weight: number }>
  normalizeControlNetResolutionFromOutputSize: () => number
  normalizeLoraStrength: (value: string | number, fallback?: number) => number
  refreshJobs: () => Promise<void>
  sizeValidation: HomeStatusComputed['sizeValidation']
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
  isCancellingJob,
  isSubmittingGenerate,
  jobListTab,
  pendingSubmittedCheckpoints,
  pendingSubmittedInputImageSnapshot,
  pendingSubmittedVariants,
  previewOutputs,
  seed,
  steps,
  submissionError,
  uploadedInputImageName,
} = state
const {
  compiledNegativePrompt,
  compiledPrompt,
  enabledCheckpointEntries,
  requestedPromptVariants,
  selectedInputImageName,
  selectedJob,
  shouldUseInputImage,
} = selection
const { canCancelSelectedJob, canGenerate } = jobList
const { applySelectedJobState } = polling
const {
  apiJson,
  buildCurrentInputImageSnapshot,
  getCheckpointActiveLoraTriggerWords,
  normalizeControlNetResolutionFromOutputSize,
  normalizeLoraStrength,
  refreshJobs,
  sizeValidation,
  syncSubmittedInputImageSnapshots,
} = deps

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
      prompt: compiledPrompt.value,
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
        controlNets: (checkpoint.controlNets ?? [])
          .filter((controlNet) => controlNet.enabled)
          .map((controlNet) => ({
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
          })),
      })),
      width: requestedSize.width,
      height: requestedSize.height,
    }

    const trimmedSeed = coerceTrimmedFieldString(seed.value)
    if (trimmedSeed) {
      payloadBody.seed = Number.parseInt(trimmedSeed, 10)
    }

    const trimmedSteps = coerceTrimmedFieldString(steps.value)
    if (trimmedSteps) {
      payloadBody.steps = Number.parseInt(trimmedSteps, 10)
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
  cancelSelectedJob,
  generate,
}
}

export type HomeGenerationActions = ReturnType<typeof createHomeGenerationActions>
