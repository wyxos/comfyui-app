import type { HomeSelectionComputed } from './homeSelectionComputed'
import type { HomeState } from './homeState'
import type {
  CheckpointSelection,
  ControlNetLineartPolarity,
  ControlNetSelection,
  LoraSelection,
  PersistedControlNetSelection,
} from './homeTypes'
import {
  coerceFieldString,
  coerceTrimmedFieldString,
  createClientId,
  formatControlNetNumber,
  formatPromptWeight,
  getTriggerWordKey,
  normalizeTriggerWordWeights,
  normalizeTriggerWords,
  stepPromptWeight,
} from './homeValueHelpers'

type HomeLoraActionDeps = {
  buildStoredInputImagePreviewUrl: (inputImageName: string) => string
  normalizeControlNetResolutionFromOutputSize: () => number
  resolveAvailableControlNetModel: (model: unknown) => string
}

export function createHomeLoraActions(
  state: HomeState,
  selection: HomeSelectionComputed,
  deps: HomeLoraActionDeps,
) {
const { defaultLoraStrength } = state
const { loraDetailsByName } = selection
const {
  buildStoredInputImagePreviewUrl,
  normalizeControlNetResolutionFromOutputSize,
  resolveAvailableControlNetModel,
} = deps

function getDefaultLoraStrength() {
  const parsed = Number.parseFloat(coerceTrimmedFieldString(defaultLoraStrength.value))
  return Number.isFinite(parsed) ? parsed : 1
}

function normalizeLoraStrength(value: string | number, fallback = getDefaultLoraStrength()) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  const parsed = Number.parseFloat(coerceTrimmedFieldString(value))
  return Number.isFinite(parsed) ? parsed : fallback
}

function formatLoraStrength(value: string | number, fallback = getDefaultLoraStrength()) {
  return formatPromptWeight(normalizeLoraStrength(value, fallback))
}

function buildCheckpointSelection(
  name: string,
  enabled = true,
  loraSelections: LoraSelection[] = [],
  loraPicker = '',
  controlNetSelections: ControlNetSelection[] = [],
): CheckpointSelection {
  return {
    name,
    enabled,
    loras: loraSelections,
    loraPicker,
    controlNets: controlNetSelections,
  }
}

function normalizeControlNetLineartPolarity(value: unknown): ControlNetLineartPolarity {
  return coerceTrimmedFieldString(value) === 'white-lines' ? 'white-lines' : 'black-lines'
}

function buildControlNetSelection(
  entry: Partial<PersistedControlNetSelection> = {},
): ControlNetSelection {
  const inputImageName = coerceTrimmedFieldString(entry.inputImageName)
  const defaultPreviewResolution = normalizeControlNetResolutionFromOutputSize()

  return {
    id: coerceTrimmedFieldString(entry.id) || createClientId('controlnet'),
    enabled: entry.enabled !== false,
    model: resolveAvailableControlNetModel(entry.model),
    preprocessor: coerceTrimmedFieldString(entry.preprocessor) || 'lineart',
    lineartPolarity: normalizeControlNetLineartPolarity(entry.lineartPolarity),
    previewResolution: formatControlNetNumber(
      coerceFieldString(entry.previewResolution),
      defaultPreviewResolution,
      64,
      16384,
    ),
    strength: formatControlNetNumber(coerceFieldString(entry.strength), 1, 0, 10),
    startPercent: formatControlNetNumber(coerceFieldString(entry.startPercent), 0, 0, 1),
    endPercent: formatControlNetNumber(coerceFieldString(entry.endPercent), 1, 0, 1),
    inputImageName,
    inputImageDisplayName: coerceTrimmedFieldString(entry.inputImageDisplayName) || inputImageName,
    inputImagePreviewUrl: inputImageName ? buildStoredInputImagePreviewUrl(inputImageName) : '',
    inputImageWidth: entry.inputImageWidth ?? null,
    inputImageHeight: entry.inputImageHeight ?? null,
    isDragging: false,
    isUploading: false,
    uploadError: '',
    previewImageUrl: '',
    previewImageName: '',
    previewImageSubfolder: '',
    previewImageType: 'output',
    isGeneratingPreview: false,
    previewError: '',
    isCopyingPreview: false,
    previewCopyNotice: '',
    previewCopyError: '',
  }
}

function buildLoraSelection(
  name: string,
  strength: string | number,
  enabled = true,
  enabledTriggerWords?: string[],
  triggerWordWeights?: Record<string, unknown>,
): LoraSelection {
  const normalizedTriggerWordWeights = normalizeTriggerWordWeights(triggerWordWeights)
  return {
    name,
    enabled,
    strength: formatLoraStrength(strength),
    ...(Array.isArray(enabledTriggerWords)
      ? { enabledTriggerWords: normalizeTriggerWords(enabledTriggerWords) }
      : {}),
    ...(normalizedTriggerWordWeights ? { triggerWordWeights: normalizedTriggerWordWeights } : {}),
  }
}

