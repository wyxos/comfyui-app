import { sendError, sendJson, readJsonBody } from '../http.mjs'
import { parsePromptSuggestionDocuments } from '../prompt-assistant/parser.mjs'
import {
  downloadSaaPromptSuggestionDocuments,
  saaPromptSuggestionSourceKind,
  saaPromptSuggestionSources,
  saaPromptSuggestionSourceVersion,
} from '../prompt-assistant/sources.mjs'
import { fetchDanbooruCharacterPosts, mineCharacterHelperTags } from '../prompt-assistant/traits.mjs'
import {
  clearPromptAssistantPack,
  readPromptCharacterTraits,
  readPromptAssistantStatus,
  replacePromptCharacterTraits,
  replacePromptAssistantPack,
  searchPromptAssistantSuggestions,
} from '../prompt-assistant/store.mjs'
import {
  clearPromptProviderCache,
  readCachedPromptProviderSuggestionRecords,
  readPromptProviderCacheState,
  replacePromptProviderQueryCache,
} from '../prompt-assistant/provider-cache.mjs'
import {
  fetchPromptTagProviderSuggestions,
  promptTagProviders,
} from '../prompt-assistant/providers.mjs'
import {
  coercePromptSuggestionLimit,
  mergePromptSuggestionResults,
} from '../prompt-assistant/search-results.mjs'

const SAA_REFRESH_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000
let promptAssistantSyncPromise = null
const promptProviderSyncPromises = new Map()

function normalizeDocument(value) {
  if (!value || typeof value !== 'object') {
    return null
  }

  const name = typeof value.name === 'string' ? value.name.trim() : ''
  const text = typeof value.text === 'string' ? value.text : ''
  if (!name || !text.trim()) {
    return null
  }

  return { name, text }
}

function normalizePrompt(value) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''
}

function statusPayload(status) {
  return {
    ok: true,
    loaded: status.loaded,
    count: status.count,
    sourceNames: status.sourceNames,
    importedAt: status.importedAt,
    sourceKind: status.sourceKind,
    sourceVersion: status.sourceVersion,
    syncing: Boolean(promptAssistantSyncPromise),
  }
}

function importPackFromDocuments(documents, metadata = {}) {
  const pack = parsePromptSuggestionDocuments(documents)
  return replacePromptAssistantPack(pack, metadata)
}

function statusSourceLooksLikeSaa(status) {
  const saaNames = new Set(saaPromptSuggestionSources.map((source) => source.name))
  return status.sourceNames.some((sourceName) =>
    saaNames.has(sourceName) ||
    /wai_characters|danbooru_e621|view_tags|tag_assist/i.test(sourceName),
  )
}

function isStaleImportedAt(importedAt) {
  const importedMs = importedAt ? Date.parse(importedAt) : Number.NaN
  return !Number.isFinite(importedMs) || Date.now() - importedMs > SAA_REFRESH_INTERVAL_MS
}

function shouldSyncSaaPromptAssistantPack(status) {
  if (!status.loaded) {
    return true
  }

  const isSaaPack = status.sourceKind === saaPromptSuggestionSourceKind ||
    (!status.sourceKind && statusSourceLooksLikeSaa(status))

  return isSaaPack && (
    status.sourceVersion !== saaPromptSuggestionSourceVersion ||
    isStaleImportedAt(status.importedAt)
  )
}

async function syncSaaPromptAssistantPack() {
  const documents = await downloadSaaPromptSuggestionDocuments()
  return importPackFromDocuments(documents, {
    sourceKind: saaPromptSuggestionSourceKind,
    sourceVersion: saaPromptSuggestionSourceVersion,
  })
}

function startPromptAssistantSync() {
  if (!promptAssistantSyncPromise) {
    promptAssistantSyncPromise = syncSaaPromptAssistantPack()
      .catch((error) => {
        console.warn(
          'Prompt assistant SAA sync failed:',
          error instanceof Error ? error.message : String(error),
        )
        return readPromptAssistantStatus()
      })
      .finally(() => {
        promptAssistantSyncPromise = null
      })
  }

  return promptAssistantSyncPromise
}

function startPromptAssistantSyncIfNeeded(status) {
  if (!shouldSyncSaaPromptAssistantPack(status)) {
    return false
  }

  startPromptAssistantSync()
  return true
}

function providerSyncKey(provider, query) {
  return `${provider.id}:${query}`
}

function syncPromptTagProvider(provider, query) {
  return fetchPromptTagProviderSuggestions(provider, query)
    .then((records) => {
      replacePromptProviderQueryCache({
        provider: provider.id,
        query,
        records,
      })
    })
    .catch((error) => {
      replacePromptProviderQueryCache({
        provider: provider.id,
        query,
        ok: false,
        errorMessage: error instanceof Error ? error.message : String(error),
      })
    })
}

function startPromptProviderSyncsIfNeeded(query, target) {
  if (normalizePrompt(target).toLowerCase() === 'negative') {
    return false
  }

  const cacheState = readPromptProviderCacheState(query, promptTagProviders)
  if (!cacheState.query || !cacheState.staleProviders.length) {
    return false
  }

  for (const provider of cacheState.staleProviders) {
    const key = providerSyncKey(provider, cacheState.query)
    if (promptProviderSyncPromises.has(key)) {
      continue
    }

    const syncPromise = syncPromptTagProvider(provider, cacheState.query)
      .finally(() => {
        promptProviderSyncPromises.delete(key)
      })
    promptProviderSyncPromises.set(key, syncPromise)
  }

  return true
}

