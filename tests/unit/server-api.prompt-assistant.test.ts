import { describe, expect, it } from 'vitest'
import { useServerHarness } from './serverApiTestUtils'

const { setupHarness } = useServerHarness()

const characterCsv = [
  'Hatsune Miku,hatsune miku',
  'Red Miku,red miku',
].join('\n')

const helperJson = JSON.stringify({
  'hatsune miku': 'twintails, turquoise hair',
})

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
  {
    id: 'style-infrared-glow',
    kind: 'tag',
    label: 'Infrared glow',
    prompt: 'infrared glow',
    aliases: ['night light'],
    category: 'Lighting',
    targetSections: ['lighting'],
  },
  {
    id: 'negative-bad-hands',
    kind: 'tag',
    label: 'Bad hands',
    prompt: 'bad hands',
    aliases: ['hands'],
    category: 'Negative',
    targetSections: ['negative'],
  },
])

async function importPromptAssistantPack(server: Awaited<ReturnType<typeof setupHarness>>) {
  return server.json('POST', '/api/prompt-suggestions/import', {
    documents: [
      { name: 'wai_characters.csv', text: characterCsv },
      { name: 'wai_tag_assist.json', text: helperJson },
      { name: 'prompt-suggestions.json', text: promptSuggestionsJson },
      { name: 'danbooru_e621_merged_zh_cn.csv', text: 'blue_eyes,0,Blue eyes\nhighres,5,High resolution\n' },
    ],
  })
}

function createDeferredResponse() {
  let resolve!: (response: Response) => void
  const promise = new Promise<Response>((next) => {
    resolve = next
  })

  return { promise, resolve }
}

