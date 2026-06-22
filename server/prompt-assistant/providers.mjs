import {
  buildProviderSuggestionId,
  humanizeProviderTag,
  inferProviderTargetSections,
  normalizeProviderTagKey,
  normalizeSuggestionText,
  titleCaseTag,
  uniqueSuggestionList,
} from './provider-targets.mjs'

const DEFAULT_PROVIDER_LIMIT = 12
const PROVIDER_TIMEOUT_MS = 5000

const DANBOORU_CATEGORY_NAMES = new Map([
  [0, 'General'],
  [1, 'Artist'],
  [3, 'Copyright'],
  [4, 'Character'],
  [5, 'Meta'],
])

const E621_CATEGORY_NAMES = new Map([
  [0, 'General'],
  [1, 'Artist'],
  [3, 'Copyright'],
  [4, 'Character'],
  [5, 'Species'],
  [6, 'Invalid'],
  [7, 'Meta'],
  [8, 'Lore'],
])

export const promptTagProviders = Object.freeze([
  {
    id: 'danbooru',
    name: 'Danbooru',
    kind: 'danbooru',
    baseUrl: 'https://danbooru.donmai.us',
    categories: DANBOORU_CATEGORY_NAMES,
  },
  {
    id: 'aibooru',
    name: 'AIBooru',
    kind: 'danbooru',
    baseUrl: 'https://aibooru.online',
    categories: DANBOORU_CATEGORY_NAMES,
  },
  {
    id: 'e621',
    name: 'e621',
    kind: 'danbooru',
    baseUrl: 'https://e621.net',
    categories: E621_CATEGORY_NAMES,
  },
])

function coerceInteger(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ''), 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

export function normalizeProviderQuery(value) {
  const query = normalizeProviderTagKey(value)
    .replace(/[^\p{L}\p{N}_-]+/gu, '')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')

  return query.length >= 3 ? query : ''
}

function buildDanbooruProviderUrl(provider, query, limit) {
  const url = new URL('/tags.json', provider.baseUrl)
  url.searchParams.set('search[name_matches]', `${query}*`)
  url.searchParams.set('search[hide_empty]', 'yes')
  url.searchParams.set('search[order]', 'count')
  url.searchParams.set('limit', String(limit))
  return url
}

function buildProviderUrl(provider, query, limit) {
  if (provider.kind === 'danbooru') {
    return buildDanbooruProviderUrl(provider, query, limit)
  }

  throw new Error(`Unsupported prompt tag provider: ${provider.id}`)
}

function categoryNameForProvider(provider, category) {
  return provider.categories.get(coerceInteger(category)) ?? 'General'
}

function normalizeProviderTag(provider, tag) {
  const prompt = normalizeSuggestionText(tag?.name)
  if (!prompt) {
    return null
  }

  const postCount = coerceInteger(tag?.post_count ?? tag?.count)
  if (postCount <= 0) {
    return null
  }

  const category = categoryNameForProvider(provider, tag?.category ?? tag?.type)
  const kind = category === 'Character' ? 'character' : 'tag'
  const label = titleCaseTag(prompt)
  const humanized = humanizeProviderTag(prompt)
  const suggestion = {
    id: buildProviderSuggestionId(provider.id, kind, prompt),
    kind,
    label,
    prompt,
    aliases: uniqueSuggestionList([humanized, provider.name]),
    category,
    targetSections: inferProviderTargetSections({ category, kind, prompt }),
  }

  return {
    provider: provider.id,
    postCount,
    suggestion,
  }
}

function normalizeProviderPayload(provider, payload) {
  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.tag)
      ? payload.tag
      : []

  return rows.map((tag) => normalizeProviderTag(provider, tag)).filter(Boolean)
}

function scoreProviderRecord(record, query) {
  const prompt = normalizeProviderTagKey(record.suggestion.prompt)
  const label = normalizeProviderTagKey(record.suggestion.label)
  const aliases = record.suggestion.aliases.map(normalizeProviderTagKey)
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

  return 20
}

function sortProviderRecords(records, query) {
  return [...records].sort((first, second) =>
    scoreProviderRecord(first, query) - scoreProviderRecord(second, query) ||
    second.postCount - first.postCount ||
    first.suggestion.label.localeCompare(second.suggestion.label),
  )
}

export async function fetchPromptTagProviderSuggestions(provider, query, {
  fetchImpl = fetch,
  limit = DEFAULT_PROVIDER_LIMIT,
} = {}) {
  const normalizedQuery = normalizeProviderQuery(query)
  if (!normalizedQuery) {
    return []
  }

  const response = await fetchImpl(buildProviderUrl(provider, normalizedQuery, limit), {
    headers: {
      'User-Agent': 'comfyui-companion-app prompt-assistant',
    },
    signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
  })
  if (!response.ok) {
    throw new Error(`${provider.name} returned HTTP ${response.status}.`)
  }

  const payload = await response.json()
  return sortProviderRecords(normalizeProviderPayload(provider, payload), normalizedQuery)
}
