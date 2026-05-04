import { computed } from 'vue'
import type { HomeState } from './homeState'
import type { CheckpointEntry, PromptVariant } from './homeTypes'

type HomeBuildPromptFromSections = (
  sections: HomeState['promptSections']['value'],
  drafts?: HomeState['promptSectionDrafts']['value'],
) => string

type HomeSelectionComputedDeps = {
  buildNegativePromptFromTags: (includeDraft?: boolean) => string
  buildImprovedPromptForGeneration: () => string
  buildPromptFromSections: HomeBuildPromptFromSections
  buildPromptVariantsFromFields: (promptText: string, improvedPromptText: string, includeOriginal: boolean, includeImproved: boolean) => PromptVariant[]
  getLatestOutput: () => unknown
  hasPromptSectionDrafts: () => boolean
}

export function createHomeSelectionComputed(state: HomeState, deps: HomeSelectionComputedDeps) {
const {
  activePromptId,
  cfg,
  checkpoints,
  controlNetPreprocessors,
  controlNets,
  defaultOllamaModel,
  height,
  imageDenoise,
  improvedPrompt,
  inputImageUploadError,
  flattenInputImageBackground,
  inputImageBackgroundColor,
  jobsList,
  loras,
  loadingCheckpoints,
  llmInstruction,
  maintainAspectRatio,
  negativePrompt,
  negativePromptDraft,
  negativePromptTags,
  ollamaModels,
  prompt,
  promptImprovementError,
  promptImprovementNotice,
  promptSectionDrafts,
  promptSections,
  seed,
  steps,
  selectedCheckpoints,
  selectedImageDimensions,
  selectedImageDisplayName,
  selectedImageFile,
  selectedImagePreviewUrl,
  selectedOllamaModel,
  submissionError,
  uploadedInputImageName,
  useImprovedPrompt,
  useInputImage,
  useOriginalPrompt,
  usePromptImprover,
  width,
} = state
const {
  buildImprovedPromptForGeneration,
  buildNegativePromptFromTags,
  buildPromptFromSections,
  buildPromptVariantsFromFields,
  getLatestOutput,
  hasPromptSectionDrafts,
} = deps

const hasInputImage = computed(() => Boolean(selectedImagePreviewUrl.value))
const shouldUseInputImage = computed(() => useInputImage.value && hasInputImage.value)
const selectedInputImageName = computed(() => {
  return selectedImageDisplayName.value ?? selectedImageFile.value?.name ?? uploadedInputImageName.value
})
const selectedJob = computed(() => {
  if (activePromptId.value) {
    return jobsList.value.find((job) => job.promptId === activePromptId.value) ?? null
  }

  return jobsList.value[0] ?? null
})
const selectedCheckpointEntries = computed(() => {
  return selectedCheckpoints.value
    .map((selection) => {
      const meta = checkpoints.value.find((checkpoint) => checkpoint.name === selection.name) ?? null
      if (!meta) {
        return null
      }

      return {
        ...selection,
        controlNets: selection.controlNets ?? [],
        family: meta.family,
        displayName: meta.displayName ?? meta.name,
        downloaded: meta.downloaded === true,
        previewUrl: meta.previewUrl ?? null,
        previewMediaType: meta.previewMediaType ?? null,
        compatibility: meta.compatibility ?? null,
      }
    })
    .filter((selection): selection is CheckpointEntry => Boolean(selection))
})
const enabledCheckpointEntries = computed(() => {
  return selectedCheckpointEntries.value.filter((checkpoint) => checkpoint.enabled)
})
const primarySelectedCheckpointMeta = computed(() => {
  return enabledCheckpointEntries.value[0] ?? selectedCheckpointEntries.value[0] ?? null
})
const selectedCheckpointNames = computed(() => {
  return new Set(selectedCheckpoints.value.map((selection) => selection.name))
})
const checkpointOptions = computed(() => {
  return checkpoints.value
    .filter((checkpoint) => !selectedCheckpointNames.value.has(checkpoint.name))
    .map((checkpoint) => ({
      label: checkpoint.displayName ?? checkpoint.name,
      value: checkpoint.name,
      previewUrl: checkpoint.previewUrl ?? null,
      previewMediaType: checkpoint.previewMediaType ?? null,
      modelNsfw: checkpoint.modelNsfw ?? checkpoint.compatibility?.modelNsfw ?? null,
      modelMetadata: {
        nsfw: checkpoint.modelNsfw ?? checkpoint.compatibility?.modelNsfw ?? null,
      },
      typeLabel: 'Checkpoint',
    }))
})
const loraDetailsByName = computed(() => {
  return new Map(loras.value.map((lora) => [lora.name, lora]))
})
const controlNetOptions = computed(() => {
  return controlNets.value.map((controlNet) => ({
    label: controlNet.displayName ?? controlNet.name,
    value: controlNet.name,
  }))
})
const controlNetPreprocessorOptions = computed(() => {
  return controlNetPreprocessors.value.map((preprocessor) => ({
    label: preprocessor.label,
    value: preprocessor.id,
  }))
})
const enabledControlNetSelections = computed(() => [])
const enabledCheckpointControlNetSelections = computed(() => {
  return enabledCheckpointEntries.value.flatMap((checkpoint) =>
    (checkpoint.controlNets ?? []).filter((controlNet) => controlNet.enabled),
  )
})
const isUploadingAnyControlNetImage = computed(() => {
  return selectedCheckpointEntries.value.flatMap((checkpoint) => checkpoint.controlNets ?? [])
    .some((controlNet) => controlNet.isUploading)
})
const controlNetGenerationBlocker = computed(() => {
  const scopedControlNets = enabledCheckpointEntries.value.flatMap((checkpoint) =>
    (checkpoint.controlNets ?? [])
      .filter((controlNet) => controlNet.enabled)
      .map((controlNet) => ({ controlNet, checkpoint })),
  )

  for (const { controlNet, checkpoint } of scopedControlNets) {
    const prefix = checkpoint ? `${checkpoint.displayName}: ` : ''
    if (controlNet.isUploading) {
      return `${prefix}ControlNet image is still uploading.`
    }

    if (!controlNet.model) {
      return `${prefix}Choose a ControlNet model or disable the empty instance.`
    }

    if (!controlNet.inputImageName) {
      return `${prefix}Attach a control image or disable the empty ControlNet instance.`
    }
  }

  return ''
})
const controlNetSummary = computed(() => {
  const total = selectedCheckpointEntries.value.reduce(
    (count, checkpoint) => count + (checkpoint.controlNets?.length ?? 0),
    0,
  )
  const enabled = enabledCheckpointControlNetSelections.value.length
  if (!total) {
    return 'No ControlNet instances.'
  }

  return `${enabled} enabled of ${total} configured`
})
const ollamaModelOptions = computed(() => {
  return ollamaModels.value.map((modelName) => ({
    label: modelName,
    value: modelName,
  }))
})
const cfgPlaceholder = computed(() => {
  return primarySelectedCheckpointMeta.value?.family === 'anima' ? '4.0' : '5.5'
})
const stepsPlaceholder = computed(() => {
  return '20'
})
const imageDenoisePlaceholder = computed(() => {
  return primarySelectedCheckpointMeta.value?.family === 'anima' ? '0.75' : '0.75'
})
const selectedCheckpointSummary = computed(() => {
  const total = selectedCheckpointEntries.value.length
  const enabled = enabledCheckpointEntries.value.length
  if (!total) {
    return 'No checkpoints selected yet.'
  }

  return `${enabled} enabled of ${total} selected`
})
const checkpointPickerPlaceholder = computed(() => {
  if (loadingCheckpoints.value) {
    return 'Loading checkpoints...'
  }

  return checkpointOptions.value.length ? 'Add checkpoint' : 'All checkpoints selected'
})
const promptImproverCheckpointName = computed(() => {
  return enabledCheckpointEntries.value[0]?.name ?? ''
})
const sourceImageDimensionLabel = computed(() => {
  if (!selectedImageDimensions.value) {
    return 'Use source image resolution'
  }

  return `Use source image resolution (${selectedImageDimensions.value.width} x ${selectedImageDimensions.value.height})`
})
const outputFolderTooltip = computed(() => {
  return getLatestOutput() ? 'Open parent folder' : 'Open output folder'
})
const compiledPrompt = computed(() => buildPromptFromSections(promptSections.value, promptSectionDrafts.value) || prompt.value.trim())
const compiledNegativePrompt = computed(() => buildNegativePromptFromTags(true) || negativePrompt.value.trim())
const hasOriginalPromptText = computed(() => Boolean(compiledPrompt.value))
const hasImprovedPromptText = computed(() => Boolean(improvedPrompt.value.trim()))
const hasPromptSectionTags = computed(() =>
  Object.values(promptSections.value).some((sectionTags) => sectionTags.length > 0),
)
const canResetForm = computed(() => {
  return Boolean(
    compiledPrompt.value ||
      improvedPrompt.value ||
      compiledNegativePrompt.value ||
      hasPromptSectionTags.value ||
      hasPromptSectionDrafts() ||
      negativePromptTags.value.length ||
      negativePromptDraft.value ||
      !useOriginalPrompt.value ||
      !useImprovedPrompt.value ||
      selectedCheckpoints.value.length ||
      selectedOllamaModel.value !== defaultOllamaModel.value ||
      width.value !== '1024' ||
      height.value !== '1024' ||
      seed.value ||
      steps.value ||
      cfg.value ||
      imageDenoise.value ||
      usePromptImprover.value ||
      maintainAspectRatio.value ||
      llmInstruction.value ||
      useInputImage.value ||
      flattenInputImageBackground.value ||
      inputImageBackgroundColor.value !== '#ffffff' ||
      selectedImageFile.value ||
      selectedImageDisplayName.value ||
      uploadedInputImageName.value ||
      selectedImageDimensions.value ||
      submissionError.value ||
      promptImprovementError.value ||
      promptImprovementNotice.value ||
      inputImageUploadError.value,
  )
})
const requestedPromptVariants = computed(() => {
  return buildPromptVariantsFromFields(
    compiledPrompt.value,
    buildImprovedPromptForGeneration(),
    useOriginalPrompt.value,
    useImprovedPrompt.value,
  )
})
const originalPromptGenerationState = computed(() => {
  if (!useOriginalPrompt.value) {
    return hasOriginalPromptText.value ? 'Skipped' : 'Off'
  }

  return hasOriginalPromptText.value ? 'Included' : 'Empty'
})
const improvedPromptGenerationState = computed(() => {
  if (!useImprovedPrompt.value) {
    return hasImprovedPromptText.value ? 'Skipped' : 'Off'
  }

  return hasImprovedPromptText.value ? 'Included' : 'Empty'
})

return {
  hasInputImage,
  shouldUseInputImage,
  selectedInputImageName,
  selectedJob,
  selectedCheckpointEntries,
  enabledCheckpointEntries,
  primarySelectedCheckpointMeta,
  selectedCheckpointNames,
  checkpointOptions,
  loraDetailsByName,
  controlNetOptions,
  controlNetPreprocessorOptions,
  enabledControlNetSelections,
  enabledCheckpointControlNetSelections,
  isUploadingAnyControlNetImage,
  controlNetGenerationBlocker,
  controlNetSummary,
  ollamaModelOptions,
  cfgPlaceholder,
  stepsPlaceholder,
  imageDenoisePlaceholder,
  selectedCheckpointSummary,
  checkpointPickerPlaceholder,
  promptImproverCheckpointName,
  sourceImageDimensionLabel,
  outputFolderTooltip,
  compiledPrompt,
  compiledNegativePrompt,
  hasOriginalPromptText,
  hasImprovedPromptText,
  canResetForm,
  requestedPromptVariants,
  originalPromptGenerationState,
  improvedPromptGenerationState,
}
}

export type HomeSelectionComputed = ReturnType<typeof createHomeSelectionComputed>
