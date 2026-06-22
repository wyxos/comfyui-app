import {
  normalizeProviderTagKey,
  normalizeSuggestionKey,
  normalizeSuggestionText,
} from './provider-targets.mjs'

const DEFAULT_SEARCH_LIMIT = 8

export function coercePromptSuggestionLimit(limit) {
  const parsed = Number.parseInt(String(limit ?? DEFAULT_SEARCH_LIMIT), 10)
  return Math.max(1, Math.min(20, Number.isFinite(parsed) ? parsed : DEFAULT_SEARCH_LIMIT))
}

function scoreField(value, query, baseScore) {
  const normalized = normalizeProviderTagKey(value)
  if (!normalized) {
    return null
  }

  if (normalized.startsWith(query)) {
    return baseScore
  }

  if (normalized.includes(query)) {
    return baseScore + 10
  }

  return null
}

function scoreSuggestion(suggestion, query) {
  const scores = [
    scoreField(suggestion.prompt, query, 0),
    scoreField(suggestion.label, query, 0),
    ...(suggestion.aliases ?? []).map((alias) => scoreField(alias, query, 2)),
    scoreField(suggestion.category, query, 4),
  ].filter((score) => score !== null)

  return scores.length ? Math.min(...scores) : 50
}

function resultKey(suggestion) {
  return `${suggestion.kind}:${normalizeSuggestionKey(suggestion.prompt)}`
}

function normalizeResultSuggestion(suggestion) {
  return {
    id: normalizeSuggestionText(suggestion.id),
    kind: suggestion.kind === 'character' ? 'character' : 'tag',
    label: normalizeSuggestionText(suggestion.label) || normalizeSuggestionText(suggestion.prompt),
    prompt: normalizeSuggestionText(suggestion.prompt),
    aliases: Array.isArray(suggestion.aliases)
      ? suggestion.aliases.map(normalizeSuggestionText).filter(Boolean)
      : [],
    category: normalizeSuggestionText(suggestion.category) || 'General',
    targetSections: Array.isArray(suggestion.targetSections)
      ? suggestion.targetSections.map(normalizeSuggestionText).filter(Boolean)
      : [],
    ...(Array.isArray(suggestion.helperTags) && suggestion.helperTags.length
      ? { helperTags: suggestion.helperTags.map(normalizeSuggestionText).filter(Boolean) }
      : {}),
  }
}

export function mergePromptSuggestionResults({
  localSuggestions,
  providerRecords,
  query,
  limit,
}) {
  const normalizedQuery = normalizeProviderTagKey(query)
  const merged = new Map()
  const candidates = [
    ...localSuggestions.map((suggestion, index) => ({
      index,
      postCount: 0,
      sourceRank: 0,
      suggestion: normalizeResultSuggestion(suggestion),
    })),
    ...providerRecords.map((record, index) => ({
      index,
      postCount: record.postCount,
      sourceRank: 1,
      suggestion: normalizeResultSuggestion(record.suggestion),
    })),
  ]

  for (const candidate of candidates) {
    const key = resultKey(candidate.suggestion)
    const existing = merged.get(key)
    if (!existing || candidate.sourceRank < existing.sourceRank) {
      merged.set(key, candidate)
    }
  }

  return [...merged.values()]
    .sort((first, second) =>
      scoreSuggestion(first.suggestion, normalizedQuery) - scoreSuggestion(second.suggestion, normalizedQuery) ||
      first.sourceRank - second.sourceRank ||
      second.postCount - first.postCount ||
      first.suggestion.label.localeCompare(second.suggestion.label) ||
      first.index - second.index,
    )
    .slice(0, coercePromptSuggestionLimit(limit))
    .map((candidate) => candidate.suggestion)
}
