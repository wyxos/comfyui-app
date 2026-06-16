// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { emblaApi } = vi.hoisted(() => ({
  emblaApi: {
    canScrollPrev: vi.fn(() => false),
    canScrollNext: vi.fn(() => true),
    selectedScrollSnap: vi.fn(() => 0),
    scrollPrev: vi.fn(),
    scrollNext: vi.fn(),
    scrollTo: vi.fn(),
    reInit: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  },
}))

vi.mock('embla-carousel-vue', async () => {
  const { ref } = await import('vue')
  return {
    default: () => [ref(null), ref(emblaApi)],
  }
})

function atlasSettingsResponse() {
  return new Response(JSON.stringify({
    ok: true,
    includeNsfw: false,
    blurNsfwContent: true,
    atlasConfigured: true,
    atlasUrl: 'https://atlas.test',
    atlasKeyConfigured: true,
    atlasKeyPreview: 'Saved, ending in 1234',
  }), { status: 200, headers: { 'Content-Type': 'application/json' } })
}

function createModel(feedImages: unknown[] = []) {
  return {
    id: 101,
    name: 'Atlas reactions model',
    type: 'Checkpoint',
    modelVersions: [
      {
        id: 201,
        name: 'Latest version',
        baseModel: 'Illustrious',
        images: [
          {
            id: 800,
            url: 'https://example.test/version-original.jpg',
            type: 'image',
            nsfw: false,
            width: 768,
            height: 1024,
          },
        ],
      },
    ],
    feedImages,
  }
}

async function mountModal(fetchMock: ReturnType<typeof vi.fn>, feedImages: unknown[] = []) {
  vi.stubGlobal('fetch', fetchMock)

  const { default: AssetPreviewModal } = await import('../../src/components/asset-preview/AssetPreviewModal.vue')
  const wrapper = mount(AssetPreviewModal, {
    attachTo: document.body,
    global: {
      stubs: {
        RouterLink: { template: '<a><slot /></a>' },
      },
    },
    props: {
      open: true,
      model: createModel(feedImages),
    },
  })

  await flushPromises()

  return wrapper
}

function requestBody(call: unknown[] | undefined) {
  return JSON.parse(String((call?.[1] as RequestInit | undefined)?.body))
}

