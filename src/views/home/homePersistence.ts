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
    controlNetSelections?: ControlNetSelection[],
  ) => CheckpointSelection
  buildControlNetSelection: (entry?: Partial<PersistedControlNetSelection>) => ControlNetSelection
  buildLoraSelection: (
    name: string,
    strength: string | number,
    enabled?: boolean,
    enabledTriggerWords?: string[],
    triggerWordWeights?: Record<string, unknown>,
    mode?: Pick<LoraSelection, 'applyToAllCompatible' | 'appliedByAllCompatible'>,
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
  clipName,
  defaultLoraStrength,
  flattenInputImageBackground,
  height,
  imageDenoise,
  inputImageBackgroundColor,
  maintainAspectRatio,
  negativePrompt,
  negativePromptDraft,
  negativePromptTags,
  prompt,
  promptMode,
  promptSectionDrafts,
  promptSections,
  selectedCheckpoints,
  selectedImageDimensions,
  selectedImageDisplayName,
  selectedImagePreviewUrl,
  seed,
  samplerName,
  scheduler,
  steps,
  uploadedInputImageName,
  useInputImage,
  vaeName,
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
    lineartPolarity: coerceTrimmedFieldString(entry.lineartPolarity) === 'white-lines'
      ? 'white-lines'
      : 'black-lines',
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

function serializePersistedControlNetSelection(controlNet: ControlNetSelection): PersistedControlNetSelection {
  return {
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

function normalizePersistedHexColor(value: unknown) {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value.trim())
    ? value.trim().toLowerCase()
    : '#ffffff'
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
                      {
                        applyToAllCompatible: lora.applyToAllCompatible === true,
                        appliedByAllCompatible: lora.appliedByAllCompatible === true,
                      },
                    )
                  })
                  .filter((lora): lora is LoraSelection => Boolean(lora))
              : []
            const checkpointControlNets = Array.isArray(entry.controlNets)
              ? entry.controlNets
                  .map(normalizePersistedControlNetSelection)
                  .filter((controlNet): controlNet is PersistedControlNetSelection => Boolean(controlNet))
                  .map((controlNet) => buildControlNetSelection(controlNet))
              : []

            return buildCheckpointSelection(name, entry.enabled !== false, checkpointLoras, '', checkpointControlNets)
          })
          .filter((entry): entry is CheckpointSelection => Boolean(entry))
      : []
    return {
      promptMode: parsed.promptMode === 'text' ? 'text' : 'tags',
      prompt: typeof parsed.prompt === 'string' ? parsed.prompt : '',
      negativePrompt: typeof parsed.negativePrompt === 'string' ? parsed.negativePrompt : '',
      promptSections: normalizePersistedPromptSections(parsed.promptSections),
      negativePromptTags: normalizePromptTags(parsed.negativePromptTags),
      selectedCheckpoint: typeof parsed.selectedCheckpoint === 'string' ? parsed.selectedCheckpoint : '',
      selectedCheckpoints: selectedCheckpointsFromState,
      width: typeof parsed.width === 'string' ? parsed.width : '1024',
      height: typeof parsed.height === 'string' ? parsed.height : '1024',
      seed: typeof parsed.seed === 'string' ? parsed.seed : '',
      steps: typeof parsed.steps === 'string' ? parsed.steps : '',
      cfg: typeof parsed.cfg === 'string' ? parsed.cfg : '',
      samplerName: typeof parsed.samplerName === 'string' ? parsed.samplerName : '',
      scheduler: typeof parsed.scheduler === 'string' ? parsed.scheduler : '',
      clipName: typeof parsed.clipName === 'string' ? parsed.clipName : '',
      vaeName: typeof parsed.vaeName === 'string' ? parsed.vaeName : '',
      imageDenoise: typeof parsed.imageDenoise === 'string' ? parsed.imageDenoise : '',
      maintainAspectRatio:
        typeof parsed.maintainAspectRatio === 'boolean' ? parsed.maintainAspectRatio : false,
      flattenInputImageBackground: typeof parsed.flattenInputImageBackground === 'boolean'
        ? parsed.flattenInputImageBackground
        : false,
      inputImageBackgroundColor: normalizePersistedHexColor(parsed.inputImageBackgroundColor),
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
    promptMode: promptMode.value,
    prompt: compiledPrompt.value,
    negativePrompt: compiledNegativePrompt.value,
    promptSections: buildPromptSectionsForPersistence(),
    negativePromptTags: normalizePromptTags([
      ...negativePromptTags.value,
      ...splitPromptDraft(negativePromptDraft.value),
    ]),
    selectedCheckpoint: selectedCheckpointEntries.value[0]?.name ?? '',
    selectedCheckpoints: selectedCheckpoints.value.map((selection) => ({
      name: selection.name,
      enabled: selection.enabled,
      loraPicker: '',
      loras: selection.loras.map((lora) =>
        buildLoraSelection(
          lora.name,
          lora.strength,
          lora.enabled,
          lora.enabledTriggerWords,
          lora.triggerWordWeights,
          {
            applyToAllCompatible: lora.applyToAllCompatible === true,
            appliedByAllCompatible: lora.appliedByAllCompatible === true,
          },
        ),
      ),
      controlNets: (selection.controlNets ?? []).map(serializePersistedControlNetSelection),
    })),
    width: coerceFieldString(width.value),
    height: coerceFieldString(height.value),
    seed: coerceFieldString(seed.value),
    steps: coerceFieldString(steps.value),
    cfg: coerceFieldString(cfg.value),
    samplerName: coerceFieldString(samplerName.value),
    scheduler: coerceFieldString(scheduler.value),
    clipName: coerceFieldString(clipName.value),
    vaeName: coerceFieldString(vaeName.value),
    imageDenoise: coerceFieldString(imageDenoise.value),
    maintainAspectRatio: maintainAspectRatio.value,
    flattenInputImageBackground: flattenInputImageBackground.value,
    inputImageBackgroundColor: normalizePersistedHexColor(inputImageBackgroundColor.value),
    useInputImage: useInputImage.value,
    inputImageName: uploadedInputImageName.value ?? '',
    inputImageDisplayName: selectedImageDisplayName.value ?? '',
    inputImageWidth: selectedImageDimensions.value?.width ?? null,
    inputImageHeight: selectedImageDimensions.value?.height ?? null,
  }

  window.localStorage.setItem(FORM_STATE_STORAGE_KEY, JSON.stringify(payload))
}

