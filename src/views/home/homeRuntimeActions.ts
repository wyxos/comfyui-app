import {
  createEmptyPromptSections,
  createEmptyPromptSectionsDrafts,
} from './homeConstants'
import type { HomePreviewComputed } from './homePreviewComputed'
import type { HomeSelectionComputed } from './homeSelectionComputed'
import type { HomeState } from './homeState'
import type { HomeStatusComputed } from './homeStatusComputed'
import type {
  CheckpointResponse,
  ControlNetResponse,
  GenerationOptionsResponse,
  JobResponse,
  LoraResponse,
  LoraSelection,
} from './homeTypes'

type HomeRuntimeActionDeps = {
  apiJson: <T>(path: string, init?: RequestInit & { timeoutMs?: number }) => Promise<T>
  buildCheckpointSelection: (name: string, enabled?: boolean) => HomeState['selectedCheckpoints']['value'][number]
  buildLoraSelection: (
    name: string,
    strength: string | number,
    enabled?: boolean,
    enabledTriggerWords?: string[],
    triggerWordWeights?: Record<string, unknown>,
  ) => LoraSelection
  canResetForm: HomeSelectionComputed['canResetForm']
  clearControlNetInstances: () => void
  clearSelectedImage: () => void
  formatLoraStrength: (value: string | number, fallback?: number) => string
  latestOutput: HomePreviewComputed['latestOutput']
  persistFormState: () => void
  resolveAvailableControlNetModel: (model: unknown) => string
}

