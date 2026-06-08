import { normalizeOptionalBoolean, safeTrim } from './shared.mjs'

export function normalizeStringList(value) {
  const values = Array.isArray(value)
    ? value.flatMap((entry) => (Array.isArray(entry) ? entry : [entry]))
    : typeof value === 'string'
      ? value.split(/[\r\n,|]+/g)
      : []
  const seen = new Set()
  const normalized = []

  for (const entry of values) {
    const text = safeTrim(entry)
    const key = text.toLowerCase()
    if (!text || seen.has(key)) {
      continue
    }

    seen.add(key)
    normalized.push(text)
  }

  return normalized
}

export function normalizeHashes(...values) {
  const hashes = {}

  for (const value of values) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      continue
    }

    for (const [algorithm, hash] of Object.entries(value)) {
      const normalizedAlgorithm = safeTrim(algorithm).toUpperCase()
      const normalizedHash = safeTrim(hash)
      if (normalizedAlgorithm && normalizedHash) {
        hashes[normalizedAlgorithm] = normalizedHash
      }
    }
  }

  return hashes
}

export function normalizeImageSafetyOverrides(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }

  const overrides = {}
  for (const [key, entry] of Object.entries(value)) {
    const normalizedKey = safeTrim(key)
    if (!normalizedKey || !entry || typeof entry !== 'object' || Array.isArray(entry)) {
      continue
    }

    overrides[normalizedKey] = {
      imageNsfw: normalizeOptionalBoolean(entry.imageNsfw ?? entry.nsfw),
      imageNsfwOverride: normalizeOptionalBoolean(entry.imageNsfwOverride ?? entry.nsfwOverride),
    }
  }

  return overrides
}

export function normalizeBaseModelList(...values) {
  return normalizeStringList(values.flatMap((value) => {
    if (Array.isArray(value)) {
      return value
    }
    if (typeof value === 'string') {
      return value.split(/[\r\n,|]+/g)
    }
    return []
  }))
}