function delay(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

describe('prompt assistant server API', () => {
  it('starts with no loaded suggestion pack', async () => {
    const server = await setupHarness()

    await expect(server.request('/api/prompt-suggestions/status')).resolves.toMatchObject({
      response: expect.objectContaining({ status: 200 }),
      payload: {
        ok: true,
        loaded: false,
        count: 0,
        sourceNames: [],
        importedAt: null,
      },
    })
  })

  it('starts SAA source sync without blocking the first search request', async () => {
    const server = await setupHarness()
    const delayedCharacters = createDeferredResponse()
    server.fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('wai_characters_v160.csv')) {
        return delayedCharacters.promise
      }
      if (url.includes('wai_tag_assist.json')) {
        return new Response(JSON.stringify({}), { status: 200 })
      }
      if (url.includes('danbooru_e621_merged_zh_cn.csv')) {
        return new Response('blue_eyes,0,Blue eyes\n', { status: 200 })
      }
      if (url.includes('view_tags.json')) {
        return new Response(JSON.stringify({ style: ['pixel art, pixelated'] }), { status: 200 })
      }
      return new Response('not found', { status: 404 })
    })

    const firstSearch = await Promise.race([
      server.request('/api/prompt-suggestions?q=mik&target=subject'),
      delay(200).then(() => 'timeout' as const),
    ])
    delayedCharacters.resolve(new Response('Hatsune Miku,hatsune miku\n', { status: 200 }))

    expect(firstSearch).not.toBe('timeout')
    expect(firstSearch).toMatchObject({
      response: expect.objectContaining({ status: 200 }),
      payload: {
        ok: true,
        suggestions: [],
        syncing: true,
      },
    })

    for (let attempt = 0; attempt < 20; attempt += 1) {
      const status = await server.request('/api/prompt-suggestions/status')
      if (status.payload.loaded) {
        break
      }
      await delay(50)
    }

    const syncedSearch = await server.request('/api/prompt-suggestions?q=mik&target=subject')
    expect(syncedSearch.payload.suggestions[0]).toMatchObject({
      kind: 'character',
      label: 'Hatsune Miku',
      prompt: 'hatsune miku',
    })
    await expect(server.request('/api/prompt-suggestions/status')).resolves.toMatchObject({
      payload: expect.objectContaining({
        loaded: true,
        count: 3,
        sourceNames: [
          'SAA v160 character list',
          'SAA character helper tags',
          'SAA Danbooru/E621 tag complete',
          'SAA view tags',
        ],
      }),
    })
  })

  it('imports suggestions into SQLite and searches by target, alias, and prefix rank', async () => {
    const server = await setupHarness()

    await expect(importPromptAssistantPack(server)).resolves.toMatchObject({
      response: expect.objectContaining({ status: 200 }),
      payload: expect.objectContaining({
        ok: true,
        count: 7,
        sourceNames: [
          'wai_characters.csv',
          'wai_tag_assist.json',
          'prompt-suggestions.json',
          'danbooru_e621_merged_zh_cn.csv',
        ],
      }),
    })

    await expect(server.request('/api/prompt-suggestions/status')).resolves.toMatchObject({
      payload: expect.objectContaining({
        loaded: true,
        count: 7,
        sourceNames: expect.arrayContaining(['wai_characters.csv', 'prompt-suggestions.json']),
      }),
    })

    const character = await server.request('/api/prompt-suggestions?q=mik&target=subject')
    expect(character.payload.suggestions[0]).toMatchObject({
      id: 'character-hatsune-miku',
      kind: 'character',
      label: 'Hatsune Miku',
      prompt: 'hatsune miku',
      helperTags: ['twintails', 'turquoise hair'],
      targetSections: ['subject'],
    })

    const detailTag = await server.request('/api/prompt-suggestions?q=blue eyes&target=details')
    expect(detailTag.payload.suggestions[0]).toMatchObject({
      prompt: 'blue_eyes',
      category: 'General',
    })

    const filteredNegative = await server.request('/api/prompt-suggestions?q=hands&target=subject')
    expect(filteredNegative.payload.suggestions).toEqual([])

    const negative = await server.request('/api/prompt-suggestions?q=hands&target=negative')
    expect(negative.payload.suggestions[0]).toMatchObject({
      prompt: 'bad hands',
      category: 'Negative',
    })

    const ranked = await server.request('/api/prompt-suggestions?q=red&target=lighting')
    expect(ranked.payload.suggestions.map((suggestion: { id: string }) => suggestion.id)).toEqual([
      'style-red-rim-light',
      'style-infrared-glow',
    ])
  })

  it('merges underscore and space character rows before indexing helper tags', async () => {
    const server = await setupHarness()

    await expect(server.json('POST', '/api/prompt-suggestions/import', {
      documents: [
        {
          name: 'wai_characters.csv',
          text: '红月华莲（反逆的鲁路修）,kouzuki kallen',
        },
        {
          name: 'wai_tag_assist.json',
          text: JSON.stringify({ kouzuki_kallen: 'red hair, code geass' }),
        },
        {
          name: 'danbooru_e621_merged_zh_cn.csv',
          text: 'kouzuki_kallen,4,皇月卡莲',
        },
      ],
    })).resolves.toMatchObject({
      response: expect.objectContaining({ status: 200 }),
      payload: expect.objectContaining({
        ok: true,
        count: 1,
      }),
    })

    const result = await server.request('/api/prompt-suggestions?q=kallen&target=subject')
    expect(result.payload.suggestions).toHaveLength(1)
    expect(result.payload.suggestions[0]).toMatchObject({
      kind: 'character',
      label: '红月华莲（反逆的鲁路修）',
      prompt: 'kouzuki kallen',
      helperTags: ['red hair', 'code geass'],
      aliases: expect.arrayContaining(['kouzuki kallen', '皇月卡莲']),
    })
  })

  it('downloads the SAA source documents server-side before importing', async () => {
    const server = await setupHarness()
    server.fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('wai_characters_v160.csv')) {
        return new Response('Hatsune Miku,hatsune miku\n', { status: 200 })
      }
      if (url.includes('wai_tag_assist.json')) {
        return new Response(helperJson, { status: 200 })
      }
      if (url.includes('danbooru_e621_merged_zh_cn.csv')) {
        return new Response('blue_eyes,0,Blue eyes\n', { status: 200 })
      }
      if (url.includes('view_tags.json')) {
        return new Response(JSON.stringify({ style: ['pixel art, pixelated'] }), { status: 200 })
      }
      return new Response('not found', { status: 404 })
    })

    await expect(server.json('POST', '/api/prompt-suggestions/download-saa')).resolves.toMatchObject({
      response: expect.objectContaining({ status: 200 }),
      payload: expect.objectContaining({
        ok: true,
        count: 3,
        sourceNames: [
          'SAA v160 character list',
          'SAA character helper tags',
          'SAA Danbooru/E621 tag complete',
          'SAA view tags',
        ],
      }),
    })

    const subject = await server.request('/api/prompt-suggestions?q=mik&target=subject')
    expect(subject.payload.suggestions[0]?.prompt).toBe('hatsune miku')
  })

  it('mines and caches character helper tags on demand', async () => {
    const server = await setupHarness()
    server.fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (!url.startsWith('https://danbooru.donmai.us/posts.json')) {
        return new Response('not found', { status: 404 })
      }

      return new Response(JSON.stringify([
        {
          tag_string_character: 'hatsune_miku',
          tag_string_general: '1girl solo twintails aqua_hair detached_sleeves necktie looking_at_viewer',
        },
        {
          tag_string_character: 'hatsune_miku',
          tag_string_general: '1girl solo twintails aqua_hair detached_sleeves blue_eyes smile',
        },
        {
          tag_string_character: 'hatsune_miku',
          tag_string_general: '1girl twintails aqua_hair very_long_hair detached_sleeves',
        },
      ]), {
        status: 200,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      })
    })

    const first = await server.json('POST', '/api/prompt-suggestions/enrich-character', {
      prompt: 'hatsune miku',
    })
    const second = await server.json('POST', '/api/prompt-suggestions/enrich-character', {
      prompt: 'hatsune miku',
    })

    expect(first.response.status).toBe(200)
    expect(first.payload).toMatchObject({
      ok: true,
      prompt: 'hatsune miku',
      cached: false,
      source: 'danbooru',
      postCount: 3,
    })
    expect(first.payload.helperTags).toEqual(expect.arrayContaining([
      'twintails',
      'aqua hair',
      'detached sleeves',
    ]))
    expect(first.payload.helperTags).not.toEqual(expect.arrayContaining([
      '1girl',
      'solo',
      'looking at viewer',
    ]))
    expect(second.payload).toMatchObject({
      ok: true,
      cached: true,
      helperTags: first.payload.helperTags,
    })
    expect(server.fetchMock.mock.calls.filter(([input]) =>
      String(input).startsWith('https://danbooru.donmai.us/posts.json'),
    )).toHaveLength(1)
  })

  it('clears the imported suggestion index', async () => {
    const server = await setupHarness()

    await importPromptAssistantPack(server)
    await expect(server.request('/api/prompt-suggestions', { method: 'DELETE' })).resolves.toMatchObject({
      response: expect.objectContaining({ status: 200 }),
      payload: {
        ok: true,
        loaded: false,
        count: 0,
        sourceNames: [],
        importedAt: null,
      },
    })
  })

  it('keeps imported IDs unique when duplicate suffixes collide', async () => {
    const server = await setupHarness()

    await expect(server.json('POST', '/api/prompt-suggestions/import', {
      documents: [
        {
          name: 'colliding-ids.json',
          text: JSON.stringify([
            {
              id: 'tag-collision',
              kind: 'tag',
              label: 'Collision',
              prompt: 'collision',
              targetSections: ['others'],
            },
            {
              id: 'tag-collision',
              kind: 'tag',
              label: 'Collision duplicate',
              prompt: 'collision duplicate',
              targetSections: ['others'],
            },
            {
              id: 'tag-collision-2',
              kind: 'tag',
              label: 'Collision numbered',
              prompt: 'collision numbered',
              targetSections: ['others'],
            },
          ]),
        },
      ],
    })).resolves.toMatchObject({
      response: expect.objectContaining({ status: 200 }),
      payload: expect.objectContaining({
        ok: true,
        count: 3,
      }),
    })

    const results = await server.request('/api/prompt-suggestions?q=collision&target=others')
    expect(results.payload.suggestions.map((suggestion: { id: string }) => suggestion.id)).toEqual([
      'tag-collision',
      'tag-collision-2',
      'tag-collision-2-2',
    ])
  })
})
