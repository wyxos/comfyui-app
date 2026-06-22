import { describe, expect, it } from 'vitest'
import { useServerHarness } from './serverApiTestUtils'

const { setupHarness } = useServerHarness()

const promptSuggestionsJson = JSON.stringify([
  {
    id: 'style-red-rim-light',
    kind: 'tag',
    label: 'Red rim light',
    prompt: 'red rim light',
    aliases: ['colored edge light'],
    category: 'Lighting',
    targetSections: ['lighting'],
  },
])

async function importPromptAssistantPack(server: Awaited<ReturnType<typeof setupHarness>>) {
  return server.json('POST', '/api/prompt-suggestions/import', {
    documents: [
      { name: 'wai_characters.csv', text: 'Hatsune Miku,hatsune miku' },
      { name: 'prompt-suggestions.json', text: promptSuggestionsJson },
    ],
  })
}

function delay(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

describe('prompt assistant provider-backed suggestions', () => {
  it('caches dynamic provider tags without blocking the first search', async () => {
    const server = await setupHarness()
    server.fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      if (url.origin === 'https://danbooru.donmai.us' && url.pathname === '/tags.json') {
        return new Response(JSON.stringify([
          { id: 10, name: 'green_hair', category: 0, post_count: 500000 },
          { id: 11, name: 'greenery', category: 0, post_count: 2500 },
        ]), { status: 200 })
      }
      if (url.origin === 'https://aibooru.online' && url.pathname === '/tags.json') {
        return new Response(JSON.stringify([{ id: 20, name: 'green_highlights', category: 0, post_count: 5000 }]), {
          status: 200,
        })
      }
      if (url.origin === 'https://e621.net' && url.pathname === '/tags.json') {
        return new Response(JSON.stringify([{ id: 30, name: 'green_horn', category: 0, post_count: 4000 }]), {
          status: 200,
        })
      }
      return new Response('not found', { status: 404 })
    })

    await importPromptAssistantPack(server)

    const firstSearch = await Promise.race([
      server.request('/api/prompt-suggestions?q=green h&target=details'),
      delay(200).then(() => 'timeout' as const),
    ])
    expect(firstSearch).not.toBe('timeout')
    expect(firstSearch).toMatchObject({
      response: expect.objectContaining({ status: 200 }),
      payload: {
        ok: true,
        suggestions: [],
        providerSyncing: true,
      },
    })

    let cachedSearch = await server.request('/api/prompt-suggestions?q=green h&target=details')
    for (let attempt = 0; attempt < 20 && !cachedSearch.payload.suggestions.length; attempt += 1) {
      await delay(25)
      cachedSearch = await server.request('/api/prompt-suggestions?q=green h&target=details')
    }

    expect(cachedSearch.payload.suggestions.map((suggestion: { prompt: string }) => suggestion.prompt)).toContain(
      'green_hair',
    )
    expect(cachedSearch.payload.suggestions[0]).toMatchObject({
      kind: 'tag',
      label: 'Green Hair',
      prompt: 'green_hair',
      category: 'General',
      targetSections: expect.arrayContaining(['details']),
    })

    const wrongTarget = await server.request('/api/prompt-suggestions?q=green h&target=style')
    expect(wrongTarget.payload.suggestions).toEqual([])
  })

  it('keeps local suggestions available when provider tag searches fail', async () => {
    const server = await setupHarness()
    server.fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      if (['https://danbooru.donmai.us', 'https://aibooru.online', 'https://e621.net'].includes(url.origin)) {
        return new Response(JSON.stringify({ error: 'upstream unavailable' }), { status: 503 })
      }
      return new Response('not found', { status: 404 })
    })

    await importPromptAssistantPack(server)

    const firstSearch = await server.request('/api/prompt-suggestions?q=red&target=lighting')
    expect(firstSearch).toMatchObject({
      response: expect.objectContaining({ status: 200 }),
      payload: expect.objectContaining({
        ok: true,
        providerSyncing: true,
      }),
    })
    expect(firstSearch.payload.suggestions[0]).toMatchObject({
      prompt: 'red rim light',
    })

    for (let attempt = 0; attempt < 20; attempt += 1) {
      const nextSearch = await server.request('/api/prompt-suggestions?q=red&target=lighting')
      if (!nextSearch.payload.providerSyncing) {
        expect(nextSearch.payload.suggestions[0]).toMatchObject({
          prompt: 'red rim light',
        })
        return
      }
      await delay(25)
    }

    throw new Error('Provider failures did not settle.')
  })
})
