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

export function delay(ms) {
  return new Promise((resolveDelay) => {
    setTimeout(resolveDelay, ms)
  })
}

export function normalizePlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}
