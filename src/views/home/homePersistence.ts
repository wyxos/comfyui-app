import {
  createEmptyPromptSections,
  createEmptyPromptSectionsDrafts,
  FORM_STATE_STORAGE_KEY,
  PROMPT_SECTION_DEFINITIONS,
} from './homeConstants'
import type { HomeSelectionComputed } from './homeSelectionComputed'
import type { HomeState } from './homeState'
import type {
  CheckpointSelection,
  ControlNetSelection,
  LoraSelection,
  PersistedControlNetSelection,
  PersistedFormState,
  PromptTag,
} from './homeTypes'
import {
  buildPromptTag,
  coerceFieldString,
  coerceTrimmedFieldString,
  createClientId,
  formatControlNetNumber,
  isRecord,
  normalizePromptTags,
  splitPromptDraft,
} from './homeValueHelpers'

type HomePersistencePromptActions = {
  buildPromptFromSections: (sections: HomeState['promptSections']['value']) => string
  buildPromptSectionsForPersistence: () => HomeState['promptSections']['value']
}

type HomePersistenceDeps = {
  buildCheckpointSelection: (
    name: string,
    enabled?: boolean,
    loraSelections?: LoraSelection[],
    loraPicker?: string,
  ) => CheckpointSelection
  buildControlNetSelection: (entry?: Partial<PersistedControlNetSelection>) => ControlNetSelection
  buildLoraSelection: (
    name: string,
    strength: string | number,
    enabled?: boolean,
    enabledTriggerWords?: string[],
    triggerWordWeights?: Record<string, unknown>,
  ) => LoraSelection
  buildStoredInputImagePreviewUrl: (inputImageName: string) => string
  captureLockedAspectRatioFromCurrentSize: () => void
}