export function handlePromptSuggestionsStatus(response) {
  try {
    const status = readPromptAssistantStatus()
    startPromptAssistantSyncIfNeeded(status)
    return sendJson(response, 200, statusPayload(status))
  } catch (error) {
    return sendError(
      response,
      500,
      'prompt-suggestions-status-failed',
      'Could not read prompt suggestion status.',
      error instanceof Error ? { message: error.message } : null,
    )
  }
}

export async function handlePromptSuggestionsSearch(url, response) {
  try {
    const query = url.searchParams.get('q') ?? ''
    const target = url.searchParams.get('target') ?? ''
    const limit = coercePromptSuggestionLimit(url.searchParams.get('limit') ?? undefined)
    let syncing = Boolean(promptAssistantSyncPromise)
    if (normalizePrompt(query)) {
      syncing = startPromptAssistantSyncIfNeeded(readPromptAssistantStatus()) || syncing
    }

    const providerSyncing = startPromptProviderSyncsIfNeeded(query, target)
    const localSuggestions = searchPromptAssistantSuggestions({
      query,
      target,
      limit,
    })
    const providerRecords = readCachedPromptProviderSuggestionRecords({
      query,
      target,
      limit: 20,
    })
    const suggestions = mergePromptSuggestionResults({
      localSuggestions,
      providerRecords,
      query,
      limit,
    })

    return sendJson(response, 200, {
      ok: true,
      suggestions,
      syncing,
      providerSyncing,
    })
  } catch (error) {
    return sendError(
      response,
      500,
      'prompt-suggestions-search-failed',
      'Could not search prompt suggestions.',
      error instanceof Error ? { message: error.message } : null,
    )
  }
}

export async function handlePromptSuggestionsImport(request, response) {
  try {
    const body = await readJsonBody(request)
    const documents = Array.isArray(body.documents)
      ? body.documents.map(normalizeDocument).filter(Boolean)
      : []

    if (!documents.length) {
      return sendError(
        response,
        400,
        'prompt-suggestions-empty-import',
        'No prompt suggestion documents were provided.',
      )
    }

    return sendJson(response, 200, statusPayload(importPackFromDocuments(documents)))
  } catch (error) {
    const isJsonError = error instanceof SyntaxError
    return sendError(
      response,
      isJsonError ? 400 : 500,
      isJsonError ? 'invalid-json' : 'prompt-suggestions-import-failed',
      isJsonError ? 'Request body must be valid JSON.' : 'Could not import prompt suggestions.',
      error instanceof Error ? { message: error.message } : null,
    )
  }
}

export async function handlePromptSuggestionsDownloadSaa(response) {
  try {
    return sendJson(response, 200, statusPayload(await syncSaaPromptAssistantPack()))
  } catch (error) {
    return sendError(
      response,
      502,
      'prompt-suggestions-saa-download-failed',
      'Could not download SAA prompt assistant data.',
      error instanceof Error ? { message: error.message } : null,
    )
  }
}

export function handlePromptSuggestionsClear(response) {
  try {
    clearPromptProviderCache()
    return sendJson(response, 200, statusPayload(clearPromptAssistantPack()))
  } catch (error) {
    return sendError(
      response,
      500,
      'prompt-suggestions-clear-failed',
      'Could not clear prompt suggestions.',
      error instanceof Error ? { message: error.message } : null,
    )
  }
}

export async function handlePromptSuggestionsEnrichCharacter(request, response) {
  try {
    const body = await readJsonBody(request)
    const prompt = normalizePrompt(body?.prompt)
    if (!prompt) {
      return sendError(
        response,
        400,
        'prompt-suggestions-character-prompt-required',
        'Character prompt is required.',
      )
    }

    const cached = readPromptCharacterTraits(prompt)
    if (cached) {
      return sendJson(response, 200, {
        ok: true,
        prompt,
        helperTags: cached.helperTags,
        cached: true,
        source: cached.source,
        postCount: cached.postCount,
        generatedAt: cached.generatedAt,
      })
    }

    const posts = await fetchDanbooruCharacterPosts(prompt)
    const mined = mineCharacterHelperTags(prompt, posts)
    const stored = replacePromptCharacterTraits({
      prompt,
      helperTags: mined.helperTags,
      source: 'danbooru',
      postCount: mined.postCount,
    })

    return sendJson(response, 200, {
      ok: true,
      prompt,
      helperTags: stored?.helperTags ?? [],
      cached: false,
      source: stored?.source ?? 'danbooru',
      postCount: stored?.postCount ?? mined.postCount,
      generatedAt: stored?.generatedAt ?? null,
    })
  } catch (error) {
    const isJsonError = error instanceof SyntaxError
    return sendError(
      response,
      isJsonError ? 400 : 502,
      isJsonError ? 'invalid-json' : 'prompt-suggestions-character-enrichment-failed',
      isJsonError ? 'Request body must be valid JSON.' : 'Could not enrich character helper tags.',
      error instanceof Error ? { message: error.message } : null,
    )
  }
}

export function resetPromptAssistantHandlerRuntimeState() {
  promptAssistantSyncPromise = null
  promptProviderSyncPromises.clear()
}
