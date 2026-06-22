// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils'
import { computed, defineComponent, h, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import HomePromptTab from '../../src/views/home/HomePromptTab.vue'
import { PROMPT_SECTION_DEFINITIONS } from '../../src/views/home/homeConstants'
import { createHomePromptTagActions } from '../../src/views/home/homePromptTagActions'
import { createHomeState } from '../../src/views/home/homeState'
import { provideHomeView } from '../../src/views/home/homeViewContext'
import type { PromptSuggestion } from '../../src/views/home/prompt-assistant/promptSuggestionTypes'

const characterSuggestion: PromptSuggestion = {
  id: 'character-hatsune-miku',
  kind: 'character',
  label: 'Hatsune Miku',
  prompt: 'hatsune miku',
  aliases: ['miku'],
  category: 'Character',
  targetSections: ['subject'],
}

const characterSuggestionWithHelpers: PromptSuggestion = {
  ...characterSuggestion,
  helperTags: ['twintails', 'turquoise hair'],
}

const styleSuggestion: PromptSuggestion = {
  id: 'style-pixel-art',
  kind: 'tag',
  label: 'Pixel art',
  prompt: 'pixel art',
  aliases: ['pixelated'],
  category: 'Style',
  targetSections: ['style'],
}

function jsonResponse(payload: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  }))
}

function createDeferred() {
  let resolve!: () => void
  const promise = new Promise<void>((next) => {
    resolve = next
  })

  return { promise, resolve }
}

function createPromptAssistantFetchMock() {
  let loaded = true
  let sourceNames = [
    'SAA v160 character list',
    'SAA character helper tags',
    'SAA Danbooru/E621 tag complete',
    'SAA view tags',
  ]
  let suggestions: PromptSuggestion[] = [characterSuggestion, styleSuggestion]
  let nextSearchDelay: Promise<void> | null = null
  const queuedSearchResponses: Array<{
    suggestions: PromptSuggestion[]
    providerSyncing?: boolean
  }> = []
  const enrichmentByPrompt = new Map<string, string[]>()
  const calls: Array<{ path: string; method: string; body: unknown; search: URLSearchParams }> = []
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://companion.test')
    const method = init?.method?.toUpperCase() ?? 'GET'
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : null
    calls.push({ path: url.pathname, method, body, search: new URLSearchParams(url.searchParams) })

    if (url.pathname === '/api/prompt-suggestions/status' && method === 'GET') {
      return jsonResponse({
        ok: true,
        loaded,
        count: suggestions.length,
        sourceNames: loaded ? sourceNames : [],
        importedAt: loaded ? '2026-06-21T00:00:00.000Z' : null,
      })
    }

    if (url.pathname === '/api/prompt-suggestions' && method === 'GET') {
      if (nextSearchDelay) {
        const delay = nextSearchDelay
        nextSearchDelay = null
        await delay
      }

      const queuedSearchResponse = queuedSearchResponses.shift()
      if (queuedSearchResponse) {
        return jsonResponse({ ok: true, ...queuedSearchResponse })
      }

      const query = (url.searchParams.get('q') ?? '').toLowerCase()
      const target = url.searchParams.get('target')
      const matches = loaded
        ? suggestions.filter((suggestion) =>
            suggestion.targetSections.includes(target as never) &&
            [suggestion.label, suggestion.prompt, ...suggestion.aliases, suggestion.category]
              .some((value) => value.toLowerCase().includes(query)),
          )
        : []
      return jsonResponse({ ok: true, suggestions: matches })
    }

    if (url.pathname === '/api/prompt-suggestions/enrich-character' && method === 'POST') {
      const prompt = String((body as { prompt?: unknown } | null)?.prompt ?? '')
      return jsonResponse({
        ok: true,
        prompt,
        helperTags: enrichmentByPrompt.get(prompt) ?? [],
        cached: false,
        source: 'danbooru',
        postCount: 3,
      })
    }

    return jsonResponse({ ok: false, message: `Unhandled ${method} ${url.pathname}` }, 500)
  })

  return {
    calls,
    fetchMock,
    setLoaded(nextSuggestions: PromptSuggestion[], nextSourceNames = sourceNames) {
      loaded = true
      suggestions = nextSuggestions
      sourceNames = nextSourceNames
    },
    setUnloaded() {
      loaded = false
      suggestions = []
      sourceNames = []
    },
    delayNextSearch(delay: Promise<void>) {
      nextSearchDelay = delay
    },
    queueSearchResponse(response: { suggestions: PromptSuggestion[]; providerSyncing?: boolean }) {
      queuedSearchResponses.push(response)
    },
    setEnrichment(prompt: string, helperTags: string[]) {
      enrichmentByPrompt.set(prompt, helperTags)
    },
  }
}

function mountPromptTab() {
  const state = createHomeState()
  const promptActions = createHomePromptTagActions(state)
  const context = {
    ...state,
    formTab: ref('prompt'),
    promptSectionDefinitions: PROMPT_SECTION_DEFINITIONS,
    compiledPrompt: computed(() =>
      promptActions.buildPromptFromSections(state.promptSections.value, state.promptSectionDrafts.value),
    ),
    compiledNegativePrompt: computed(() => promptActions.buildNegativePromptFromTags(true)),
    setPromptMode: vi.fn(),
    handlePromptWeightKeydown: vi.fn(),
    ...promptActions,
  }
  const Wrapper = defineComponent({
    setup() {
      provideHomeView(context as never)

      return () => h(HomePromptTab)
    },
  })

  return mount(Wrapper)
}