function restoreFormState() {
  const persisted = readPersistedFormState()
  prompt.value = persisted.prompt ?? ''
  negativePrompt.value = persisted.negativePrompt ?? ''
  promptMode.value = persisted.promptMode === 'text' ? 'text' : 'tags'
  promptSections.value = normalizePersistedPromptSections(persisted.promptSections)
  if (promptMode.value === 'tags' && !buildPromptFromSections(promptSections.value) && prompt.value.trim()) {
    promptSections.value.subject = [buildPromptTag(prompt.value.trim())].filter(
      (tag): tag is PromptTag => Boolean(tag),
    )
  }
  promptSectionDrafts.value = createEmptyPromptSectionsDrafts()
  negativePromptTags.value = normalizePromptTags(persisted.negativePromptTags)
  if (promptMode.value === 'tags' && !negativePromptTags.value.length && negativePrompt.value.trim()) {
    negativePromptTags.value = splitPromptDraft(negativePrompt.value)
  }
  negativePromptDraft.value = ''
  selectedCheckpoints.value = Array.isArray(persisted.selectedCheckpoints)
    ? persisted.selectedCheckpoints.map((selection) =>
        buildCheckpointSelection(
          selection.name,
          selection.enabled,
          selection.loras,
          '',
          (selection.controlNets ?? []).map((controlNet) => buildControlNetSelection(controlNet)),
        ),
      )
    : persisted.selectedCheckpoint
      ? [buildCheckpointSelection(persisted.selectedCheckpoint)]
      : []
  width.value = persisted.width ?? '1024'
  height.value = persisted.height ?? '1024'
  seed.value = persisted.seed ?? ''
  steps.value = persisted.steps ?? ''
  cfg.value = persisted.cfg ?? ''
  samplerName.value = persisted.samplerName ?? ''
  scheduler.value = persisted.scheduler ?? ''
  clipName.value = persisted.clipName ?? ''
  vaeName.value = persisted.vaeName ?? ''
  imageDenoise.value = persisted.imageDenoise ?? ''
  maintainAspectRatio.value = Boolean(persisted.maintainAspectRatio)
  aspectRatioScale.value = '0'
  if (maintainAspectRatio.value) {
    captureLockedAspectRatioFromCurrentSize()
  }
  flattenInputImageBackground.value = Boolean(persisted.flattenInputImageBackground)
  inputImageBackgroundColor.value = normalizePersistedHexColor(persisted.inputImageBackgroundColor)
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
}

return {
  persistFormState,
  readPersistedFormState,
  restoreFormState,
}
}

export type HomePersistence = ReturnType<typeof createHomePersistence>
