import type { HomeSelectionComputed } from './homeSelectionComputed'
import type { HomeState } from './homeState'
import type {
  CheckpointEntry,
  CheckpointSelection,
  LoraCompatibilityStatus,
  LoraOption,
  LoraSelection,
  ModelCompatibilityMetadata,
} from './homeTypes'
import {
  coerceTrimmedFieldString,
} from './homeValueHelpers'

type HomeModelActionDeps = {
  buildCheckpointSelection: (name: string, enabled?: boolean, loras?: LoraSelection[]) => CheckpointSelection
  buildLoraSelection: (name: string, strength: string | number, enabled?: boolean, enabledTriggerWords?: string[], triggerWordWeights?: Record<string, unknown>) => LoraSelection
  formatLoraStrength: (value: string | number, fallback?: number) => string
}

export function createHomeModelActions(
  state: HomeState,
  selection: HomeSelectionComputed,
  deps: HomeModelActionDeps,
) {
const { defaultLoraStrength, loadingLoras, loras, selectedCheckpointPicker, selectedCheckpoints } = state
const { loraDetailsByName } = selection
const { buildCheckpointSelection, buildLoraSelection, formatLoraStrength } = deps

function getLoraPreviewUrl(loraName: string) {
  return loraDetailsByName.value.get(loraName)?.previewUrl ?? null
}

function getLoraPreviewMediaType(loraName: string) {
  return loraDetailsByName.value.get(loraName)?.previewMediaType ?? null
}

function getLoraDisplayName(loraName: string) {
  const loraOption = loraDetailsByName.value.get(loraName)
  return loraOption?.displayName ?? loraName
}

function getCompatibilityMetadataBaseKey(metadata: ModelCompatibilityMetadata | null | undefined) {
  return metadata?.baseModelKey || normalizeBaseModelKey(metadata?.baseModel)
}

function normalizeBaseModelKey(value: unknown) {
  return coerceTrimmedFieldString(value)
    .toLowerCase()
    .replace(/\b(stable diffusion|sd)\b/g, 'sd')
    .replace(/[^a-z0-9]+/g, '')
}

function loraHasExplicitCheckpointMatch(
  checkpoint: CheckpointEntry,
  loraMetadata: ModelCompatibilityMetadata | null | undefined,
) {
  const checkpointNameKeys = new Set(
    [checkpoint.name, checkpoint.displayName, checkpoint.compatibility?.modelName, checkpoint.compatibility?.versionName]
      .filter(Boolean)
      .map((value) => coerceTrimmedFieldString(value).toLowerCase()),
  )
  const checkpointNames = Array.isArray(loraMetadata?.checkpointNames)
    ? loraMetadata.checkpointNames
    : []
  if (checkpointNames.some((name) => checkpointNameKeys.has(name.toLowerCase()))) {
    return true
  }

  const checkpointHashes = new Set(
    Object.values(checkpoint.compatibility?.hashes ?? {}).map((hash) => hash.toLowerCase()),
  )
  return Object.values(loraMetadata?.checkpointHashes ?? {}).some((hash) =>
    checkpointHashes.has(hash.toLowerCase()),
  )
}

function getLoraCompatibilityStatus(
  checkpoint: CheckpointEntry,
  lora: LoraOption,
): LoraCompatibilityStatus {
  if (loraHasExplicitCheckpointMatch(checkpoint, lora.compatibility)) {
    return 'compatible'
  }

  const checkpointBaseModel = getCompatibilityMetadataBaseKey(checkpoint.compatibility)
  const loraBaseModel = getCompatibilityMetadataBaseKey(lora.compatibility)
  if (checkpointBaseModel && loraBaseModel) {
    return checkpointBaseModel === loraBaseModel ? 'compatible' : 'incompatible'
  }

  return 'unverified'
}

function getLoraCompatibilityLabel(checkpoint: CheckpointEntry, loraName: string) {
  const lora = loraDetailsByName.value.get(loraName)
  if (!lora) {
    return 'Unverified'
  }

  const status = getLoraCompatibilityStatus(checkpoint, lora)
  if (status === 'compatible') {
    return lora.compatibility?.baseModel ? `Compatible with ${lora.compatibility.baseModel}` : 'Compatible'
  }

  return lora.compatibility?.status === 'loading' ? 'Metadata loading' : 'Unverified'
}

function getLoraCompatibilityMetadata(loraName: string) {
  return loraDetailsByName.value.get(loraName)?.compatibility ?? null
}

function getCheckpointLoraOptions(checkpoint: CheckpointEntry) {
  const selectedNames = new Set(checkpoint.loras.map((selection) => selection.name))
  return loras.value
    .map((lora) => ({
      lora,
      status: getLoraCompatibilityStatus(checkpoint, lora),
    }))
    .filter((entry) => entry.status !== 'incompatible' && !selectedNames.has(entry.lora.name))
    .sort((first, second) => {
      if (first.status !== second.status) {
        return first.status === 'compatible' ? -1 : 1
      }

      return (first.lora.displayName ?? first.lora.name).localeCompare(second.lora.displayName ?? second.lora.name)
    })
    .map(({ lora, status }) => ({
      label: `${lora.displayName ?? lora.name}${status === 'unverified' ? ' · Unverified' : ''}`,
      value: lora.name,
      previewUrl: lora.previewUrl ?? null,
      previewMediaType: lora.previewMediaType ?? null,
      modelNsfw: lora.modelNsfw ?? lora.compatibility?.modelNsfw ?? null,
      modelMetadata: {
        nsfw: lora.modelNsfw ?? lora.compatibility?.modelNsfw ?? null,
      },
      typeLabel: 'LoRA',
    }))
}

function getCheckpointLoraPickerPlaceholder(checkpoint: CheckpointEntry) {
  if (loadingLoras.value) {
    return 'Loading LoRAs...'
  }

  return getCheckpointLoraOptions(checkpoint).length ? 'Add LoRA' : 'No compatible LoRAs'
}

function getCheckpointSelectedLoraSummary(checkpoint: CheckpointEntry) {
  const total = checkpoint.loras.length
  const enabled = checkpoint.loras.filter((lora) => lora.enabled).length
  if (!total) {
    return 'No LoRAs selected for this checkpoint.'
  }

  return `${enabled} enabled of ${total} selected`
}

function addSelectedCheckpoint(name: string) {
  const normalizedName = name.trim()
  if (!normalizedName) {
    selectedCheckpointPicker.value = ''
    return
  }

  const existingSelection = selectedCheckpoints.value.find(
    (selection) => selection.name === normalizedName,
  )
  if (existingSelection) {
    existingSelection.enabled = true
    selectedCheckpointPicker.value = ''
    return
  }

  selectedCheckpoints.value = [
    ...selectedCheckpoints.value,
    buildCheckpointSelection(normalizedName),
  ]
  selectedCheckpointPicker.value = ''
}

function removeSelectedCheckpoint(name: string) {
  selectedCheckpoints.value = selectedCheckpoints.value.filter((selection) => selection.name !== name)
}

function clearSelectedCheckpoints() {
  selectedCheckpoints.value = []
  selectedCheckpointPicker.value = ''
}

function toggleSelectedCheckpoint(name: string) {
  const selection = selectedCheckpoints.value.find((entry) => entry.name === name)
  if (!selection) {
    return
  }

  selection.enabled = !selection.enabled
}

function setAllSelectedCheckpointsEnabled(enabled: boolean) {
  selectedCheckpoints.value = selectedCheckpoints.value.map((selection) => ({
    ...selection,
    enabled,
  }))
}

function addCheckpointLora(checkpointName: string, name: string) {
  const normalizedName = name.trim()
  const checkpoint = selectedCheckpoints.value.find((selection) => selection.name === checkpointName)
  if (!checkpoint) {
    return
  }

  if (!normalizedName) {
    checkpoint.loraPicker = ''
    return
  }

  const existingSelection = checkpoint.loras.find((selection) => selection.name === normalizedName)
  if (existingSelection) {
    existingSelection.enabled = true
    if (!coerceTrimmedFieldString(existingSelection.strength)) {
      existingSelection.strength = formatLoraStrength(defaultLoraStrength.value)
    }
    checkpoint.loraPicker = ''
    return
  }

  checkpoint.loras = [
    ...checkpoint.loras,
    buildLoraSelection(normalizedName, defaultLoraStrength.value),
  ]
  checkpoint.loraPicker = ''
}

function removeCheckpointLora(checkpointName: string, name: string) {
  const checkpoint = selectedCheckpoints.value.find((selection) => selection.name === checkpointName)
  if (!checkpoint) {
    return
  }

  checkpoint.loras = checkpoint.loras.filter((selection) => selection.name !== name)
}

function clearCheckpointLoras(checkpointName: string) {
  const checkpoint = selectedCheckpoints.value.find((selection) => selection.name === checkpointName)
  if (!checkpoint) {
    return
  }

  checkpoint.loras = []
  checkpoint.loraPicker = ''
}

function toggleCheckpointLora(checkpointName: string, name: string) {
  const checkpoint = selectedCheckpoints.value.find((selection) => selection.name === checkpointName)
  const selection = checkpoint?.loras.find((entry) => entry.name === name)
  if (!selection) {
    return
  }

  selection.enabled = !selection.enabled
}

function setCheckpointLoraStrength(checkpointName: string, name: string, strength: string) {
  const checkpoint = selectedCheckpoints.value.find((selection) => selection.name === checkpointName)
  const selection = checkpoint?.loras.find((entry) => entry.name === name)
  if (!selection) {
    return
  }

  selection.strength = strength
}

function setAllCheckpointLorasEnabled(checkpointName: string, enabled: boolean) {
  const checkpoint = selectedCheckpoints.value.find((selection) => selection.name === checkpointName)
  if (!checkpoint) {
    return
  }

  checkpoint.loras = checkpoint.loras.map((selection) => ({
    ...selection,
    enabled,
  }))
}

return {
  getLoraPreviewUrl,
  getLoraPreviewMediaType,
  getLoraDisplayName,
  getCompatibilityMetadataBaseKey,
  normalizeBaseModelKey,
  loraHasExplicitCheckpointMatch,
  getLoraCompatibilityStatus,
  getLoraCompatibilityLabel,
  getLoraCompatibilityMetadata,
  getCheckpointLoraOptions,
  getCheckpointLoraPickerPlaceholder,
  getCheckpointSelectedLoraSummary,
  addSelectedCheckpoint,
  removeSelectedCheckpoint,
  clearSelectedCheckpoints,
  toggleSelectedCheckpoint,
  setAllSelectedCheckpointsEnabled,
  addCheckpointLora,
  removeCheckpointLora,
  clearCheckpointLoras,
  toggleCheckpointLora,
  setCheckpointLoraStrength,
  setAllCheckpointLorasEnabled,
}
}
