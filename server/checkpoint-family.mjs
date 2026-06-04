import { safeTrim } from './shared.mjs'

export function normalizeCheckpointFamilyToken(value) {
  const normalized = safeTrim(value).toLowerCase().replace(/[^a-z0-9]+/g, '')
  if (normalized === 'anima') {
    return 'anima'
  }

  if (normalized === 'sdxl' || normalized === 'pony' || normalized === 'illustrious') {
    return 'sdxl'
  }

  return null
}

function detectCheckpointFamilyFromMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object') {
    return null
  }

  const candidates = [
    metadata.baseModelKey,
    metadata.baseModel,
    ...(Array.isArray(metadata.compatibleBaseModelKeys) ? metadata.compatibleBaseModelKeys : []),
    ...(Array.isArray(metadata.compatibleBaseModels) ? metadata.compatibleBaseModels : []),
  ]

  for (const candidate of candidates) {
    const family = normalizeCheckpointFamilyToken(candidate)
    if (family) {
      return family
    }
  }

  return null
}

export function detectCheckpointFamily(checkpointName, metadata = null) {
  return (
    detectCheckpointFamilyFromMetadata(metadata) ??
    (safeTrim(checkpointName).toLowerCase().includes('anima') ? 'anima' : 'sdxl')
  )
}
