import {
  ASPECT_RATIO_SCALE_STEP,
  MAX_ASPECT_RATIO_MULTIPLIER,
  MAX_ASPECT_RATIO_SCALE,
  MIN_ASPECT_RATIO_SCALE,
} from './homeConstants'
import type { PromptTag } from './homeTypes'

export function coerceFieldString(value: unknown) {
  if (typeof value === 'string') {
    return value
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value)
  }

  return ''
}

export function coerceTrimmedFieldString(value: unknown) {
  return coerceFieldString(value).trim()
}

export function normalizePromptTag(value: unknown) {
  return coerceTrimmedFieldString(value).replace(/\s+/g, ' ')
}

export function buildPromptTag(text: unknown, strength: unknown = '1', enabled = true): PromptTag | null {
  const normalizedText = normalizePromptTag(text)
  if (!normalizedText) {
    return null
  }

  const tag: PromptTag = {
    text: normalizedText,
    strength: formatPromptWeightInput(strength),
  }

  if (!enabled) {
    tag.enabled = false
  }

  return tag
}

export function getPromptTagKey(tag: Pick<PromptTag, 'text'>) {
  return tag.text.toLowerCase()
}

export function normalizePromptTags(values: unknown) {
  if (!Array.isArray(values)) {
    return []
  }

  const seen = new Set<string>()
  const tags: PromptTag[] = []
  for (const value of values) {
    const tag = isRecord(value)
      ? buildPromptTag(value.text, value.strength, value.enabled !== false)
      : buildPromptTag(value)
    if (!tag) {
      continue
    }

    const key = getPromptTagKey(tag)
    if (!tag || seen.has(key)) {
      continue
    }

    seen.add(key)
    tags.push(tag)
  }

  return tags
}

export function splitPromptDraft(value: string) {
  return value
    .split(/[,;\n]/)
    .map((entry) => buildPromptTag(entry))
    .filter((entry): entry is PromptTag => Boolean(entry))
}

export function hasPromptDraftDelimiter(value: string) {
  return /[,;\n]/.test(value)
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function createClientId(prefix: string) {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`}`
}

export function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export function parseAspectRatioScale(value: string | number) {
  const parsed =
    typeof value === 'number' && Number.isFinite(value)
      ? value
      : Number.parseFloat(coerceTrimmedFieldString(value))
  if (!Number.isFinite(parsed)) {
    return 0
  }

  const clamped = clampNumber(parsed, MIN_ASPECT_RATIO_SCALE, MAX_ASPECT_RATIO_SCALE)
  const stepped = Math.round(clamped / ASPECT_RATIO_SCALE_STEP) * ASPECT_RATIO_SCALE_STEP
  return Number(stepped.toFixed(2))
}

export function formatAspectRatioScale(value: string | number) {
  return parseAspectRatioScale(value)
    .toFixed(2)
    .replace(/\.?0+$/, '')
}

export function formatSignedAspectRatioScale(value: string | number) {
  const formatted = formatAspectRatioScale(value)
  return formatted.startsWith('-') || formatted === '0' ? formatted : `+${formatted}`
}

export function getAspectRatioScaleMultiplier(value: string | number) {
  const scale = parseAspectRatioScale(value)
  const multiplier = 1 + (Math.abs(scale) / MAX_ASPECT_RATIO_SCALE) * (MAX_ASPECT_RATIO_MULTIPLIER - 1)
  return scale < 0 ? 1 / multiplier : multiplier
}

export function normalizeControlNetNumericField(
  value: string | number,
  fallback: number,
  min: number,
  max: number,
) {
  const parsed =
    typeof value === 'number' && Number.isFinite(value)
      ? value
      : Number.parseFloat(coerceTrimmedFieldString(value))
  return Number.isFinite(parsed) ? Math.round(clampNumber(parsed, min, max) * 1000) / 1000 : fallback
}

export function normalizeControlNetResolutionFromDimensions(width: number, height: number) {
  const largestSide = clampNumber(Math.max(width, height), 64, 16384)
  return Math.max(64, Math.round(largestSide / 64) * 64)
}

export function normalizeDimensionInput(value: string | number) {
  const parsed =
    typeof value === 'number' && Number.isFinite(value)
      ? value
      : Number.parseFloat(coerceTrimmedFieldString(value))
  const clamped = Math.min(Math.max(parsed, 64), 16384)
  return Number.isFinite(clamped) ? Math.max(64, Math.round(clamped / 32) * 32) : 64
}

export function getNormalizedScaledAspectSize(baseWidth: number, baseHeight: number, scale: string | number) {
  const multiplier = getAspectRatioScaleMultiplier(scale)
  return {
    width: normalizeDimensionInput(baseWidth * multiplier),
    height: normalizeDimensionInput(baseHeight * multiplier),
  }
}

export function formatControlNetNumber(value: string | number, fallback: number, min: number, max: number) {
  const normalized = normalizeControlNetNumericField(value, fallback, min, max)
  return Number.isInteger(normalized) ? String(normalized) : String(normalized).replace(/0+$/, '').replace(/\.$/, '')
}

export function normalizeTriggerWords(words: unknown) {
  if (!Array.isArray(words)) {
    return []
  }

  const seen = new Set<string>()
  const normalized: string[] = []

  for (const word of words) {
    if (typeof word !== 'string') {
      continue
    }

    const trimmed = word.trim()
    const key = trimmed.toLowerCase()
    if (!trimmed || seen.has(key)) {
      continue
    }

    seen.add(key)
    normalized.push(trimmed)
  }

  return normalized
}

export function getTriggerWordKey(triggerWord: string) {
  return triggerWord.trim().toLowerCase()
}

export function normalizeTriggerWordWeights(weights: unknown) {
  if (!isRecord(weights)) {
    return undefined
  }

  const normalized: Record<string, string> = {}
  for (const [word, weight] of Object.entries(weights)) {
    const key = getTriggerWordKey(word)
    if (!key) {
      continue
    }

    const parsed =
      typeof weight === 'number' && Number.isFinite(weight)
        ? weight
        : Number.parseFloat(coerceTrimmedFieldString(weight))
    if (!Number.isFinite(parsed)) {
      continue
    }

    normalized[key] = formatPromptWeight(Math.max(0.1, Math.round(parsed * 10) / 10))
  }

  return Object.keys(normalized).length ? normalized : undefined
}

export function mediaExtensionFromUrl(url: string | null | undefined) {
  if (!url) {
    return ''
  }

  try {
    return new URL(url, window.location.href).pathname.split('.').pop()?.toLowerCase() ?? ''
  } catch {
    return url.split('?')[0]?.split('#')[0]?.split('.').pop()?.toLowerCase() ?? ''
  }
}

export function isVideoUrl(url: string | null | undefined) {
  return ['mp4', 'webm', 'mov', 'm4v'].includes(mediaExtensionFromUrl(url))
}

export function isVideoPreview(url: string | null | undefined, mediaType: string | null | undefined) {
  return mediaType === 'video' || isVideoUrl(url)
}

export function formatPromptWeight(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, '')
}

