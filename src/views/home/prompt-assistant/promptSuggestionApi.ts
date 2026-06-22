import type {
  PromptSuggestion,
  PromptSuggestionTarget,
} from './promptSuggestionTypes'

type PromptSuggestionSearchResponse = {
  ok: true
  suggestions: PromptSuggestion[]
}

type PromptCharacterEnrichmentResponse = {
  ok: true
  prompt: string
  helperTags: string[]
  cached: boolean
  source: string
  postCount: number
  generatedAt?: string | null
}

async function readPromptSuggestionJson<T>(response: Response, fallbackMessage: string): Promise<T> {
  const payload = await response.json().catch(() => null) as { ok?: boolean; message?: string } | null
  if (!response.ok || !payload || payload.ok === false) {
    throw new Error(payload?.message || fallbackMessage)
  }

  return payload as T
}

export async function searchPromptSuggestions(
  query: string,
  target: PromptSuggestionTarget,
  signal?: AbortSignal,
) {
  const searchParams = new URLSearchParams({
    q: query,
    target,
    limit: '8',
  })
  const response = await fetch(`/api/prompt-suggestions?${searchParams.toString()}`, { signal })
  const payload = await readPromptSuggestionJson<PromptSuggestionSearchResponse>(
    response,
    'Could not search prompt suggestions.',
  )

  return payload.suggestions
}

export async function enrichCharacterSuggestion(prompt: string) {
  const response = await fetch('/api/prompt-suggestions/enrich-character', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({ prompt }),
  })
  return readPromptSuggestionJson<PromptCharacterEnrichmentResponse>(
    response,
    'Could not enrich character helper tags.',
  )
}
