export function tryParseJson(value) {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

export function safeTrim(value) {
  return typeof value === 'string' ? value.trim() : ''
}

export function normalizeOptionalBoolean(value) {
  if (typeof value === 'boolean') {
    return value
  }

  if (typeof value === 'number') {
    return value === 1 ? true : value === 0 ? false : null
  }

  const normalized = safeTrim(value).toLowerCase()
  if (['true', '1', 'yes', 'y'].includes(normalized)) {
    return true
  }

  if (['false', '0', 'no', 'n'].includes(normalized)) {
    return false
  }

  return null
}

export function normalizeNsfwLevel(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value)
  }

  const normalized = safeTrim(value)
  return normalized || null
}

const NSFW_LEVEL_BITS = [32, 16, 8, 4, 2, 1]
const NSFW_LEVEL_ALIASES = {
  false: 0,
  none: 0,
  safe: 1,
  pg: 1,
  soft: 2,
  'pg-13': 2,
  pg13: 2,
  r: 4,
  mature: 7,
  x: 8,
  xxx: 16,
  blocked: 32,
  'not detected': 0,
  not_detected: 0,
}

export const NSFW_BLUR_LEVELS = [4, 8, 16, 32]

function normalizeNsfwLevelNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value)
  }

  const normalized = safeTrim(value).toLowerCase()
  if (!normalized) {
    return null
  }

  const numericLevel = Number(normalized)
  if (Number.isFinite(numericLevel)) {
    return Math.trunc(numericLevel)
  }

  return NSFW_LEVEL_ALIASES[normalized] ?? null
}

function highestNsfwLevel(value) {
  const level = normalizeNsfwLevelNumber(value)
  if (level === null) {
    return null
  }

  for (const bit of NSFW_LEVEL_BITS) {
    if ((level & bit) === bit) {
      return bit
    }
  }

  return level >= 4 ? level : 0
}

export function nsfwLevelDetectedValue(value) {
  const highestLevel = highestNsfwLevel(value)
  if (highestLevel === null) {
    return null
  }

  return highestLevel >= 4
}

export function imageListNsfwLevelDetectedValue(images) {
  let hasCurrentSafeImage = false
  for (const image of Array.isArray(images) ? images : []) {
    const detected = nsfwLevelDetectedValue(image?.nsfwLevel)
    if (detected === true) {
      return true
    }
    if (detected === false) {
      hasCurrentSafeImage = true
    }
  }

  return hasCurrentSafeImage ? false : null
}

export function delay(ms) {
  return new Promise((resolveDelay) => {
    setTimeout(resolveDelay, ms)
  })
}

export function normalizePlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}