function getLoraTriggerWords(loraName: string) {
  const loraOption = loraDetailsByName.value.get(loraName)
  return normalizeTriggerWords(loraOption?.triggerWords)
}

function getEnabledTriggerWordsForSelection(selection: LoraSelection) {
  const availableWords = getLoraTriggerWords(selection.name)
  if (!availableWords.length) {
    return []
  }

  if (!Array.isArray(selection.enabledTriggerWords)) {
    return availableWords
  }

  const availableByKey = new Map(availableWords.map((word) => [word.toLowerCase(), word]))
  return normalizeTriggerWords(selection.enabledTriggerWords)
    .map((word) => availableByKey.get(word.toLowerCase()))
    .filter((word): word is string => Boolean(word))
}

function isLoraTriggerWordEnabled(selection: LoraSelection, triggerWord: string) {
  return getEnabledTriggerWordsForSelection(selection).some(
    (word) => getTriggerWordKey(word) === getTriggerWordKey(triggerWord),
  )
}

function toggleLoraTriggerWord(selection: LoraSelection, triggerWord: string) {
  const normalizedTriggerWord = triggerWord.trim()
  if (!normalizedTriggerWord) {
    return
  }

  const currentWords = getEnabledTriggerWordsForSelection(selection)
  const normalizedKey = getTriggerWordKey(normalizedTriggerWord)
  const isEnabled = currentWords.some((word) => getTriggerWordKey(word) === normalizedKey)
  selection.enabledTriggerWords = isEnabled
    ? currentWords.filter((word) => getTriggerWordKey(word) !== normalizedKey)
    : normalizeTriggerWords([...currentWords, normalizedTriggerWord])
}

function enableAllLoraTriggerWords(selection: LoraSelection) {
  selection.enabledTriggerWords = getLoraTriggerWords(selection.name)
}

function disableAllLoraTriggerWords(selection: LoraSelection) {
  selection.enabledTriggerWords = []
}

function getLoraTriggerWordWeight(selection: LoraSelection, triggerWord: string) {
  const key = getTriggerWordKey(triggerWord)
  const parsed = Number.parseFloat(coerceTrimmedFieldString(selection.triggerWordWeights?.[key]))
  return Number.isFinite(parsed) ? Math.max(0.1, parsed) : 1
}

function getLoraTriggerWordWeightLabel(selection: LoraSelection, triggerWord: string) {
  return formatPromptWeight(getLoraTriggerWordWeight(selection, triggerWord))
}

function stepLoraTriggerWordWeight(
  selection: LoraSelection,
  triggerWord: string,
  direction: 1 | -1,
) {
  const key = getTriggerWordKey(triggerWord)
  if (!key) {
    return
  }

  selection.triggerWordWeights = {
    ...(selection.triggerWordWeights ?? {}),
    [key]: formatPromptWeight(
      stepPromptWeight(getLoraTriggerWordWeight(selection, triggerWord), direction),
    ),
  }
}

function getLoraTriggerWordsLabel(loraName: string) {
  const triggerWords = getLoraTriggerWords(loraName)

  if (triggerWords.length) {
    return `Trigger words: ${triggerWords.join(', ')}`
  }

  return 'Trigger words unavailable in local metadata.'
}

function getCheckpointActiveLoraTriggerWords(checkpoint: CheckpointSelection) {
  const seen = new Set<string>()
  const triggerWords: Array<{ word: string; weight: number }> = []

  for (const selection of checkpoint.loras) {
    if (!selection.enabled) {
      continue
    }

    for (const triggerWord of getEnabledTriggerWordsForSelection(selection)) {
      const key = getTriggerWordKey(triggerWord)
      if (seen.has(key)) {
        continue
      }

      seen.add(key)
      triggerWords.push({
        word: triggerWord,
        weight: getLoraTriggerWordWeight(selection, triggerWord),
      })
    }
  }

  return triggerWords
}

return {
  getDefaultLoraStrength,
  normalizeLoraStrength,
  formatLoraStrength,
  buildCheckpointSelection,
  buildControlNetSelection,
  buildLoraSelection,
  getLoraTriggerWords,
  getEnabledTriggerWordsForSelection,
  isLoraTriggerWordEnabled,
  toggleLoraTriggerWord,
  enableAllLoraTriggerWords,
  disableAllLoraTriggerWords,
  getLoraTriggerWordWeight,
  getLoraTriggerWordWeightLabel,
  stepLoraTriggerWordWeight,
  getLoraTriggerWordsLabel,
  getCheckpointActiveLoraTriggerWords,
}
}