export function formatPromptWeightInput(value: unknown) {
  const parsed =
    typeof value === 'number' && Number.isFinite(value)
      ? value
      : Number.parseFloat(coerceTrimmedFieldString(value))

  return Number.isFinite(parsed) ? formatPromptWeight(Math.max(0.1, Math.round(parsed * 10) / 10)) : '1'
}

export function isNeutralPromptWeight(value: string | number) {
  const parsed =
    typeof value === 'number' && Number.isFinite(value)
      ? value
      : Number.parseFloat(coerceTrimmedFieldString(value))

  return !Number.isFinite(parsed) || Math.abs(parsed - 1) < 0.001
}

export function stepPromptWeight(value: number, direction: 1 | -1) {
  const nextValue = Math.round((value + direction * 0.1) * 10) / 10
  return Math.max(0.1, nextValue)
}

export function replaceWeightedSelection(
  source: string,
  rangeStart: number,
  rangeEnd: number,
  innerText: string,
  weight: number,
) {
  const replacement = `(${innerText}:${formatPromptWeight(weight)})`
  const nextText = source.slice(0, rangeStart) + replacement + source.slice(rangeEnd)
  const selectionStart = rangeStart + 1
  const selectionEnd = selectionStart + innerText.length

  return {
    nextText,
    selectionStart,
    selectionEnd,
  }
}

export function transformWeightedPrompt(
  source: string,
  selectionStart: number,
  selectionEnd: number,
  direction: 1 | -1,
) {
  if (selectionStart === selectionEnd) {
    return null
  }

  const selectedText = source.slice(selectionStart, selectionEnd)
  const fullyWrappedMatch = selectedText.match(/^\(([\s\S]+):([+-]?\d+(?:\.\d+)?)\)$/)

  if (fullyWrappedMatch) {
    const innerText = fullyWrappedMatch[1]
    const currentWeight = Number.parseFloat(fullyWrappedMatch[2])

    return replaceWeightedSelection(
      source,
      selectionStart,
      selectionEnd,
      innerText,
      stepPromptWeight(currentWeight, direction),
    )
  }

  const trailingWeightMatch =
    selectionStart > 0 && source[selectionStart - 1] === '('
      ? source.slice(selectionEnd).match(/^:([+-]?\d+(?:\.\d+)?)\)/)
      : null

  if (trailingWeightMatch) {
    const currentWeight = Number.parseFloat(trailingWeightMatch[1])
    const wrapperStart = selectionStart - 1
    const wrapperEnd = selectionEnd + trailingWeightMatch[0].length

    return replaceWeightedSelection(
      source,
      wrapperStart,
      wrapperEnd,
      selectedText,
      stepPromptWeight(currentWeight, direction),
    )
  }

  return replaceWeightedSelection(source, selectionStart, selectionEnd, selectedText, 1)
}
