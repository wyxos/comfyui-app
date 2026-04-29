import { civitaiBooleanQueryParams, civitaiImagesQueryParams, civitaiIntegerQueryParams, civitaiModelsQueryParams } from './config.mjs'
import { safeTrim } from './shared.mjs'

export function parseInteger(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value)
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseInt(value, 10)
    return Number.isFinite(parsed) ? parsed : null
  }

  return null
}

export function parseFloatValue(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseFloat(value)
    return Number.isFinite(parsed) ? parsed : null
  }

  return null
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

export function normalizeCivitaiBoolean(value) {
  const normalized = safeTrim(value).toLowerCase()

  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return 'true'
  }

  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return 'false'
  }

  return null
}

export function appendCivitaiQueryParam(targetParams, allowedParams, key, value) {
  if (!allowedParams.has(key)) {
    return
  }

  const trimmedValue = safeTrim(value)
  if (!trimmedValue || trimmedValue.length > 500) {
    return
  }

  const integerBounds = civitaiIntegerQueryParams.get(key)
  if (integerBounds) {
    const parsedValue = parseInteger(trimmedValue)
    if (parsedValue !== null) {
      targetParams.append(key, String(clamp(parsedValue, integerBounds.min, integerBounds.max)))
    }
    return
  }

  if (civitaiBooleanQueryParams.has(key)) {
    const normalizedBoolean = normalizeCivitaiBoolean(trimmedValue)
    if (normalizedBoolean !== null) {
      targetParams.append(key, normalizedBoolean)
    }
    return
  }

  if (key === 'ids' && !/^\d+(,\d+)*$/.test(trimmedValue)) {
    return
  }

  targetParams.append(key, trimmedValue)
}

export function buildCivitaiModelsQueryParams(sourceParams) {
  const targetParams = new URLSearchParams()

  for (const [key, value] of sourceParams) {
    appendCivitaiQueryParam(targetParams, civitaiModelsQueryParams, key, value)
  }

  return targetParams
}

export function buildCivitaiImagesQueryParams(sourceParams) {
  const targetParams = new URLSearchParams()

  for (const [key, value] of sourceParams) {
    appendCivitaiQueryParam(targetParams, civitaiImagesQueryParams, key, value)
  }

  return targetParams
}
