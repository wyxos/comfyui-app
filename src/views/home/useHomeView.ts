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
import type { FormTab } from './homeTypes'
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
  buildControlNetSelection: loraActions.buildControlNetSelection,
  getSupportedImageFileFromTransfer: (dataTransfer) =>
    imageActions.getSupportedImageFileFromTransfer(dataTransfer),
  loadImageDimensions: (file) => imageActions.loadImageDimensions(file),
  normalizeControlNetResolutionFromOutputSize: aspectActions.normalizeControlNetResolutionFromOutputSize,
  uploadInputImage: (file) => imageActions.uploadInputImage(file),
})
imageActions = createHomeImageActions(state, selection, status, {
  apiJson,
  applySizeValues: aspectActions.applySizeValues,
  clearControlNetGeneratedPreview: controlNetActions.clearControlNetGeneratedPreview,
  generateControlNetPreview: (id) => controlNetActions.generateControlNetPreview(id),
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

persistence.restoreFormState()
let previousControlNetOutputResolution = aspectActions.normalizeControlNetResolutionFromOutputSize()

watch(() => [status.sizeValidation.value.width, status.sizeValidation.value.height] as const, () => {
  const nextResolution = aspectActions.normalizeControlNetResolutionFromOutputSize()
  const previousResolution = previousControlNetOutputResolution
  previousControlNetOutputResolution = nextResolution
  if (nextResolution !== previousResolution) {
    controlNetActions.syncOutputDerivedControlNetResolutions(previousResolution, nextResolution)
  }
})

watch(() => ({
  cfg: state.cfg.value,
  controlNets: state.selectedControlNets.value,
  height: state.height.value,
  imageDenoise: state.imageDenoise.value,
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
  state.selectedControlNets.value.forEach((controlNet) => controlNetActions.revokeControlNetPreview(controlNet))
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