describe('home prompt assistant', () => {
  let api: ReturnType<typeof createPromptAssistantFetchMock>

  beforeEach(() => {
    api = createPromptAssistantFetchMock()
    vi.stubGlobal('fetch', api.fetchMock)
  })

  it('does not render manual prompt suggestion import or download controls', async () => {
    const wrapper = mountPromptTab()

    await flushPromises()

    expect(wrapper.find('input[aria-label="Import prompt suggestion files"]').exists()).toBe(false)
    expect(wrapper.find('button[aria-label="Download SAA prompt assistant data"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Import')
  })

  it('shows loading feedback while a prompt suggestion query is pending', async () => {
    api.setLoaded([characterSuggestion])
    const pendingSearch = createDeferred()
    api.delayNextSearch(pendingSearch.promise)
    const wrapper = mountPromptTab()
    const subjectInput = wrapper.get('input[aria-label="Subject"]')

    await flushPromises()
    await subjectInput.setValue('mik')
    await flushPromises()

    expect(wrapper.find('[aria-label="Searching prompt suggestions"]').exists()).toBe(true)
    expect(wrapper.find('[role="option"]').exists()).toBe(false)

    pendingSearch.resolve()
    await flushPromises()

    expect(wrapper.find('[aria-label="Searching prompt suggestions"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('Hatsune Miku')
  })

  it('keeps loading and retries while provider suggestions are still syncing', async () => {
    vi.useFakeTimers()
    try {
      api.queueSearchResponse({ suggestions: [], providerSyncing: true })
      api.queueSearchResponse({ suggestions: [characterSuggestion], providerSyncing: false })
      const wrapper = mountPromptTab()
      const subjectInput = wrapper.get('input[aria-label="Subject"]')

      await flushPromises()
      await subjectInput.setValue('mik')
      await flushPromises()

      expect(wrapper.find('[aria-label="Searching prompt suggestions"]').exists()).toBe(true)
      expect(wrapper.find('[role="option"]').exists()).toBe(false)

      await vi.advanceTimersByTimeAsync(400)
      await flushPromises()

      expect(wrapper.find('[aria-label="Searching prompt suggestions"]').exists()).toBe(false)
      expect(wrapper.text()).toContain('Hatsune Miku')
      expect(api.calls.filter((call) => call.path === '/api/prompt-suggestions')).toHaveLength(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('applies a character suggestion and enriches missing helper tags on demand', async () => {
    api.setLoaded([characterSuggestion])
    api.setEnrichment('hatsune miku', ['twintails', 'turquoise hair'])
    const wrapper = mountPromptTab()
    const subjectInput = wrapper.get('input[aria-label="Subject"]')

    await flushPromises()
    await subjectInput.setValue('mik')
    await flushPromises()

    expect(wrapper.text()).toContain('Hatsune Miku')

    await wrapper.get('button[aria-label="Add Hatsune Miku suggestion"]').trigger('mousedown')
    await flushPromises()

    expect(wrapper.text()).toContain('hatsune miku')
    expect(wrapper.text()).toContain('twintails')
    expect(wrapper.text()).toContain('turquoise hair')
    expect((subjectInput.element as HTMLInputElement).value).toBe('')
    expect(api.calls).toContainEqual(expect.objectContaining({
      path: '/api/prompt-suggestions/enrich-character',
      method: 'POST',
      body: { prompt: 'hatsune miku' },
    }))
  })

  it('does not enrich characters that already include helper tags', async () => {
    api.setLoaded([characterSuggestionWithHelpers])
    const wrapper = mountPromptTab()
    const subjectInput = wrapper.get('input[aria-label="Subject"]')

    await flushPromises()
    await subjectInput.setValue('mik')
    await flushPromises()
    await wrapper.get('button[aria-label="Add Hatsune Miku suggestion"]').trigger('mousedown')
    await flushPromises()

    expect(wrapper.text()).toContain('twintails')
    expect(wrapper.text()).toContain('turquoise hair')
    expect(api.calls.some((call) => call.path === '/api/prompt-suggestions/enrich-character')).toBe(false)
  })

  it('renders suggestions as an opaque elevated dropdown surface', async () => {
    api.setLoaded([characterSuggestion])
    const wrapper = mountPromptTab()
    const subjectInput = wrapper.get('input[aria-label="Subject"]')

    await flushPromises()
    await subjectInput.setValue('mik')
    await flushPromises()

    const popover = wrapper.get('[role="listbox"]')

    expect(popover.classes()).toContain('z-[75]')
    expect(popover.classes()).toContain('bg-card')
    expect(popover.classes()).toContain('text-card-foreground')
    expect(popover.classes()).toContain('shadow-[0_18px_50px_rgba(0,0,0,0.35)]')
    expect(popover.classes()).not.toContain('bg-popover')
  })

  it('applies inline suggestions with keyboard selection', async () => {
    api.setLoaded([styleSuggestion])
    const wrapper = mountPromptTab()
    const styleInput = wrapper.get('input[aria-label="Style"]')

    await flushPromises()
    await styleInput.setValue('pixel')
    await flushPromises()
    await styleInput.trigger('keydown', { key: 'ArrowDown' })
    await styleInput.trigger('keydown', { key: 'Enter' })

    expect(wrapper.text()).toContain('pixel art')
    expect(wrapper.text()).not.toContain('pixelated')
  })

  it('uses the server-side prompt suggestion index on mount', async () => {
    api.setLoaded([characterSuggestion])
    const wrapper = mountPromptTab()
    const subjectInput = wrapper.get('input[aria-label="Subject"]')

    await flushPromises()
    await subjectInput.setValue('mik')
    await flushPromises()

    expect(wrapper.text()).toContain('Hatsune Miku')
    expect(api.calls).toContainEqual(expect.objectContaining({
      path: '/api/prompt-suggestions',
      method: 'GET',
    }))
  })
})
