import { mkdirSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { configDir, promptAssistantDatabasePath } from '../config.mjs'
import { normalizeProviderQuery, promptTagProviders } from './providers.mjs'
import {
  normalizeProviderTagKey,
  normalizeSuggestionText,
  promptSuggestionTargets,
} from './provider-targets.mjs'

const SUCCESS_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000
const ERROR_CACHE_TTL_MS = 15 * 60 * 1000
const DEFAULT_PROVIDER_CACHE_LIMIT = 40

let promptProviderDatabase = null

function openPromptProviderDatabase() {
  if (promptProviderDatabase) {
    return promptProviderDatabase
  }

  mkdirSync(configDir, { recursive: true })
  promptProviderDatabase = new DatabaseSync(promptAssistantDatabasePath)
  promptProviderDatabase.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS prompt_provider_query_cache (
      provider TEXT NOT NULL,
      query TEXT NOT NULL,
      fetched_at TEXT NOT NULL,
      ok INTEGER NOT NULL,
      error_message TEXT NOT NULL,
      suggestions_json TEXT NOT NULL,
      PRIMARY KEY (provider, query)
    );

    CREATE INDEX IF NOT EXISTS prompt_provider_query_cache_query_index
      ON prompt_provider_query_cache (query, fetched_at);
  `)

  return promptProviderDatabase
}

function coerceLimit(limit) {
  const parsed = Number.parseInt(String(limit ?? DEFAULT_PROVIDER_CACHE_LIMIT), 10)
  return Math.max(1, Math.min(80, Number.isFinite(parsed) ? parsed : DEFAULT_PROVIDER_CACHE_LIMIT))
}

function safeJsonList(value) {
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function isCacheRowFresh(row, now = Date.now()) {
  const fetchedAt = Date.parse(row?.fetched_at ?? '')
  if (!Number.isFinite(fetchedAt)) {
    return false
  }

  const ttl = row.ok ? SUCCESS_CACHE_TTL_MS : ERROR_CACHE_TTL_MS
  return now - fetchedAt <= ttl
}

function normalizeCachedProviderRecord(record, fallbackProvider) {
  const suggestion = record?.suggestion
  if (!suggestion || typeof suggestion !== 'object') {
    return null
  }

  const targetSections = Array.isArray(suggestion.targetSections)
    ? suggestion.targetSections.filter((target) => promptSuggestionTargets.has(target))
    : []
  if (!targetSections.length) {
    return null
  }

  return {
    provider: normalizeSuggestionText(record.provider) || fallbackProvider,
    postCount: Math.max(0, Number.parseInt(String(record.postCount ?? 0), 10) || 0),
    suggestion: {
      id: normalizeSuggestionText(suggestion.id),
      kind: suggestion.kind === 'character' ? 'character' : 'tag',
      label: normalizeSuggestionText(suggestion.label) || normalizeSuggestionText(suggestion.prompt),
      prompt: normalizeSuggestionText(suggestion.prompt),
      aliases: Array.isArray(suggestion.aliases)
        ? suggestion.aliases.map(normalizeSuggestionText).filter(Boolean)
        : [],
      category: normalizeSuggestionText(suggestion.category) || 'General',
      targetSections,
    },
  }
}

function scoreCachedProviderRecord(record, query) {
  const suggestion = record.suggestion
  const prompt = normalizeProviderTagKey(suggestion.prompt)
  const label = normalizeProviderTagKey(suggestion.label)
  const aliases = suggestion.aliases.map(normalizeProviderTagKey)
  if (prompt.startsWith(query)) {
    return 0
  }
  if (label.startsWith(query)) {
    return 1
  }
  if (aliases.some((alias) => alias.startsWith(query))) {
    return 2
  }
  if (prompt.includes(query) || label.includes(query) || aliases.some((alias) => alias.includes(query))) {
    return 10
  }

  return null
}

export function readPromptProviderCacheState(query, providers = promptTagProviders) {
  const normalizedQuery = normalizeProviderQuery(query)
  if (!normalizedQuery) {
    return { query: '', staleProviders: [] }
  }

  const db = openPromptProviderDatabase()
  const rows = db.prepare(`
    SELECT provider, fetched_at, ok
    FROM prompt_provider_query_cache
    WHERE query = ?
  `).all(normalizedQuery)
  const rowsByProvider = new Map(rows.map((row) => [row.provider, row]))
  const staleProviders = providers.filter((provider) => !isCacheRowFresh(rowsByProvider.get(provider.id)))

  return { query: normalizedQuery, staleProviders }
}

export function replacePromptProviderQueryCache({
  provider,
  query,
  records = [],
  ok = true,
  errorMessage = '',
  fetchedAt = new Date().toISOString(),
}) {
  const normalizedQuery = normalizeProviderQuery(query)
  const providerId = normalizeSuggestionText(provider)
  if (!normalizedQuery || !providerId) {
    return
  }

  const normalizedRecords = records
    .map((record) => normalizeCachedProviderRecord(record, providerId))
    .filter(Boolean)
  const db = openPromptProviderDatabase()
  db.prepare(`
    INSERT INTO prompt_provider_query_cache (
      provider,
      query,
      fetched_at,
      ok,
      error_message,
      suggestions_json
    )
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(provider, query) DO UPDATE SET
      fetched_at = excluded.fetched_at,
      ok = excluded.ok,
      error_message = excluded.error_message,
      suggestions_json = excluded.suggestions_json
  `).run(
    providerId,
    normalizedQuery,
    fetchedAt,
    ok ? 1 : 0,
    normalizeSuggestionText(errorMessage),
    JSON.stringify(normalizedRecords),
  )
}

export function readCachedPromptProviderSuggestionRecords({ query, target, limit }) {
  const normalizedQuery = normalizeProviderQuery(query)
  const normalizedTarget = normalizeSuggestionText(target).toLowerCase()
  if (!normalizedQuery || !promptSuggestionTargets.has(normalizedTarget)) {
    return []
  }

  const db = openPromptProviderDatabase()
  const rows = db.prepare(`
    SELECT provider, suggestions_json
    FROM prompt_provider_query_cache
    WHERE query = ? AND ok = 1
  `).all(normalizedQuery)

  return rows
    .flatMap((row) =>
      safeJsonList(row.suggestions_json)
        .map((record) => normalizeCachedProviderRecord(record, row.provider))
        .filter(Boolean),
    )
    .filter((record) => record.suggestion.targetSections.includes(normalizedTarget))
    .map((record) => ({ ...record, score: scoreCachedProviderRecord(record, normalizedQuery) }))
    .filter((record) => record.score !== null)
    .sort((first, second) =>
      first.score - second.score ||
      second.postCount - first.postCount ||
      first.suggestion.label.localeCompare(second.suggestion.label),
    )
    .slice(0, coerceLimit(limit))
    .map((record) => ({
      provider: record.provider,
      postCount: record.postCount,
      suggestion: record.suggestion,
    }))
}

export function clearPromptProviderCache() {
  openPromptProviderDatabase().prepare('DELETE FROM prompt_provider_query_cache').run()
}

export function resetPromptProviderCacheRuntimeState() {
  if (promptProviderDatabase) {
    promptProviderDatabase.close()
  }
  promptProviderDatabase = null
}
