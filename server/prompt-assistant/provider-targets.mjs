export const promptSuggestionTargets = new Set([
  'subject',
  'details',
  'environment',
  'style',
  'lighting',
  'quality',
  'others',
  'negative',
])

export function normalizeSuggestionText(value) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''
}

export function normalizeSuggestionKey(value) {
  return normalizeSuggestionText(typeof value === 'string' ? value.replace(/_/g, ' ') : value).toLowerCase()
}

export function normalizeProviderTagKey(value) {
  return normalizeSuggestionText(value).toLowerCase().replace(/\s+/g, '_')
}

export function humanizeProviderTag(value) {
  return normalizeSuggestionText(value.replace(/_/g, ' '))
}

export function titleCaseTag(value) {
  return humanizeProviderTag(value)
    .replace(/\b[\p{L}\p{N}]/gu, (letter) => letter.toUpperCase())
}

export function uniqueSuggestionList(values) {
  const seen = new Set()
  const normalizedValues = Array.isArray(values) ? values : []

  return normalizedValues
    .map(normalizeSuggestionText)
    .filter((value) => {
      const key = normalizeSuggestionKey(value)
      if (!key || seen.has(key)) {
        return false
      }

      seen.add(key)
      return true
    })
}

function inferGeneralTargets(prompt) {
  const tag = normalizeProviderTagKey(prompt)
  if (/^\d+(girl|boy)s?$/.test(tag) || /(solo|focus|person|people|male|female)/.test(tag)) {
    return ['subject']
  }

  if (/(eye|hair|ear|horn|tail|face|hand|pose|clothes|dress|shirt|skirt|uniform|weapon|expression)/.test(tag)) {
    return ['details']
  }

  if (/(light|shadow|backlight|rim|glow|sunlight|moonlight|neon|spotlight)/.test(tag)) {
    return ['lighting']
  }

  if (/(background|outdoor|indoor|sky|cloud|city|forest|beach|room|street|school|garden|landscape)/.test(tag)) {
    return ['environment']
  }

  if (/(style|medium|monochrome|greyscale|comic|pixel|realistic|photo|painting|anime|chibi)/.test(tag)) {
    return ['style']
  }

  if (/(highres|absurdres|masterpiece|quality|detailed|official_art)/.test(tag)) {
    return ['quality']
  }

  return ['details', 'others']
}

function inferMetaTargets(prompt) {
  const targets = inferGeneralTargets(prompt)
  return targets.includes('details') ? ['quality', 'others'] : targets
}

export function inferProviderTargetSections({ category, kind, prompt }) {
  const normalizedCategory = normalizeSuggestionKey(category)
  if (normalizedCategory.includes('negative')) {
    return ['negative']
  }

  if (kind === 'character' || normalizedCategory.includes('character')) {
    return ['subject']
  }

  if (normalizedCategory.includes('copyright')) {
    return ['subject']
  }

  if (normalizedCategory.includes('artist')) {
    return ['style']
  }

  if (normalizedCategory.includes('species')) {
    return ['subject', 'details']
  }

  if (normalizedCategory.includes('lore')) {
    return ['subject', 'details', 'others']
  }

  if (normalizedCategory.includes('meta')) {
    return inferMetaTargets(prompt)
  }

  return inferGeneralTargets(prompt)
}

export function buildProviderSuggestionId(providerId, kind, prompt) {
  const slug = normalizeProviderTagKey(prompt)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return `${providerId}-${kind}-${slug || 'suggestion'}`
}