describe('AssetPreviewModal Atlas reactions', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders an Atlas reaction widget under the original media and sends selected reactions', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://127.0.0.1')
      if (url.pathname === '/api/settings/app') {
        return atlasSettingsResponse()
      }

      if (url.pathname === '/api/atlas/civitai/status') {
        return new Response(JSON.stringify({
          ok: true,
          configured: true,
          items: [{ request_id: 'civitai:800', exists: true, file_id: 88, filtered: false }],
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }

      if (url.pathname === '/api/atlas/civitai/reactions') {
        return new Response(JSON.stringify({
          configured: true,
          file: { id: 88, source: 'CivitAI', source_id: '800' },
          reaction: { type: 'like' },
          download: { requested: true },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }

      return new Response(JSON.stringify({ items: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    })

    const wrapper = await mountModal(fetchMock)

    const widget = wrapper.get('[data-test="asset-preview-main-atlas-reactions"]')
    const labels = widget.findAll('[data-test="asset-preview-atlas-reaction-button"]')
      .map((button) => button.attributes('aria-label'))
    expect(labels).toEqual([
      'Favorite in Atlas',
      'Like in Atlas',
      'Blacklist in Atlas',
      'Funny in Atlas',
    ])

    await widget.get('button[aria-label="Like in Atlas"]').trigger('click')
    await flushPromises()

    const reactionCall = fetchMock.mock.calls.find((call) => String(call[0]) === '/api/atlas/civitai/reactions')
    expect(requestBody(reactionCall)).toMatchObject({
      type: 'like',
      download_behavior: 'queue',
      item: expect.objectContaining({ id: 800, modelId: 101, modelVersionId: 201 }),
    })
    expect(wrapper.get('button[aria-label="Like in Atlas"]').attributes('aria-pressed')).toBe('true')
  })

  it('renders an Atlas reaction widget under every feed preview and sends the clicked type', async () => {
    const feedImages = [
      { id: 900, url: 'https://example.test/feed-1.jpg', type: 'image', nsfw: false },
      { id: 901, url: 'https://example.test/feed-2.jpg', type: 'image', nsfw: false },
    ]
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://127.0.0.1')
      if (url.pathname === '/api/settings/app') {
        return atlasSettingsResponse()
      }

      if (url.pathname === '/api/atlas/civitai/status') {
        return new Response(JSON.stringify({
          ok: true,
          configured: true,
          items: [
            { request_id: 'civitai:800', exists: true, file_id: 88, filtered: false },
            { request_id: 'civitai:900', exists: false, filtered: false },
            { request_id: 'civitai:901', exists: false, filtered: false },
          ],
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }

      if (url.pathname === '/api/atlas/civitai/reactions') {
        return new Response(JSON.stringify({
          configured: true,
          file: { id: 91, source: 'CivitAI', source_id: '901' },
          reaction: { type: 'funny' },
          download: { requested: true },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }

      return new Response(JSON.stringify({ items: feedImages }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    })

    const wrapper = await mountModal(fetchMock, feedImages)
    await wrapper.get('button[aria-label="Show feed"]').trigger('click')
    await flushPromises()

    const widgets = wrapper.findAll('[data-test="asset-preview-feed-atlas-reactions"]')
    expect(widgets).toHaveLength(2)
    expect(widgets[0]?.findAll('[data-test="asset-preview-atlas-reaction-button"]')).toHaveLength(4)

    await widgets[1]?.get('button[aria-label="Funny in Atlas"]').trigger('click')
    await flushPromises()

    const reactionCall = fetchMock.mock.calls.find((call) => String(call[0]) === '/api/atlas/civitai/reactions')
    expect(requestBody(reactionCall)).toMatchObject({
      type: 'funny',
      download_behavior: 'queue',
      item: expect.objectContaining({ id: 901, modelId: 101, modelVersionId: 201 }),
    })
  })

  it('mirrors Atlas mouse shortcuts on original and feed media', async () => {
    const feedImages = [
      { id: 900, url: 'https://example.test/feed-1.jpg', type: 'image', nsfw: false },
    ]
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://127.0.0.1')
      if (url.pathname === '/api/settings/app') {
        return atlasSettingsResponse()
      }

      if (url.pathname === '/api/atlas/civitai/status') {
        return new Response(JSON.stringify({
          ok: true,
          configured: true,
          items: [
            { request_id: 'civitai:800', exists: true, file_id: 88, filtered: false },
            { request_id: 'civitai:900', exists: false, filtered: false },
          ],
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }

      if (url.pathname === '/api/atlas/civitai/reactions') {
        return new Response(JSON.stringify({
          configured: true,
          file: { id: 88, source: 'CivitAI' },
          reaction: { type: 'love' },
          download: { requested: true },
          blacklisted_at: '2026-06-16T00:00:00Z',
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }

      return new Response(JSON.stringify({ items: feedImages }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    })

    const wrapper = await mountModal(fetchMock, feedImages)

    await wrapper.get('[data-test="asset-preview-main-media-shortcut-target"]').trigger('click', {
      altKey: true,
      button: 0,
    })
    await wrapper.get('[data-test="asset-preview-main-media-shortcut-target"]').trigger('mousedown', {
      altKey: true,
      button: 1,
    })
    await flushPromises()

    await wrapper.get('button[aria-label="Show feed"]').trigger('click')
    await flushPromises()

    await wrapper.get('[data-test="asset-preview-feed-shortcut-target"]').trigger('contextmenu', {
      altKey: true,
      button: 2,
    })
    await flushPromises()

    const reactionBodies = fetchMock.mock.calls
      .filter((call) => String(call[0]) === '/api/atlas/civitai/reactions')
      .map((call) => requestBody(call))
    expect(reactionBodies.map((body) => body.type)).toEqual(['love', 'like', 'blacklist'])
    expect(reactionBodies.at(-1)).toMatchObject({
      item: expect.objectContaining({ id: 900 }),
    })
  })
})
