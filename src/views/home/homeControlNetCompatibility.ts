import type { Ref } from 'vue'
import type {
  CheckpointEntry,
  ControlNetOption,
  ModelCompatibilityMetadata,
  ModelCompatibilityStatus,
} from './homeTypes'

function normalizeBaseModelKey(value: unknown) {
  return typeof value === 'string'
    ? value
        .trim()
        .toLowerCase()
        .replace(/\b(stable diffusion|sd)\b/g, 'sd')
        .replace(/[^a-z0-9]+/g, '')
    : ''
}

const sdxlArchitectureBaseModelKeys = new Set(['sdxl', 'pony', 'illustrious'])

function expandBaseModelCompatibilityKeys(...values: unknown[]) {
  const keys = new Set<string>()
  for (const value of values.flat()) {
    const key = normalizeBaseModelKey(value)
    if (!key) {
      continue
    }
    keys.add(key)
    if (sdxlArchitectureBaseModelKeys.has(key)) {
      keys.add('sdxl')
    }
  }
  return keys
}

function getCompatibilityMetadataBaseKey(metadata: ModelCompatibilityMetadata | null | undefined) {
  return metadata?.baseModelKey || normalizeBaseModelKey(metadata?.baseModel)
}

function controlNetHasExplicitCheckpointMatch(
  checkpoint: CheckpointEntry,
  controlNetMetadata: ModelCompatibilityMetadata | null | undefined,
) {
  const checkpointNameKeys = new Set(
    [checkpoint.name, checkpoint.displayName, checkpoint.compatibility?.modelName, checkpoint.compatibility?.versionName]
      .filter(Boolean)
      .map((value) => (typeof value === 'string' ? value.trim().toLowerCase() : '')),
  )
  const checkpointNames = Array.isArray(controlNetMetadata?.checkpointNames)
    ? controlNetMetadata.checkpointNames
    : []
  if (checkpointNames.some((name) => checkpointNameKeys.has(name.toLowerCase()))) {
    return true
  }

  const checkpointHashes = new Set(
    Object.values(checkpoint.compatibility?.hashes ?? {}).map((hash) => hash.toLowerCase()),
  )
  return Object.values(controlNetMetadata?.checkpointHashes ?? {}).some((hash) =>
    checkpointHashes.has(hash.toLowerCase()),
  )
}

function getControlNetCompatibilityStatus(
  checkpoint: CheckpointEntry,
  controlNet: ControlNetOption,
): ModelCompatibilityStatus {
  if (controlNetHasExplicitCheckpointMatch(checkpoint, controlNet.compatibility)) {
    return 'compatible'
  }

  const checkpointKeys = expandBaseModelCompatibilityKeys(
    getCompatibilityMetadataBaseKey(checkpoint.compatibility),
    checkpoint.compatibility?.baseModel,
    checkpoint.family,
  )
  const controlNetKeys = expandBaseModelCompatibilityKeys(
    getCompatibilityMetadataBaseKey(controlNet.compatibility),
    controlNet.compatibility?.baseModel,
    controlNet.compatibility?.compatibleBaseModelKeys ?? [],
    controlNet.compatibility?.compatibleBaseModels ?? [],
  )

  if ([...checkpointKeys].some((key) => controlNetKeys.has(key))) {
    return 'compatible'
  }

  if (checkpointKeys.size && controlNetKeys.size) {
    return 'incompatible'
  }

  return 'unverified'
}

export function createHomeControlNetCompatibility(controlNets: Ref<ControlNetOption[]>) {
  function getControlNetCompatibilityLabel(checkpoint: CheckpointEntry, controlNetName: string) {
    const controlNet = controlNets.value.find((entry) => entry.name === controlNetName)
    if (!controlNet) {
      return 'Unverified'
    }

    const status = getControlNetCompatibilityStatus(checkpoint, controlNet)
    if (status === 'compatible') {
      const bases = controlNet.compatibility?.compatibleBaseModels ?? []
      return bases.length ? `Compatible with ${bases.join(', ')}` : 'Compatible'
    }
    if (status === 'incompatible') {
      const base = controlNet.compatibility?.baseModel || controlNet.compatibility?.compatibleBaseModels?.[0]
      return base ? `Incompatible with ${checkpoint.displayName} (${base})` : 'Incompatible'
    }

    return controlNet.compatibility?.status === 'loading' ? 'Metadata loading' : 'Unverified'
  }

  function getCheckpointControlNetOptions(checkpoint: CheckpointEntry) {
    const selectedNames = new Set((checkpoint.controlNets ?? []).map((selection) => selection.model))
    return controlNets.value
      .map((controlNet) => ({
        controlNet,
        status: getControlNetCompatibilityStatus(checkpoint, controlNet),
      }))
      .filter((entry) => entry.status !== 'incompatible' && !selectedNames.has(entry.controlNet.name))
      .sort((first, second) => {
        if (first.status !== second.status) {
          return first.status === 'compatible' ? -1 : 1
        }

        return (first.controlNet.displayName ?? first.controlNet.name)
          .localeCompare(second.controlNet.displayName ?? second.controlNet.name)
      })
      .map(({ controlNet, status }) => ({
        label: `${controlNet.displayName ?? controlNet.name}${status === 'unverified' ? ' · Unverified' : ''}`,
        value: controlNet.name,
        typeLabel: controlNet.controlType || 'ControlNet',
      }))
  }

  function getCheckpointControlNetModelOptions(checkpoint: CheckpointEntry, currentModel = '') {
    if (!checkpoint) {
      return []
    }

    const selectedNames = new Set(
      (checkpoint.controlNets ?? [])
        .map((selection) => selection.model)
        .filter((model) => model && model !== currentModel),
    )

    return controlNets.value
      .map((controlNet) => ({
        controlNet,
        status: getControlNetCompatibilityStatus(checkpoint, controlNet),
      }))
      .filter((entry) =>
        !selectedNames.has(entry.controlNet.name) &&
          (entry.status !== 'incompatible' || entry.controlNet.name === currentModel),
      )
      .sort((first, second) => {
        if (first.controlNet.name === currentModel) {
          return -1
        }
        if (second.controlNet.name === currentModel) {
          return 1
        }
        if (first.status !== second.status) {
          return first.status === 'compatible' ? -1 : 1
        }

        return (first.controlNet.displayName ?? first.controlNet.name)
          .localeCompare(second.controlNet.displayName ?? second.controlNet.name)
      })
      .map(({ controlNet, status }) => ({
        label: `${controlNet.displayName ?? controlNet.name}${status === 'unverified' ? ' · Unverified' : status === 'incompatible' ? ' · Incompatible' : ''}`,
        value: controlNet.name,
        typeLabel: controlNet.controlType || 'ControlNet',
      }))
  }

  function getCheckpointControlNetPickerPlaceholder(checkpoint: CheckpointEntry) {
    return getCheckpointControlNetOptions(checkpoint).length ? 'Add ControlNet' : 'No compatible ControlNets'
  }

  return {
    getControlNetCompatibilityStatus,
    getControlNetCompatibilityLabel,
    getCheckpointControlNetOptions,
    getCheckpointControlNetModelOptions,
    getCheckpointControlNetPickerPlaceholder,
  }
}
