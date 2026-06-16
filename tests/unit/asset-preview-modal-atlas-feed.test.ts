// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'

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

describe('AssetPreviewModal Atlas feed', () => {
  it('uses Atlas feed to hide filtered media and react without direct Civitai fetches', async () => {
    const feedItems = [
      {
        id: 900,
        url: 'https://example.test/feed-downloaded.jpg',
        type: 'image',
        nsfw: false,
        width: 768,
        height: 1024,
        atlasStatus: {
          request_id: 'civitai:900',
          exists: true,
          downloaded: true,
          filtered: false,
        },
      },
      {
        id: 902,
        url: 'https://example.test/feed-candidate.jpg',
        type: 'image',
        nsfw: false,
        width: 768,
        height: 1024,
        atlasStatus: {
          request_id: 'civitai:902',
          exists: false,
          downloaded: false,
          filtered: false,
        },
      },
    ]
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://127.0.0.1')
      if (url.pathname === '/api/settings/app') {
        return jsonResponse({
          ok: true,
          includeNsfw: false,
          blurNsfwModels: true,
          blurNsfwMediaLevel: 4,
          atlasConfigured: true,
          atlasUrl: 'https://atlas.test',
          atlasKeyConfigured: true,
          atlasKeyPreview: 'Saved, ending in 1234',
        })
      }

      if (url.pathname === '/api/atlas/civitai/feed') {
        return jsonResponse({
          ok: true,
          configured: true,
          items: feedItems,
          metadata: { nextCursor: null },
        })
      }

      if (url.pathname === '/api/atlas/civitai/reactions') {
        return jsonResponse({
          configured: true,
          file: { id: 77, source: 'CivitAI', source_id: '902' },
          reaction: { type: 'love' },
          download: { requested: true },
        })
      }

      return jsonResponse({ ok: false, message: `Unexpected ${url.pathname}` }, 500)
    })
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
        model: {
          id: 101,
          name: 'Atlas feed model',
          type: 'Checkpoint',
          modelVersions: [
            {
              id: 201,
              name: 'Latest version',
              baseModel: 'Illustrious',
              images: [{ url: 'https://example.test/fallback-1.jpg', type: 'image', nsfw: false }],
            },
          ],
        },
      },
    })

    await flushPromises()
    await wrapper.get('button[aria-label="Show feed"]').trigger('click')
    await flushPromises()

    expect(wrapper.findAll('[data-test="asset-preview-feed-item"]')).toHaveLength(2)
    expect(wrapper.findAll('[data-test="asset-preview-feed-atlas-badge"]')[0]?.text()).toBe('Downloaded')
    expect(wrapper.findAll('[data-test="asset-preview-feed-atlas-reactions"]')).toHaveLength(2)

    const atlasFeedCall = fetchMock.mock.calls.find((call) => String(call[0]) === '/api/atlas/civitai/feed')
    expect(JSON.parse(String(atlasFeedCall?.[1]?.body))).toMatchObject({
      limit: 20,
      modelId: 101,
      modelVersionId: 201,
      sort: 'Newest',
    })
    expect(fetchMock.mock.calls.some((call) => new URL(String(call[0]), 'http://127.0.0.1').pathname === '/api/civitai/images')).toBe(false)
    expect(fetchMock.mock.calls.some((call) => String(call[0]) === '/api/atlas/civitai/status')).toBe(false)

    await wrapper.findAll('[data-test="asset-preview-feed-atlas-reactions"]')[1]
      ?.get('button[aria-label="Favorite in Atlas"]')
      .trigger('click')
    await flushPromises()

    const reactionCall = fetchMock.mock.calls.find((call) => String(call[0]) === '/api/atlas/civitai/reactions')
    expect(JSON.parse(String(reactionCall?.[1]?.body))).toMatchObject({
      type: 'love',
      download_behavior: 'queue',
      item: expect.objectContaining({ id: 902, modelId: 101, modelVersionId: 201 }),
    })
    expect(wrapper.findAll('[data-test="asset-preview-feed-atlas-badge"]').map((badge) => badge.text())).toContain('Reacted')
  })

  it('opens the selected model version in Atlas', async () => {
    const openMock = vi.fn()
    vi.stubGlobal('open', openMock)
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://127.0.0.1')
      if (url.pathname === '/api/settings/app') {
        return jsonResponse({
          ok: true,
          includeNsfw: false,
          blurNsfwModels: true,
          blurNsfwMediaLevel: 4,
          atlasConfigured: true,
          atlasUrl: 'https://atlas.test',
          atlasKeyConfigured: true,
          atlasKeyPreview: 'Saved, ending in 1234',
        })
      }

      if (url.pathname === '/api/atlas/civitai/open-model') {
        return jsonResponse({
          configured: true,
          browse_url: 'https://atlas.test/browse',
        })
      }

      return jsonResponse({ items: [], metadata: { nextCursor: null } })
    })
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
        versionId: 202,
        model: {
          id: 101,
          name: 'Atlas version linked model',
          type: 'Checkpoint',
          modelVersions: [
            {
              id: 201,
              name: 'Latest version',
              baseModel: 'Illustrious',
              images: [{ url: 'https://example.test/latest.jpg', type: 'image', nsfw: false }],
            },
            {
              id: 202,
              name: 'Library version',
              baseModel: 'Pony',
              images: [{ url: 'https://example.test/library.jpg', type: 'image', nsfw: false }],
            },
          ],
        },
      },
    })

    await flushPromises()
    await wrapper.get('[data-test="asset-preview-atlas-link"]').trigger('click')
    await flushPromises()

    const openCall = fetchMock.mock.calls.find((call) => String(call[0]) === '/api/atlas/civitai/open-model')
    expect(JSON.parse(String(openCall?.[1]?.body))).toMatchObject({
      modelId: 101,
      modelVersionId: 202,
      nsfw: false,
    })
    expect(openMock).toHaveBeenCalledWith('https://atlas.test/browse', '_blank', 'noreferrer')
  })
})

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