export function createHomePersistence(
  state: HomeState,
  selection: HomeSelectionComputed,
  promptActions: HomePersistencePromptActions,
  deps: HomePersistenceDeps,
) {
const {
  aspectRatioScale,
  cfg,
  defaultLoraStrength,
  height,
  imageDenoise,
  improvedPrompt,
  llmInstruction,
  maintainAspectRatio,
  negativePrompt,
  negativePromptDraft,
  negativePromptTags,
  prompt,
  promptSectionDrafts,
  promptSections,
  selectedCheckpoints,
  selectedControlNets,
  selectedImageDimensions,
  selectedImageDisplayName,
  selectedImagePreviewUrl,
  selectedOllamaModel,
  seed,
  uploadedInputImageName,
  useImprovedPrompt,
  useInputImage,
  useOriginalPrompt,
  usePromptImprover,
  width,
} = state
const { compiledNegativePrompt, compiledPrompt, selectedCheckpointEntries } = selection
const { buildPromptFromSections, buildPromptSectionsForPersistence } = promptActions
const {
  buildCheckpointSelection,
  buildControlNetSelection,
  buildLoraSelection,
  buildStoredInputImagePreviewUrl,
  captureLockedAspectRatioFromCurrentSize,
} = deps

function normalizePersistedControlNetSelection(entry: unknown) {
  if (!isRecord(entry)) {
    return null
  }

  const id = coerceTrimmedFieldString(entry.id) || createClientId('controlnet')
  const model = coerceTrimmedFieldString(entry.model)
  const inputImageName = coerceTrimmedFieldString(entry.inputImageName)

  return {
    id,
    enabled: entry.enabled !== false,
    model,
    preprocessor: coerceTrimmedFieldString(entry.preprocessor) || 'lineart',
    lineartPolarity: coerceTrimmedFieldString(entry.lineartPolarity) === 'black-lines'
      ? 'black-lines'
      : 'white-lines',
    previewResolution: formatControlNetNumber(coerceFieldString(entry.previewResolution), 512, 64, 16384),
    strength: formatControlNetNumber(coerceFieldString(entry.strength), 1, 0, 10),
    startPercent: formatControlNetNumber(coerceFieldString(entry.startPercent), 0, 0, 1),
    endPercent: formatControlNetNumber(coerceFieldString(entry.endPercent), 1, 0, 1),
    inputImageName,
    inputImageDisplayName: coerceTrimmedFieldString(entry.inputImageDisplayName) || inputImageName,
    inputImageWidth:
      typeof entry.inputImageWidth === 'number' && Number.isFinite(entry.inputImageWidth)
        ? entry.inputImageWidth
        : null,
    inputImageHeight:
      typeof entry.inputImageHeight === 'number' && Number.isFinite(entry.inputImageHeight)
        ? entry.inputImageHeight
        : null,
  }
}

function normalizePersistedPromptSections(value: unknown) {
  const sections = createEmptyPromptSections()
  if (!isRecord(value)) {
    return sections
  }

  for (const section of PROMPT_SECTION_DEFINITIONS) {
    sections[section.id] = normalizePromptTags(value[section.id])
  }

  return sections
}

function readPersistedFormState(): Partial<PersistedFormState> {
  if (typeof window === 'undefined') {
    return {}
  }

  const rawValue = window.localStorage.getItem(FORM_STATE_STORAGE_KEY)
  if (!rawValue) {
    return {}
  }

  try {
    const parsed = JSON.parse(rawValue) as Partial<PersistedFormState>
    const selectedCheckpointsFromState = Array.isArray(parsed.selectedCheckpoints)
      ? parsed.selectedCheckpoints
          .map((entry) => {
            const name = typeof entry?.name === 'string' ? entry.name.trim() : ''
            if (!name) {
              return null
            }

            const checkpointLoras = Array.isArray(entry.loras)
              ? entry.loras
                  .map((lora) => {
                    const loraName = typeof lora?.name === 'string' ? lora.name.trim() : ''
                    if (!loraName) {
                      return null
                    }

                    return buildLoraSelection(
                      loraName,
                      typeof lora.strength === 'string' || typeof lora.strength === 'number'
                        ? lora.strength
                        : defaultLoraStrength.value,
                      lora.enabled !== false,
                      Array.isArray(lora.enabledTriggerWords) ? lora.enabledTriggerWords : undefined,
                      isRecord(lora.triggerWordWeights) ? lora.triggerWordWeights : undefined,
                    )
                  })
                  .filter((lora): lora is LoraSelection => Boolean(lora))
              : []

            return buildCheckpointSelection(name, entry.enabled !== false, checkpointLoras)
          })
          .filter((entry): entry is CheckpointSelection => Boolean(entry))
      : []
    const controlNetsFromState = Array.isArray(parsed.controlNets)
      ? parsed.controlNets
          .map(normalizePersistedControlNetSelection)
          .filter((entry): entry is PersistedControlNetSelection => Boolean(entry))
      : []

    return {
      prompt: typeof parsed.prompt === 'string' ? parsed.prompt : '',
      improvedPrompt: typeof parsed.improvedPrompt === 'string' ? parsed.improvedPrompt : '',
      negativePrompt: typeof parsed.negativePrompt === 'string' ? parsed.negativePrompt : '',
      promptSections: normalizePersistedPromptSections(parsed.promptSections),
      negativePromptTags: normalizePromptTags(parsed.negativePromptTags),
      useOriginalPrompt: typeof parsed.useOriginalPrompt === 'boolean' ? parsed.useOriginalPrompt : true,
      useImprovedPrompt: typeof parsed.useImprovedPrompt === 'boolean' ? parsed.useImprovedPrompt : true,
      selectedCheckpoint: typeof parsed.selectedCheckpoint === 'string' ? parsed.selectedCheckpoint : '',
      selectedCheckpoints: selectedCheckpointsFromState,
      selectedOllamaModel: typeof parsed.selectedOllamaModel === 'string' ? parsed.selectedOllamaModel : '',
      width: typeof parsed.width === 'string' ? parsed.width : '1024',
      height: typeof parsed.height === 'string' ? parsed.height : '1024',
      seed: typeof parsed.seed === 'string' ? parsed.seed : '',
      cfg: typeof parsed.cfg === 'string' ? parsed.cfg : '',
      imageDenoise: typeof parsed.imageDenoise === 'string' ? parsed.imageDenoise : '',
      usePromptImprover: Boolean(parsed.usePromptImprover),
      maintainAspectRatio:
        typeof parsed.maintainAspectRatio === 'boolean' ? parsed.maintainAspectRatio : false,
      llmInstruction: typeof parsed.llmInstruction === 'string' ? parsed.llmInstruction : '',
      useInputImage:
        typeof parsed.useInputImage === 'boolean'
          ? parsed.useInputImage
          : typeof parsed.inputImageName === 'string' && Boolean(parsed.inputImageName),
      inputImageName: typeof parsed.inputImageName === 'string' ? parsed.inputImageName : '',
      inputImageDisplayName:
        typeof parsed.inputImageDisplayName === 'string' ? parsed.inputImageDisplayName : '',
      inputImageWidth:
        typeof parsed.inputImageWidth === 'number' && Number.isFinite(parsed.inputImageWidth)
          ? parsed.inputImageWidth
          : null,
      inputImageHeight:
        typeof parsed.inputImageHeight === 'number' && Number.isFinite(parsed.inputImageHeight)
          ? parsed.inputImageHeight
          : null,
      controlNets: controlNetsFromState,
    }
  } catch {
    return {}
  }
}

function persistFormState() {
  if (typeof window === 'undefined') {
    return
  }

  const payload: PersistedFormState = {
    prompt: compiledPrompt.value,
    improvedPrompt: improvedPrompt.value,
    negativePrompt: compiledNegativePrompt.value,
    promptSections: buildPromptSectionsForPersistence(),
    negativePromptTags: normalizePromptTags([
      ...negativePromptTags.value,
      ...splitPromptDraft(negativePromptDraft.value),
    ]),
    useOriginalPrompt: useOriginalPrompt.value,
    useImprovedPrompt: useImprovedPrompt.value,
    selectedCheckpoint: selectedCheckpointEntries.value[0]?.name ?? '',
    selectedCheckpoints: selectedCheckpoints.value.map((selection) =>
      buildCheckpointSelection(
        selection.name,
        selection.enabled,
        selection.loras.map((lora) =>
          buildLoraSelection(
            lora.name,
            lora.strength,
            lora.enabled,
            lora.enabledTriggerWords,
            lora.triggerWordWeights,
          ),
        ),
      ),
    ),
    selectedOllamaModel: selectedOllamaModel.value,
    width: coerceFieldString(width.value),
    height: coerceFieldString(height.value),
    seed: coerceFieldString(seed.value),
    cfg: coerceFieldString(cfg.value),
    imageDenoise: coerceFieldString(imageDenoise.value),
    usePromptImprover: usePromptImprover.value,
    maintainAspectRatio: maintainAspectRatio.value,
    llmInstruction: llmInstruction.value,
    useInputImage: useInputImage.value,
    inputImageName: uploadedInputImageName.value ?? '',
    inputImageDisplayName: selectedImageDisplayName.value ?? '',
    inputImageWidth: selectedImageDimensions.value?.width ?? null,
    inputImageHeight: selectedImageDimensions.value?.height ?? null,
    controlNets: selectedControlNets.value.map((controlNet) => ({
      id: controlNet.id,
      enabled: controlNet.enabled,
      model: controlNet.model,
      preprocessor: controlNet.preprocessor,
      lineartPolarity: controlNet.lineartPolarity,
      previewResolution: controlNet.previewResolution,
      strength: controlNet.strength,
      startPercent: controlNet.startPercent,
      endPercent: controlNet.endPercent,
      inputImageName: controlNet.inputImageName,
      inputImageDisplayName: controlNet.inputImageDisplayName,
      inputImageWidth: controlNet.inputImageWidth,
      inputImageHeight: controlNet.inputImageHeight,
    })),
  }

  window.localStorage.setItem(FORM_STATE_STORAGE_KEY, JSON.stringify(payload))
}

function restoreFormState() {
  const persisted = readPersistedFormState()
  prompt.value = persisted.prompt ?? ''
  improvedPrompt.value = persisted.improvedPrompt ?? ''
  negativePrompt.value = persisted.negativePrompt ?? ''
  promptSections.value = normalizePersistedPromptSections(persisted.promptSections)
  if (!buildPromptFromSections(promptSections.value) && prompt.value.trim()) {
    promptSections.value.subject = [buildPromptTag(prompt.value.trim())].filter(
      (tag): tag is PromptTag => Boolean(tag),
    )
  }
  promptSectionDrafts.value = createEmptyPromptSectionsDrafts()
  negativePromptTags.value = normalizePromptTags(persisted.negativePromptTags)
  if (!negativePromptTags.value.length && negativePrompt.value.trim()) {
    negativePromptTags.value = splitPromptDraft(negativePrompt.value)
  }
  negativePromptDraft.value = ''
  useOriginalPrompt.value =
    typeof persisted.useOriginalPrompt === 'boolean' ? persisted.useOriginalPrompt : true
  useImprovedPrompt.value =
    typeof persisted.useImprovedPrompt === 'boolean' ? persisted.useImprovedPrompt : true
  selectedCheckpoints.value = Array.isArray(persisted.selectedCheckpoints)
    ? persisted.selectedCheckpoints.map((selection) =>
        buildCheckpointSelection(selection.name, selection.enabled, selection.loras),
      )
    : persisted.selectedCheckpoint
      ? [buildCheckpointSelection(persisted.selectedCheckpoint)]
      : []
  selectedOllamaModel.value = persisted.selectedOllamaModel ?? ''
  width.value = persisted.width ?? '1024'
  height.value = persisted.height ?? '1024'
  seed.value = persisted.seed ?? ''
  cfg.value = persisted.cfg ?? ''
  imageDenoise.value = persisted.imageDenoise ?? ''
  usePromptImprover.value = Boolean(persisted.usePromptImprover)
  if (!usePromptImprover.value) {
    useImprovedPrompt.value = false
  }
  maintainAspectRatio.value = Boolean(persisted.maintainAspectRatio)
  aspectRatioScale.value = '0'
  if (maintainAspectRatio.value) {
    captureLockedAspectRatioFromCurrentSize()
  }
  llmInstruction.value = persisted.llmInstruction ?? ''
  uploadedInputImageName.value = persisted.inputImageName ? persisted.inputImageName : null
  useInputImage.value =
    typeof persisted.useInputImage === 'boolean'
      ? persisted.useInputImage
      : Boolean(uploadedInputImageName.value)
  selectedImageDisplayName.value = persisted.inputImageDisplayName ? persisted.inputImageDisplayName : null
  selectedImageDimensions.value =
    persisted.inputImageWidth && persisted.inputImageHeight
      ? { width: persisted.inputImageWidth, height: persisted.inputImageHeight }
      : null
  if (uploadedInputImageName.value) {
    selectedImagePreviewUrl.value = buildStoredInputImagePreviewUrl(uploadedInputImageName.value)
  }
  selectedControlNets.value = Array.isArray(persisted.controlNets)
    ? persisted.controlNets.map((controlNet) => buildControlNetSelection(controlNet))
    : []
}

return {
  persistFormState,
  readPersistedFormState,
  restoreFormState,
}
}

export type HomePersistence = ReturnType<typeof createHomePersistence>
