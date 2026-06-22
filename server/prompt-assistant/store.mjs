import { mkdirSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { configDir, promptAssistantDatabasePath } from '../config.mjs'

const VALID_TARGETS = new Set(['subject', 'details', 'environment', 'style', 'lighting', 'quality', 'others', 'negative'])
const DEFAULT_LIMIT = 8
const CANDIDATE_LIMIT = 80
const DEFAULT_SOURCE_KIND = 'manual'

let promptAssistantDatabase = null

function normalizeSearchText(value) {
  return typeof value === 'string' ? value.trim().toLowerCase().replace(/\s+/g, ' ') : ''
}

function normalizeJsonList(value) {
  return Array.isArray(value)
    ? value.map((item) => (typeof item === 'string' ? item.trim().replace(/\s+/g, ' ') : '')).filter(Boolean)
    : []
}

function normalizeCharacterKey(value) {
  return normalizeSearchText(typeof value === 'string' ? value.replace(/_/g, ' ') : '')
}

function searchTextForSuggestion(suggestion) {
  return [
    suggestion.prompt,
    suggestion.label,
    ...(suggestion.aliases ?? []),
    suggestion.category,
    ...(suggestion.helperTags ?? []),
  ]
    .map(normalizeSearchText)
    .filter(Boolean)
    .join(' ')
}

function ensureTableColumn(db, table, column, alterSql) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all()
  if (!columns.some((row) => row.name === column)) {
    db.exec(alterSql)
  }
}

function makeFtsQuery(query) {
  const tokens = normalizeSearchText(query)
    .replace(/[^\p{L}\p{N}_]+/gu, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3)

  return tokens.join(' ')
}

function coerceLimit(limit) {
  const parsed = Number.parseInt(String(limit ?? DEFAULT_LIMIT), 10)
  return Math.max(1, Math.min(20, Number.isFinite(parsed) ? parsed : DEFAULT_LIMIT))
}

