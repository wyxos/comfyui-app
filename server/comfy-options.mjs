import { preferredCheckpoint } from './config.mjs'
import { safeTrim } from './shared.mjs'
import { normalizeNumericField } from './model-paths.mjs'
import { detectCheckpointFamily } from './workflow.mjs'

export function extractCheckpointList(payload) {
  const rawList = payload?.CheckpointLoaderSimple?.input?.required?.ckpt_name?.[0]
  if (!Array.isArray(rawList)) {
    return []
  }

  return rawList.map((name) => ({
    name,
    family: detectCheckpointFamily(name),
  }))
}

export function extractLoraList(payload) {
  const rawList = payload?.LoraLoader?.input?.required?.lora_name?.[0]
  if (!Array.isArray(rawList)) {
    return []
  }

  return rawList
    .map((name) => safeTrim(name))
    .filter(Boolean)
    .map((name) => ({ name }))
}

export function extractControlNetList(payload) {
  const rawList = payload?.ControlNetLoader?.input?.required?.control_net_name?.[0]
  if (!Array.isArray(rawList)) {
    return []
  }

  return rawList
    .map((name) => safeTrim(name))
    .filter(Boolean)
    .map((name) => ({ name, displayName: name }))
}

export function extractDefaultLoraStrength(payload) {
  return normalizeNumericField(payload?.LoraLoader?.input?.required?.strength_model?.[1]?.default, 1)
}

export function getPreferredCheckpoint(checkpoints) {
  const checkpointNames = checkpoints.map((checkpoint) => checkpoint.name)

  if (checkpointNames.includes(preferredCheckpoint)) {
    return preferredCheckpoint
  }

  return checkpointNames[0] ?? null
}
