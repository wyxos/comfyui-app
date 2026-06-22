import { jsonResponse, type MockApiOptions, type MockPromptSuggestion } from './mockApiData'

type PromptSuggestionState = {
  suggestions: MockPromptSuggestion[]
  sourceNames: string[]
  autoSyncSuggestions: boolean
}

export function createMockPromptSuggestionState(options: MockApiOptions): PromptSuggestionState {
  const hasExplicitSuggestions = Object.prototype.hasOwnProperty.call(options, 'promptSuggestions')
  return {
    suggestions: [...(options.promptSuggestions ?? [])],
    sourceNames: [...(options.promptSuggestionSourceNames ?? ['mock-prompt-suggestions.json'])],
    autoSyncSuggestions: !hasExplicitSuggestions,
  }
}

function defaultSaaSuggestions(): MockPromptSuggestion[] {
  return [
    {
      id: 'character-hatsune-miku',
      kind: 'character',
      label: 'Hatsune Miku',
      prompt: 'hatsune miku',
      aliases: ['miku'],
      category: 'Character',
      targetSections: ['subject'],
    },
    {
      id: 'tag-blue-eyes',
      kind: 'tag',
      label: 'blue_eyes',
      prompt: 'blue_eyes',
      aliases: ['blue eyes'],
      category: 'General',
      targetSections: ['details'],
    },
  ]
}

function defaultSaaSourceNames() {
  return [
    'SAA v160 character list',
    'SAA character helper tags',
    'SAA Danbooru/E621 tag complete',
    'SAA view tags',
  ]
}

function matchesQuery(suggestion: MockPromptSuggestion, query: string) {
  return [suggestion.label, suggestion.prompt, ...suggestion.aliases, suggestion.category]
    .some((value) => value.toLowerCase().includes(query))
}

function syncDefaultSaaSuggestions(state: PromptSuggestionState) {
  if (state.suggestions.length || !state.autoSyncSuggestions) {
    return
  }

  state.sourceNames = defaultSaaSourceNames()
  state.suggestions = defaultSaaSuggestions()
}

export function handleMockPromptSuggestions(
  state: PromptSuggestionState,
  pathname: string,
  method: string,
  searchParams: URLSearchParams,
  body: unknown,
) {
  if (pathname === '/api/prompt-suggestions/status' && method === 'GET') {
    return jsonResponse({
      ok: true,
      loaded: state.suggestions.length > 0,
      count: state.suggestions.length,
      sourceNames: state.suggestions.length ? state.sourceNames : [],
      importedAt: state.suggestions.length ? '2026-06-21T00:00:00.000Z' : null,
    })
  }

  if (pathname === '/api/prompt-suggestions' && method === 'GET') {
    syncDefaultSaaSuggestions(state)
    const query = (searchParams.get('q') ?? '').toLowerCase()
    const target = searchParams.get('target') ?? ''
    const suggestions = state.suggestions.filter((suggestion) =>
      suggestion.targetSections.includes(target) && matchesQuery(suggestion, query),
    )
    return jsonResponse({ ok: true, suggestions })
  }

  if (pathname === '/api/prompt-suggestions/enrich-character' && method === 'POST') {
    const prompt = String((body as { prompt?: unknown } | null)?.prompt ?? '').trim()
    return jsonResponse({
      ok: true,
      prompt,
      helperTags: prompt.toLowerCase() === 'hatsune miku' ? ['twintails', 'turquoise hair'] : [],
      cached: false,
      source: 'danbooru',
      postCount: 3,
    })
  }

  if (pathname === '/api/prompt-suggestions/import' && method === 'POST') {
    const documents = Array.isArray((body as { documents?: unknown[] } | null)?.documents)
      ? (body as { documents: Array<{ name?: string }> }).documents
      : []
    state.sourceNames = documents.map((document) => document.name ?? 'Imported prompt suggestions')
    state.suggestions = defaultSaaSuggestions()
    return jsonResponse({
      ok: true,
      loaded: true,
      count: state.suggestions.length,
      sourceNames: state.sourceNames,
      importedAt: '2026-06-21T00:00:00.000Z',
    })
  }

  if (pathname === '/api/prompt-suggestions/download-saa' && method === 'POST') {
    state.sourceNames = defaultSaaSourceNames()
    state.suggestions = defaultSaaSuggestions()
    return jsonResponse({
      ok: true,
      loaded: true,
      count: state.suggestions.length,
      sourceNames: state.sourceNames,
      importedAt: '2026-06-21T00:00:00.000Z',
    })
  }

  if (pathname === '/api/prompt-suggestions' && method === 'DELETE') {
    state.sourceNames = []
    state.suggestions = []
    return jsonResponse({ ok: true, loaded: false, count: 0, sourceNames: [], importedAt: null })
  }

  return null
}