function openPromptAssistantDatabase() {
  if (promptAssistantDatabase) {
    return promptAssistantDatabase
  }

  mkdirSync(configDir, { recursive: true })
  promptAssistantDatabase = new DatabaseSync(promptAssistantDatabasePath)
  promptAssistantDatabase.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS prompt_suggestion_pack (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      source_names_json TEXT NOT NULL,
      imported_at TEXT NOT NULL,
      suggestion_count INTEGER NOT NULL,
      source_kind TEXT NOT NULL DEFAULT '',
      source_version TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS prompt_suggestions (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      label TEXT NOT NULL,
      label_norm TEXT NOT NULL,
      prompt TEXT NOT NULL,
      prompt_norm TEXT NOT NULL,
      aliases_json TEXT NOT NULL,
      aliases_norm TEXT NOT NULL,
      category TEXT NOT NULL,
      category_norm TEXT NOT NULL,
      helper_tags_json TEXT NOT NULL,
      search_text_norm TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS prompt_suggestion_targets (
      suggestion_id TEXT NOT NULL REFERENCES prompt_suggestions(id) ON DELETE CASCADE,
      target TEXT NOT NULL,
      PRIMARY KEY (suggestion_id, target)
    );

    CREATE INDEX IF NOT EXISTS prompt_suggestion_targets_target_index
      ON prompt_suggestion_targets (target, suggestion_id);
    CREATE INDEX IF NOT EXISTS prompt_suggestions_prompt_norm_index
      ON prompt_suggestions (prompt_norm);
    CREATE INDEX IF NOT EXISTS prompt_suggestions_label_norm_index
      ON prompt_suggestions (label_norm);

    CREATE VIRTUAL TABLE IF NOT EXISTS prompt_suggestions_fts
      USING fts5(suggestion_id UNINDEXED, search_text, tokenize='trigram');

    CREATE TABLE IF NOT EXISTS prompt_character_traits (
      character_key TEXT PRIMARY KEY,
      prompt TEXT NOT NULL,
      helper_tags_json TEXT NOT NULL,
      source TEXT NOT NULL,
      post_count INTEGER NOT NULL,
      generated_at TEXT NOT NULL
    );
  `)
  ensureTableColumn(
    promptAssistantDatabase,
    'prompt_suggestion_pack',
    'source_kind',
    "ALTER TABLE prompt_suggestion_pack ADD COLUMN source_kind TEXT NOT NULL DEFAULT ''",
  )
  ensureTableColumn(
    promptAssistantDatabase,
    'prompt_suggestion_pack',
    'source_version',
    "ALTER TABLE prompt_suggestion_pack ADD COLUMN source_version TEXT NOT NULL DEFAULT ''",
  )

  return promptAssistantDatabase
}

function clearPromptAssistantRows(db) {
  db.prepare('DELETE FROM prompt_suggestions_fts').run()
  db.prepare('DELETE FROM prompt_suggestion_targets').run()
  db.prepare('DELETE FROM prompt_suggestions').run()
  db.prepare('DELETE FROM prompt_suggestion_pack').run()
}

function rowToSuggestion(row) {
  return {
    id: row.id,
    kind: row.kind,
    label: row.label,
    prompt: row.prompt,
    aliases: JSON.parse(row.aliases_json),
    category: row.category,
    targetSections: String(row.target_sections ?? '').split(',').filter(Boolean),
    ...(JSON.parse(row.helper_tags_json).length ? { helperTags: JSON.parse(row.helper_tags_json) } : {}),
  }
}

function statusFromRow(row) {
  if (!row) {
    return {
      ok: true,
      loaded: false,
      count: 0,
      sourceNames: [],
      importedAt: null,
      sourceKind: '',
      sourceVersion: '',
    }
  }

  return {
    ok: true,
    loaded: true,
    count: row.suggestion_count,
    sourceNames: JSON.parse(row.source_names_json),
    importedAt: row.imported_at,
    sourceKind: row.source_kind ?? '',
    sourceVersion: row.source_version ?? '',
  }
}

function scoreField(value, query, baseScore) {
  const normalized = normalizeSearchText(value)
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
    ...suggestion.aliases.map((alias) => scoreField(alias, query, 2)),
    scoreField(suggestion.category, query, 4),
  ].filter((score) => score !== null)

  return scores.length ? Math.min(...scores) : null
}

function sortedSearchResults(rows, query, limit) {
  return rows
    .map((row, index) => ({ suggestion: rowToSuggestion(row), index }))
    .map((match) => ({ ...match, score: scoreSuggestion(match.suggestion, query) }))
    .filter((match) => match.score !== null)
    .sort((first, second) =>
      first.score - second.score ||
      first.suggestion.label.localeCompare(second.suggestion.label) ||
      first.index - second.index,
    )
    .slice(0, limit)
    .map((match) => match.suggestion)
}

function candidateSelectSql(whereClause) {
  return `
    SELECT
      s.id,
      s.kind,
      s.label,
      s.prompt,
      s.aliases_json,
      s.category,
      s.helper_tags_json,
      GROUP_CONCAT(all_targets.target) AS target_sections
    FROM prompt_suggestions s
    JOIN prompt_suggestion_targets active_target
      ON active_target.suggestion_id = s.id AND active_target.target = ?
    JOIN prompt_suggestion_targets all_targets
      ON all_targets.suggestion_id = s.id
    ${whereClause}
    GROUP BY s.id
    LIMIT ?
  `
}

function mergeCandidateRows(rows) {
  const byId = new Map()
  for (const row of rows) {
    if (!byId.has(row.id)) {
      byId.set(row.id, row)
    }
  }

  return [...byId.values()]
}

function findCandidateRows(db, query, target) {
  const rows = []
  const ftsQuery = makeFtsQuery(query)
  if (ftsQuery) {
    rows.push(...db.prepare(candidateSelectSql(`
      JOIN prompt_suggestions_fts fts ON fts.suggestion_id = s.id
      WHERE fts.search_text MATCH ?
    `)).all(target, ftsQuery, CANDIDATE_LIMIT))
    if (rows.length) {
      return mergeCandidateRows(rows)
    }
  }

  const likeQuery = `%${query}%`
  rows.push(...db.prepare(candidateSelectSql(`
    WHERE s.search_text_norm LIKE ?
  `)).all(target, likeQuery, CANDIDATE_LIMIT))

  return mergeCandidateRows(rows)
}

export function readPromptAssistantStatus() {
  const db = openPromptAssistantDatabase()
  const row = db.prepare(`
    SELECT source_names_json, imported_at, suggestion_count, source_kind, source_version
    FROM prompt_suggestion_pack
    WHERE id = 1
  `).get()

  return statusFromRow(row)
}

export function replacePromptAssistantPack(pack, metadata = {}) {
  const db = openPromptAssistantDatabase()
  const insertPack = db.prepare(`
    INSERT INTO prompt_suggestion_pack (
      id,
      source_names_json,
      imported_at,
      suggestion_count,
      source_kind,
      source_version
    )
    VALUES (1, ?, ?, ?, ?, ?)
  `)
  const insertSuggestion = db.prepare(`
    INSERT INTO prompt_suggestions (
      id,
      kind,
      label,
      label_norm,
      prompt,
      prompt_norm,
      aliases_json,
      aliases_norm,
      category,
      category_norm,
      helper_tags_json,
      search_text_norm
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const insertTarget = db.prepare(`
    INSERT OR IGNORE INTO prompt_suggestion_targets (suggestion_id, target)
    VALUES (?, ?)
  `)
  const insertFts = db.prepare(`
    INSERT INTO prompt_suggestions_fts (suggestion_id, search_text)
    VALUES (?, ?)
  `)

  db.exec('BEGIN IMMEDIATE')
  try {
    const sourceKind = normalizeSearchText(metadata.sourceKind ?? pack.sourceKind ?? DEFAULT_SOURCE_KIND) ||
      DEFAULT_SOURCE_KIND
    const sourceVersion = normalizeSearchText(metadata.sourceVersion ?? pack.sourceVersion ?? '')
    clearPromptAssistantRows(db)
    insertPack.run(
      JSON.stringify(pack.sourceNames),
      pack.importedAt,
      pack.suggestions.length,
      sourceKind,
      sourceVersion,
    )

    for (const suggestion of pack.suggestions) {
      const aliases = normalizeJsonList(suggestion.aliases)
      const helperTags = normalizeJsonList(suggestion.helperTags)
      const targets = normalizeJsonList(suggestion.targetSections).filter((target) => VALID_TARGETS.has(target))
      const searchText = searchTextForSuggestion({ ...suggestion, aliases, helperTags })
      insertSuggestion.run(
        suggestion.id,
        suggestion.kind === 'character' ? 'character' : 'tag',
        suggestion.label,
        normalizeSearchText(suggestion.label),
        suggestion.prompt,
        normalizeSearchText(suggestion.prompt),
        JSON.stringify(aliases),
        aliases.map(normalizeSearchText).join(' '),
        suggestion.category,
        normalizeSearchText(suggestion.category),
        JSON.stringify(helperTags),
        searchText,
      )
      for (const target of targets) {
        insertTarget.run(suggestion.id, target)
      }
      insertFts.run(suggestion.id, searchText)
    }

    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }

  return readPromptAssistantStatus()
}

export function clearPromptAssistantPack() {
  const db = openPromptAssistantDatabase()
  db.exec('BEGIN IMMEDIATE')
  try {
    clearPromptAssistantRows(db)
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }

  return readPromptAssistantStatus()
}

export function searchPromptAssistantSuggestions({ query, target, limit = DEFAULT_LIMIT }) {
  const normalizedQuery = normalizeSearchText(query)
  const normalizedTarget = normalizeSearchText(target)
  if (!normalizedQuery || !VALID_TARGETS.has(normalizedTarget)) {
    return []
  }

  const db = openPromptAssistantDatabase()
  const rows = findCandidateRows(db, normalizedQuery, normalizedTarget)
  return sortedSearchResults(rows, normalizedQuery, coerceLimit(limit))
}

export function readPromptCharacterTraits(prompt) {
  const characterKey = normalizeCharacterKey(prompt)
  if (!characterKey) {
    return null
  }

  const db = openPromptAssistantDatabase()
  const row = db.prepare(`
    SELECT prompt, helper_tags_json, source, post_count, generated_at
    FROM prompt_character_traits
    WHERE character_key = ?
  `).get(characterKey)
  if (!row) {
    return null
  }

  return {
    prompt: row.prompt,
    helperTags: normalizeJsonList(JSON.parse(row.helper_tags_json)),
    source: row.source,
    postCount: row.post_count,
    generatedAt: row.generated_at,
  }
}

export function replacePromptCharacterTraits({
  prompt,
  helperTags,
  source = 'danbooru',
  postCount = 0,
  generatedAt = new Date().toISOString(),
}) {
  const characterKey = normalizeCharacterKey(prompt)
  if (!characterKey) {
    return null
  }

  const normalizedHelperTags = normalizeJsonList(helperTags)
  const db = openPromptAssistantDatabase()
  db.prepare(`
    INSERT INTO prompt_character_traits (
      character_key,
      prompt,
      helper_tags_json,
      source,
      post_count,
      generated_at
    )
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(character_key) DO UPDATE SET
      prompt = excluded.prompt,
      helper_tags_json = excluded.helper_tags_json,
      source = excluded.source,
      post_count = excluded.post_count,
      generated_at = excluded.generated_at
  `).run(
    characterKey,
    prompt,
    JSON.stringify(normalizedHelperTags),
    source,
    Math.max(0, Number.parseInt(String(postCount), 10) || 0),
    generatedAt,
  )

  return readPromptCharacterTraits(prompt)
}

export function resetPromptAssistantStoreRuntimeState() {
  if (promptAssistantDatabase) {
    promptAssistantDatabase.close()
  }
  promptAssistantDatabase = null
}
