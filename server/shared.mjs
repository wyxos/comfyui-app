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

export function nsfwLevelDetectedValue(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value > 4 : null
  }

  const normalized = safeTrim(value).toLowerCase()
  if (!normalized) {
    return null
  }

  const numericLevel = Number(normalized)
  if (Number.isFinite(numericLevel)) {
    return numericLevel > 4
  }

  return ![
    'false',
    '0',
    '1',
    '2',
    'none',
    'safe',
    'soft',
    'pg',
    'pg-13',
    'pg13',
    'not detected',
    'not_detected',
  ].includes(normalized)
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
