import { nextTick, onBeforeUnmount, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { apiJson } from './homeApi'
import { createHomeAspectActions } from './homeAspectActions'
import {
  FORM_TAB_IDS,
  FORM_TAB_QUERY_KEY,
  FORM_TABS,
  PROMPT_SECTION_DEFINITIONS,
} from './homeConstants'
import { createHomeControlNetActions } from './homeControlNetActions'
import { createHomeGenerationActions } from './homeGenerationActions'
import { createHomeImageActions } from './homeImageActions'
import { createHomeImageSnapshots } from './homeImageSnapshots'
import {
  formatElapsedDuration,
  getJobEntryElapsedMs,
  getJobEntryPreviewHiddenOutputCount,
  getJobEntryPreviewOutputKey,
  getJobEntryPreviewVisibleOutputs,
  getJobEntryPrimaryLabel,
  getJobEntryReferenceLabel,
  getJobEntrySecondaryLabel,
  getJobEntryStateLabel,
  getJobEntryVariantSummary,
  getJobListTabForState,
  isJobEntryActive as isJobEntryActiveForPrompt,
} from './homeJobHelpers'
import { createHomeJobListComputed } from './homeJobListComputed'
import { createHomeJobPollingActions } from './homeJobPollingActions'
import { createHomeLoraActions } from './homeLoraActions'
import { createHomeModelActions } from './homeModelActions'
import { createHomePersistence } from './homePersistence'
import { createHomePreviewComputed, type HomePreviewComputed } from './homePreviewComputed'
import { createHomePreviewModalActions } from './homePreviewModalActions'
import { createHomePromptImprovementTimer } from './homePromptImprovementTimer'
import { buildPromptVariantsFromFields } from './homePromptVariants'
import { createHomePromptTagActions } from './homePromptTagActions'
import { createHomePromptWeightActions } from './homePromptWeightActions'
import { createHomeRuntimeActions } from './homeRuntimeActions'
import { createHomeSelectionComputed } from './homeSelectionComputed'
import { createHomeState } from './homeState'
import { createHomeStatusComputed } from './homeStatusComputed'
import type { FormTab, JobOutput } from './homeTypes'
import { isVideoPreview } from './homeValueHelpers'

export type { HomeCheckpointEntry, HomeLoraSelection } from './homeTypes'

export function useHomeView() {
const route = useRoute()
const router = useRouter()
const state = createHomeState()
let suppressFormTabRouteSync = false
let preview = {} as HomePreviewComputed
/* eslint-disable prefer-const */
let controlNetActions!: ReturnType<typeof createHomeControlNetActions>
let generationActions!: ReturnType<typeof createHomeGenerationActions>
let imageActions!: ReturnType<typeof createHomeImageActions>
let runtimeActions!: ReturnType<typeof createHomeRuntimeActions>
/* eslint-enable prefer-const */

function firstRouteQueryValue(value: unknown) {
  return Array.isArray(value) ? value[0] : value
}

function parseRouteFormTab(value: unknown): FormTab {
  const rawValue = firstRouteQueryValue(value)
  const normalizedValue = typeof rawValue === 'string' ? rawValue.trim().toLowerCase() : ''
  return FORM_TAB_IDS.includes(normalizedValue as FormTab) ? (normalizedValue as FormTab) : 'assets'
}

function syncFormTabFromRoute() {
  const nextTab = parseRouteFormTab(route.query[FORM_TAB_QUERY_KEY])
  if (state.formTab.value === nextTab) {
    return
  }

  suppressFormTabRouteSync = true
  state.formTab.value = nextTab
  void nextTick(() => {
    suppressFormTabRouteSync = false
  })
}

const promptActions = createHomePromptTagActions(state)
const promptWeightActions = createHomePromptWeightActions(state)
const aspectActions = createHomeAspectActions(state)
const promptTimer = createHomePromptImprovementTimer(state)
const selection = createHomeSelectionComputed(state, {
  buildImprovedPromptForGeneration: promptActions.buildImprovedPromptForGeneration,
  buildNegativePromptFromTags: promptActions.buildNegativePromptFromTags,
  buildPromptFromSections: promptActions.buildPromptFromSections,
  buildPromptVariantsFromFields,
  getLatestOutput: () => preview.latestOutput?.value ?? null,
  hasPromptSectionDrafts: promptActions.hasPromptSectionDrafts,
})
const imageSnapshots = createHomeImageSnapshots(state, selection)
preview = createHomePreviewComputed(state, selection, {
  formatElapsed: (elapsedMs) => runtimeActions.formatElapsed(elapsedMs),
  getJobInputImageSnapshot: imageSnapshots.getJobInputImageSnapshot,
})
const status = createHomeStatusComputed(state, selection, {
  getScaledAspectRatioSize: aspectActions.getScaledAspectRatioSize,
  normalizeControlNetResolutionFromOutputSize: aspectActions.normalizeControlNetResolutionFromOutputSize,
})
const jobList = createHomeJobListComputed(state, selection, preview, status)
const loraActions = createHomeLoraActions(state, selection, {
  buildStoredInputImagePreviewUrl: imageSnapshots.buildStoredInputImagePreviewUrl,
  normalizeControlNetResolutionFromOutputSize: aspectActions.normalizeControlNetResolutionFromOutputSize,
  resolveAvailableControlNetModel: aspectActions.resolveAvailableControlNetModel,
})
const modelActions = createHomeModelActions(state, selection, {
  buildCheckpointSelection: loraActions.buildCheckpointSelection,
  buildLoraSelection: loraActions.buildLoraSelection,
  formatLoraStrength: loraActions.formatLoraStrength,
})
const persistence = createHomePersistence(state, selection, promptActions, {
  buildCheckpointSelection: loraActions.buildCheckpointSelection,
  buildControlNetSelection: loraActions.buildControlNetSelection,
  buildLoraSelection: loraActions.buildLoraSelection,
  buildStoredInputImagePreviewUrl: imageSnapshots.buildStoredInputImagePreviewUrl,
  captureLockedAspectRatioFromCurrentSize: aspectActions.captureLockedAspectRatioFromCurrentSize,
})
runtimeActions = createHomeRuntimeActions(state, selection, preview, status, {
  apiJson,
  buildCheckpointSelection: loraActions.buildCheckpointSelection,
  buildLoraSelection: loraActions.buildLoraSelection,
  canResetForm: selection.canResetForm,
  clearControlNetInstances: () => controlNetActions.clearControlNetInstances(),
  clearSelectedImage: () => imageActions.clearSelectedImage(),
  formatLoraStrength: loraActions.formatLoraStrength,
  latestOutput: preview.latestOutput,
  persistFormState: persistence.persistFormState,
  resolveAvailableControlNetModel: aspectActions.resolveAvailableControlNetModel,
  stopPromptImprovement: () => generationActions.stopPromptImprovement(),
  suppressNextPromptImprovementStoppedNotice: () =>
    generationActions.suppressNextPromptImprovementStoppedNotice(),
})
controlNetActions = createHomeControlNetActions(state, {
  apiJson,
  applySizeValues: applySourceImageSizeValues,
  buildControlNetSelection: loraActions.buildControlNetSelection,
  getSupportedImageFileFromClipboard: () => imageActions.getSupportedImageFileFromClipboard(),
  getSupportedImageFileFromTransfer: (dataTransfer) =>
    imageActions.getSupportedImageFileFromTransfer(dataTransfer),
  loadImageDimensions: (file) => imageActions.loadImageDimensions(file),
  normalizeControlNetResolutionFromOutputSize: aspectActions.normalizeControlNetResolutionFromOutputSize,
  uploadInputImage: (file) => imageActions.uploadInputImage(file),
})
imageActions = createHomeImageActions(state, selection, status, {
  apiJson,
  applySizeValues: aspectActions.applySizeValues,
  applySourceImageSizeValues,
  clearControlNetGeneratedPreview: controlNetActions.clearControlNetGeneratedPreview,
  generateControlNetPreview: (id, checkpointName) =>
    controlNetActions.generateControlNetPreview(id, checkpointName),
  getControlNetSelection: controlNetActions.getControlNetSelection,
  normalizeControlNetResolutionFromOutputSize: aspectActions.normalizeControlNetResolutionFromOutputSize,
})
const pollingActions = createHomeJobPollingActions(state, selection, preview, status, jobList, {
  apiJson,
  formatElapsed: runtimeActions.formatElapsed,
  setIdleState: runtimeActions.setIdleState,
  syncBatchPreviewState: runtimeActions.syncBatchPreviewState,
})
generationActions = createHomeGenerationActions(state, selection, jobList, pollingActions, {
  apiJson,
  buildCurrentInputImageSnapshot: imageSnapshots.buildCurrentInputImageSnapshot,
  buildImprovedPromptForGeneration: promptActions.buildImprovedPromptForGeneration,
  buildPromptForImprovement: promptActions.buildPromptForImprovement,
  capturePromptImprovementElapsed: promptTimer.capturePromptImprovementElapsed,
  finishPromptImprovementTimer: promptTimer.finishPromptImprovementTimer,
  formatElapsedDuration,
  getCheckpointActiveLoraTriggerWords: loraActions.getCheckpointActiveLoraTriggerWords,
  normalizeControlNetResolutionFromOutputSize: aspectActions.normalizeControlNetResolutionFromOutputSize,
  normalizeLoraStrength: loraActions.normalizeLoraStrength,
  refreshJobs: pollingActions.refreshJobs,
  sizeValidation: status.sizeValidation,
  startPromptImprovementTimer: promptTimer.startPromptImprovementTimer,
  syncSubmittedInputImageSnapshots: imageSnapshots.syncSubmittedInputImageSnapshots,
})
const previewModalActions = createHomePreviewModalActions({
  activePreviewIndex: state.activePreviewIndex,
  canNavigatePreviewModal: preview.canNavigatePreviewModal,
  closeResetDialog: runtimeActions.closeResetDialog,
  errorMessage: state.errorMessage,
  isPreviewModalDragging: state.isPreviewModalDragging,
  isPreviewModalOpen: state.isPreviewModalOpen,
  isPreviewModalPannable: preview.isPreviewModalPannable,
  isResetDialogOpen: state.isResetDialogOpen,
  isSubmittingGenerate: state.isSubmittingGenerate,
  jobsList: state.jobsList,
  previewDisplayItems: preview.previewDisplayItems,
  previewModalOffsetX: state.previewModalOffsetX,
  previewModalOffsetY: state.previewModalOffsetY,
  previewModalOutputIndexes: preview.previewModalOutputIndexes,
  previewModalPanField: state.previewModalPanField,
  previewModalScale: state.previewModalScale,
  previewModalViewport: state.previewModalViewport,
  selectedPreviewModalOutputPosition: preview.selectedPreviewModalOutputPosition,
  statusLine: state.statusLine,
})

function openGeneratedOutputContextMenu(event: MouseEvent, output: JobOutput, checkpointName: string | null = null) {
  if (!output?.url) {
    return
  }

  event.preventDefault()
  event.stopPropagation()
  state.generatedOutputActionError.value = ''
  const menuWidth = 240
  const menuHeight = 120
  state.generatedOutputContextMenu.value = {
    x: Math.min(event.clientX, Math.max(0, window.innerWidth - menuWidth - 8)),
    y: Math.min(event.clientY, Math.max(0, window.innerHeight - menuHeight - 8)),
    output,
    checkpointName,
  }
}

function closeGeneratedOutputContextMenu(force = false) {
  if (state.isApplyingGeneratedOutput.value && !force) {
    return
  }

  state.generatedOutputContextMenu.value = null
  state.generatedOutputActionError.value = ''
}

async function fetchGeneratedOutputFile(output: JobOutput) {
  const response = await fetch(output.url)
  if (!response.ok) {
    throw new Error('Could not load the generated image.')
  }

  const blob = await response.blob()
  const mimeType = blob.type || 'image/png'
  return new File([blob], output.filename || 'generated-output.png', {
    type: mimeType,
    lastModified: Date.now(),
  })
}

async function useGeneratedOutputAsImageInput() {
  const menu = state.generatedOutputContextMenu.value
  if (!menu || state.isApplyingGeneratedOutput.value) {
    return
  }

  state.generatedOutputActionError.value = ''
  state.isApplyingGeneratedOutput.value = true
  try {
    const file = await fetchGeneratedOutputFile(menu.output)
    state.formTab.value = 'image'
    await imageActions.setSelectedImage(file)
    closeGeneratedOutputContextMenu(true)
  } catch (error) {
    state.generatedOutputActionError.value =
      error instanceof Error ? error.message : 'Could not use the generated image as image input.'
  } finally {
    state.isApplyingGeneratedOutput.value = false
  }
}

async function useGeneratedOutputAsControlNet() {
  const menu = state.generatedOutputContextMenu.value
  if (!menu || state.isApplyingGeneratedOutput.value) {
    return
  }

  state.generatedOutputActionError.value = ''
  state.isApplyingGeneratedOutput.value = true
  try {
    const file = await fetchGeneratedOutputFile(menu.output)
    state.formTab.value = 'assets'
    await controlNetActions.addControlNetImageFromFile(file, menu.checkpointName ?? '')
    closeGeneratedOutputContextMenu(true)
  } catch (error) {
    state.generatedOutputActionError.value =
      error instanceof Error ? error.message : 'Could not use the generated image as ControlNet input.'
  } finally {
    state.isApplyingGeneratedOutput.value = false
  }
}

let shouldSkipNextControlNetOutputResolutionSync = false
function applySourceImageSizeValues(nextWidth: string | number, nextHeight: string | number) {
  shouldSkipNextControlNetOutputResolutionSync = true
  aspectActions.applySizeValues(nextWidth, nextHeight)
  void nextTick(() => {
    shouldSkipNextControlNetOutputResolutionSync = false
  })
}

persistence.restoreFormState()
let previousControlNetOutputResolution = aspectActions.normalizeControlNetResolutionFromOutputSize()

watch(() => [status.sizeValidation.value.width, status.sizeValidation.value.height] as const, () => {
  const nextResolution = aspectActions.normalizeControlNetResolutionFromOutputSize()
  const previousResolution = previousControlNetOutputResolution
  const shouldSkipSync = shouldSkipNextControlNetOutputResolutionSync
  shouldSkipNextControlNetOutputResolutionSync = false
  previousControlNetOutputResolution = nextResolution
  if (nextResolution !== previousResolution) {
    if (shouldSkipSync) {
      return
    }

    controlNetActions.syncOutputDerivedControlNetResolutions(previousResolution, nextResolution)
  }
})

watch(() => ({
  cfg: state.cfg.value,
  flattenInputImageBackground: state.flattenInputImageBackground.value,
  height: state.height.value,
  imageDenoise: state.imageDenoise.value,
  inputImageBackgroundColor: state.inputImageBackgroundColor.value,
  inputImage: state.uploadedInputImageName.value,
  llmInstruction: state.llmInstruction.value,
  negativePrompt: selection.compiledNegativePrompt.value,
  prompt: selection.compiledPrompt.value,
  selectedCheckpoints: state.selectedCheckpoints.value,
  selectedImageDimensions: state.selectedImageDimensions.value,
  selectedOllamaModel: state.selectedOllamaModel.value,
  seed: state.seed.value,
  toggles: [state.useOriginalPrompt.value, state.useImprovedPrompt.value, state.usePromptImprover.value],
  useInputImage: state.useInputImage.value,
  width: state.width.value,
}), persistence.persistFormState, { deep: true })

watch(() => [
  state.flattenInputImageBackground.value,
  state.inputImageBackgroundColor.value,
] as const, () => {
  void imageActions.reprocessSelectedImageBackground()
})

watch(() => ({
  checkpointName: selection.promptImproverCheckpointName.value,
  improvedPrompt: state.improvedPrompt.value,
  inputImage: state.uploadedInputImageName.value,
  llmInstruction: state.llmInstruction.value,
  prompt: selection.compiledPrompt.value,
  selectedOllamaModel: state.selectedOllamaModel.value,
  useInputImage: state.useInputImage.value,
  usePromptImprover: state.usePromptImprover.value,
}), () => {
  state.promptImprovementError.value = ''
  state.promptImprovementNotice.value = ''
}, { deep: true })

watch(state.selectedCheckpointPicker, (value) => {
  if (value) {
    modelActions.addSelectedCheckpoint(value)
  }
})
watch(state.width, () => aspectActions.handleLinkedSizeChange('width'))
watch(state.height, () => aspectActions.handleLinkedSizeChange('height'))
watch(state.activePromptId, () => {
  state.copiedOutputPath.value = false
  pollingActions.applySelectedJobState(selection.selectedJob.value)
})
watch(() => preview.previewDisplayItems.value.length, (length) => {
  state.activePreviewIndex.value = length ? Math.min(state.activePreviewIndex.value, length - 1) : 0
})
watch(preview.selectedPreviewOutput, (output) => {
  if (!output && state.isPreviewModalOpen.value) {
    previewModalActions.closePreviewModal()
  }
})
watch(state.isPreviewModalOpen, (isOpen) => {
  if (typeof document !== 'undefined') {
    document.body.style.overflow = isOpen ? 'hidden' : ''
  }
})
watch(() => route.query[FORM_TAB_QUERY_KEY], syncFormTabFromRoute)
watch(state.formTab, (tab) => {
  if (suppressFormTabRouteSync) {
    return
  }

  const nextQuery = { ...route.query }
  if (tab === 'assets') {
    delete nextQuery[FORM_TAB_QUERY_KEY]
  } else {
    nextQuery[FORM_TAB_QUERY_KEY] = tab
  }

  if (route.query[FORM_TAB_QUERY_KEY] !== nextQuery[FORM_TAB_QUERY_KEY]) {
    void router.replace({ query: nextQuery })
  }
})

onMounted(async () => {
  syncFormTabFromRoute()
  window.addEventListener('keydown', previewModalActions.handlePreviewModalKeydown)
  await Promise.allSettled([
    runtimeActions.loadCheckpoints(),
    runtimeActions.loadLoras(),
    runtimeActions.loadControlNets(),
    runtimeActions.loadOllamaModels(),
    pollingActions.refreshJobs(),
  ])
  pollingActions.applySelectedJobState(selection.selectedJob.value)
  pollingActions.startPolling()
})

onBeforeUnmount(() => {
  pollingActions.clearPolling()
  runtimeActions.clearCopiedPathTimer()
  promptTimer.clearPromptImprovementTimer()
  imageActions.revokeSelectedImagePreview()
  controlNetActions.getAllControlNetSelections().forEach((controlNet) =>
    controlNetActions.revokeControlNetPreview(controlNet),
  )
  controlNetActions.clearControlNetPreviewCopyTimers()
  generationActions.suppressNextPromptImprovementStoppedNotice()
  generationActions.stopPromptImprovement()
  window.removeEventListener('keydown', previewModalActions.handlePreviewModalKeydown)
  document.body.style.overflow = ''
})

const isJobEntryActive = (entry: Parameters<typeof isJobEntryActiveForPrompt>[0]) =>
  isJobEntryActiveForPrompt(entry, state.activePromptId.value)

return {
  ...state,
  ...selection,
  ...preview,
  ...status,
  ...jobList,
  ...promptActions,
  ...promptWeightActions,
  ...aspectActions,
  ...imageSnapshots,
  ...loraActions,
  ...modelActions,
  ...persistence,
  ...runtimeActions,
  ...controlNetActions,
  ...imageActions,
  ...pollingActions,
  ...generationActions,
  ...previewModalActions,
  openGeneratedOutputContextMenu,
  closeGeneratedOutputContextMenu,
  useGeneratedOutputAsImageInput,
  useGeneratedOutputAsControlNet,
  formTabs: FORM_TABS,
  promptSectionDefinitions: PROMPT_SECTION_DEFINITIONS,
  getJobEntryElapsedMs,
  getJobEntryPreviewHiddenOutputCount,
  getJobEntryPreviewOutputKey,
  getJobEntryPreviewVisibleOutputs,
  getJobEntryPrimaryLabel,
  getJobEntryReferenceLabel,
  getJobEntrySecondaryLabel,
  getJobEntryStateLabel,
  getJobEntryVariantSummary,
  getJobListTabForState,
  isJobEntryActive,
  isVideoPreview,
}
}

export type HomeViewContext = ReturnType<typeof useHomeView>