export function createHomeRuntimeActions(
  state: HomeState,
  selection: HomeSelectionComputed,
  preview: HomePreviewComputed,
  status: HomeStatusComputed,
  deps: HomeRuntimeActionDeps,
) {
const {
  activeBatchCheckpoints,
  activeBatchId,
  activeBatchPromptIds,
  aspectRatioBaseSize,
  aspectRatioScale,
  batchPreviewMode,
  cfg,
  clipName,
  clipNameOptions,
  checkpoints,
  controlNetLoadingError,
  controlNetPreprocessors,
  controlNets,
  copiedOutputPath,
  currentNodeLabel,
  currentSeed,
  defaultLoraStrength,
  detailLine,
  errorMessage,
  flattenInputImageBackground,
  formTab,
  generationOptionDefaults,
  generationOptionsError,
  height,
  imageDenoise,
  inputImageBackgroundColor,
  inputImageUploadError,
  isResetDialogOpen,
  isSubmittingGenerate,
  jobState,
  lastGeneratedSeed,
  loadingCheckpoints,
  loadingControlNets,
  loadingGenerationOptions,
  loadingError,
  loadingLoras,
  loraLoadingError,
  loras,
  negativePrompt,
  negativePromptDraft,
  negativePromptTags,
  pendingSubmittedCheckpoints,
  openingOutputFolder,
  progressMax,
  progressPercent,
  progressValue,
  prompt,
  promptMode,
  promptSectionDrafts,
  promptSections,
  seed,
  samplerName,
  samplerOptions,
  scheduler,
  schedulerOptions,
  steps,
  selectedCheckpointPicker,
  selectedCheckpoints,
  statusLine,
  submissionError,
  useInputImage,
  vaeName,
  vaeNameOptions,
  maintainAspectRatio,
  lockedAspectRatio,
  width,
} = state
void selection
void status
const { getBatchJobs } = preview
const {
  apiJson,
  buildCheckpointSelection,
  buildLoraSelection,
  canResetForm,
  clearControlNetInstances,
  clearSelectedImage,
  formatLoraStrength,
  latestOutput,
  persistFormState,
  resolveAvailableControlNetModel,
} = deps
let copiedPathTimer: number | null = null

function clearCopiedPathTimer() {
  if (copiedPathTimer !== null) {
    window.clearTimeout(copiedPathTimer)
    copiedPathTimer = null
  }
}

function useLastGeneratedSeed() {
  if (lastGeneratedSeed.value === null) {
    return
  }

  seed.value = String(lastGeneratedSeed.value)
}

function formatElapsed(elapsedMs: number) {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`
}

function setIdleState(message = 'Waiting for a prompt.') {
  statusLine.value = 'Ready'
  detailLine.value = message
  currentNodeLabel.value = ''
  currentSeed.value = null
  progressValue.value = null
  progressMax.value = null
  progressPercent.value = null
  jobState.value = 'idle'
  errorMessage.value = ''
}

function openResetDialog() {
  if (!canResetForm.value) {
    return
  }

  isResetDialogOpen.value = true
}

function closeResetDialog() {
  isResetDialogOpen.value = false
}

function resetForm() {
  prompt.value = ''
  negativePrompt.value = ''
  promptMode.value = 'tags'
  promptSections.value = createEmptyPromptSections()
  promptSectionDrafts.value = createEmptyPromptSectionsDrafts()
  negativePromptTags.value = []
  negativePromptDraft.value = ''
  selectedCheckpoints.value = []
  selectedCheckpointPicker.value = ''
  width.value = '1024'
  height.value = '1024'
  seed.value = ''
  steps.value = ''
  cfg.value = ''
  samplerName.value = ''
  scheduler.value = ''
  clipName.value = ''
  vaeName.value = ''
  imageDenoise.value = ''
  maintainAspectRatio.value = false
  lockedAspectRatio.value = null
  aspectRatioScale.value = '0'
  aspectRatioBaseSize.value = null
  submissionError.value = ''
  inputImageUploadError.value = ''
  useInputImage.value = false
  flattenInputImageBackground.value = false
  inputImageBackgroundColor.value = '#ffffff'
  formTab.value = 'assets'
  clearSelectedImage()
  clearControlNetInstances()
  persistFormState()
  closeResetDialog()
}

function syncBatchPreviewState(job: JobResponse | null) {
  const resolvedJobBatchId =
    job?.batchId && getBatchJobs(job.batchId).length > 1 ? job.batchId : ''
  const fallbackBatchId =
    !job && activeBatchId.value && getBatchJobs(activeBatchId.value).length > 1 ? activeBatchId.value : ''
  const resolvedBatchId = resolvedJobBatchId || fallbackBatchId

  if (resolvedBatchId) {
    const groupedJobs = getBatchJobs(resolvedBatchId)
    activeBatchId.value = resolvedBatchId
    activeBatchPromptIds.value = groupedJobs.map((entry) => entry.promptId)
    activeBatchCheckpoints.value = groupedJobs.map((entry) => entry.checkpoint)
    batchPreviewMode.value = true
    return
  }

  if (isSubmittingGenerate.value && pendingSubmittedCheckpoints.value.length > 1) {
    batchPreviewMode.value = true
    return
  }

  activeBatchId.value = ''
  activeBatchPromptIds.value = []
  activeBatchCheckpoints.value = []
  batchPreviewMode.value = false
}

async function copyOutputPath() {
  if (!latestOutput.value?.fullPath) {
    return
  }

  try {
    await navigator.clipboard.writeText(latestOutput.value.fullPath)
    copiedOutputPath.value = true
    clearCopiedPathTimer()
    copiedPathTimer = window.setTimeout(() => {
      copiedOutputPath.value = false
      copiedPathTimer = null
    }, 1600)
  } catch {
    copiedOutputPath.value = false
  }
}

async function openOutputParentFolder() {
  openingOutputFolder.value = true

  try {
    await apiJson('/api/open-parent-folder', {
      method: 'POST',
      body: JSON.stringify({
        filename: latestOutput.value?.filename ?? null,
        subfolder: latestOutput.value?.subfolder ?? '',
        type: latestOutput.value?.type ?? 'output',
      }),
    })
  } finally {
    openingOutputFolder.value = false
  }
}

async function loadCheckpoints() {
  loadingCheckpoints.value = true
  loadingError.value = ''

  try {
    const payload = await apiJson<CheckpointResponse>('/api/checkpoints', {
      method: 'GET',
    })

    checkpoints.value = payload.checkpoints ?? []
    const availableCheckpointNames = new Set(checkpoints.value.map((checkpoint) => checkpoint.name))
    selectedCheckpoints.value = selectedCheckpoints.value.filter((selection) =>
      availableCheckpointNames.has(selection.name),
    )

    if (!selectedCheckpoints.value.length) {
      const fallbackCheckpoint = payload.defaultCheckpoint ?? payload.checkpoints?.[0]?.name ?? ''
      if (fallbackCheckpoint) {
        selectedCheckpoints.value = [buildCheckpointSelection(fallbackCheckpoint)]
      }
    }

    if (!checkpoints.value.length) {
      loadingError.value = 'No checkpoints detected.'
    }
  } catch (error) {
    loadingError.value = error instanceof Error ? error.message : 'Could not load checkpoints.'
  } finally {
    loadingCheckpoints.value = false
  }
}

async function loadLoras() {
  loadingLoras.value = true
  loraLoadingError.value = ''

  try {
    const payload = await apiJson<LoraResponse>('/api/loras', {
      method: 'GET',
    })

    loras.value = payload.loras ?? []
    defaultLoraStrength.value = formatLoraStrength(payload.defaultStrength ?? 1)
    const availableLoraNames = new Set(loras.value.map((lora) => lora.name))
    selectedCheckpoints.value = selectedCheckpoints.value.map((checkpoint) => ({
      ...checkpoint,
      loras: checkpoint.loras
        .filter((selection) => availableLoraNames.has(selection.name))
        .map((selection) =>
          buildLoraSelection(
            selection.name,
            selection.strength || defaultLoraStrength.value,
            selection.enabled,
            selection.enabledTriggerWords,
            selection.triggerWordWeights,
          ),
        ),
    }))

    if (!loras.value.length) {
      loraLoadingError.value = 'No LoRAs detected in ComfyUI.'
    }
  } catch (error) {
    loraLoadingError.value = error instanceof Error ? error.message : 'Could not load LoRAs.'
  } finally {
    loadingLoras.value = false
  }
}

async function loadControlNets() {
  loadingControlNets.value = true
  controlNetLoadingError.value = ''

  try {
    const payload = await apiJson<ControlNetResponse>('/api/controlnets', {
      method: 'GET',
    })

    controlNets.value = payload.controlNets ?? []
    if (Array.isArray(payload.preprocessors) && payload.preprocessors.length) {
      controlNetPreprocessors.value = payload.preprocessors
    }
    selectedCheckpoints.value = selectedCheckpoints.value.map((checkpoint) => ({
      ...checkpoint,
      controlNets: (checkpoint.controlNets ?? []).map((selection) => ({
        ...selection,
        model: resolveAvailableControlNetModel(selection.model),
      })),
    }))

    if (!controlNets.value.length) {
      controlNetLoadingError.value = 'No ControlNet models detected in ComfyUI.'
    }
  } catch (error) {
    controlNetLoadingError.value =
      error instanceof Error ? error.message : 'Could not load ControlNet models.'
  } finally {
    loadingControlNets.value = false
  }
}

async function loadGenerationOptions() {
  loadingGenerationOptions.value = true
  generationOptionsError.value = ''

  try {
    const payload = await apiJson<GenerationOptionsResponse>('/api/generation-options', {
      method: 'GET',
    })

    samplerOptions.value = payload.samplers ?? []
    schedulerOptions.value = payload.schedulers ?? []
    clipNameOptions.value = payload.clipNames ?? []
    vaeNameOptions.value = payload.vaeNames ?? []
    generationOptionDefaults.value = payload.defaults ?? {}
  } catch (error) {
    generationOptionsError.value =
      error instanceof Error ? error.message : 'Could not load sampler options.'
  } finally {
    loadingGenerationOptions.value = false
  }
}

return {
  clearCopiedPathTimer,
  useLastGeneratedSeed,
  formatElapsed,
  setIdleState,
  openResetDialog,
  closeResetDialog,
  resetForm,
  syncBatchPreviewState,
  copyOutputPath,
  openOutputParentFolder,
  loadCheckpoints,
  loadLoras,
  loadControlNets,
  loadGenerationOptions,
}
}
