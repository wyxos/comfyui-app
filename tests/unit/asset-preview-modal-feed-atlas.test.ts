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

describe('AssetPreviewModal feed and Atlas integration', () => {
  it('cursor-paginates the selected model version feed from the modal tab', async () => {
    const firstFeedPage = Array.from({ length: 20 }, (_, index) => ({
      id: 900 + index,
      url: `https://example.test/feed-${index + 1}.jpg`,
      type: index % 3 === 2 ? 'video' : 'image',
      nsfw: false,
      width: 768,
      height: 1024,
    }))
    const secondFeedPage = Array.from({ length: 2 }, (_, index) => ({
      id: 950 + index,
      url: `https://example.test/feed-page-2-${index + 1}.jpg`,
      type: 'image',
      nsfw: false,
      width: 768,
      height: 1024,
    }))

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://127.0.0.1')
      const hasCursor = url.searchParams.get('cursor') === 'next-feed-cursor'
      return new Response(
        JSON.stringify({
          items: hasCursor ? secondFeedPage : firstFeedPage,
          metadata: { nextCursor: hasCursor ? null : 'next-feed-cursor' },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
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
          name: 'Feed model',
          type: 'Checkpoint',
          modelVersions: [
            {
              id: 201,
              name: 'Latest version',
              baseModel: 'Illustrious',
              publishedAt: '2024-05-01T00:00:00.000Z',
              images: [{ url: 'https://example.test/fallback-1.jpg', type: 'image', nsfw: false }],
            },
            {
              id: 202,
              name: 'Older version',
              baseModel: 'Illustrious',
              publishedAt: '2024-03-01T00:00:00.000Z',
              images: [{ url: 'https://example.test/fallback-2.jpg', type: 'image', nsfw: false }],
            },
          ],
        },
      },
    })

    await flushPromises()

    const requestUrl = fetchMock.mock.calls
      .map((call) => new URL(String(call[0]), 'http://127.0.0.1'))
      .find((url) => url.pathname === '/api/civitai/images')!
    expect(requestUrl.pathname).toBe('/api/civitai/images')
    expect(requestUrl.searchParams.get('modelId')).toBe('101')
    expect(requestUrl.searchParams.get('modelVersionId')).toBe('201')
    expect(requestUrl.searchParams.get('limit')).toBe('20')
    expect(requestUrl.searchParams.get('sort')).toBe('Newest')
    expect(requestUrl.searchParams.get('nsfw')).toBeNull()
    expect(requestUrl.searchParams.get('cursor')).toBeNull()

    await wrapper.get('button[aria-label="Show feed"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-test="asset-preview-feed-version-select"]').exists()).toBe(true)
    expect(wrapper.findAll('[data-test="asset-preview-feed-version-badge"]')).toHaveLength(0)
    expect(wrapper.get('[data-test="asset-preview-feed-grid"]').classes()).toContain('grid-cols-3')
    expect(wrapper.findAll('[data-test="asset-preview-feed-item"]')).toHaveLength(20)
    expect(wrapper.findAll('[data-test="asset-preview-feed-item"]')[0]?.text()).not.toContain('https://')

    await wrapper.get('[data-test="asset-preview-feed-load-more"]').trigger('click')
    await flushPromises()

    const civitaiFeedRequests = fetchMock.mock.calls
      .map((call) => new URL(String(call[0]), 'http://127.0.0.1'))
      .filter((url) => url.pathname === '/api/civitai/images')
    const secondRequestUrl = civitaiFeedRequests[1]!
    expect(secondRequestUrl.searchParams.get('cursor')).toBe('next-feed-cursor')
    expect(secondRequestUrl.searchParams.get('modelVersionId')).toBe('201')
    expect(wrapper.findAll('[data-test="asset-preview-feed-item"]')).toHaveLength(22)
    expect(wrapper.find('[data-test="asset-preview-feed-load-more"]').exists()).toBe(false)

    await wrapper.findAll('[data-test="asset-preview-feed-item"]')[3]?.trigger('click')
    await flushPromises()

    expect(wrapper.findAll('[data-test="asset-preview-strip-button"]')).toHaveLength(22)
    expect(wrapper.text()).toContain('4 / 22')

    await wrapper.findAll('[data-test="asset-preview-strip-button"]')[4]?.trigger('click')
    await flushPromises()

    expect(wrapper.findAll('[data-test="asset-preview-strip-button"]')).toHaveLength(22)
    expect(wrapper.text()).toContain('5 / 22')

    const versionSelect = wrapper.get('[data-test="asset-preview-feed-version-select"]')
    await versionSelect.get('button[role="combobox"]').trigger('click')
    const olderVersionButton = wrapper.findAll('[role="option"]').find((button) => button.text().includes('Older version'))
    await olderVersionButton?.trigger('click')
    await flushPromises()

    const versionRequests = fetchMock.mock.calls
      .map((call) => new URL(String(call[0]), 'http://127.0.0.1'))
      .filter((url) => url.pathname === '/api/civitai/images' && url.searchParams.has('modelVersionId'))
    expect(versionRequests.at(-1)?.searchParams.get('modelVersionId')).toBe('202')
  })

  it('uses Atlas status to hide filtered feed media and react from the feed', async () => {
    const feedItems = [
      {
        id: 900,
        url: 'https://example.test/feed-downloaded.jpg',
        type: 'image',
        nsfw: false,
        width: 768,
        height: 1024,
      },
      {
        id: 901,
        url: 'https://example.test/feed-blacklisted.jpg',
        type: 'image',
        nsfw: false,
        width: 768,
        height: 1024,
      },
      {
        id: 902,
        url: 'https://example.test/feed-candidate.jpg',
        type: 'image',
        nsfw: false,
        width: 768,
        height: 1024,
      },
    ]
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://127.0.0.1')
      if (url.pathname === '/api/settings/app') {
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

      if (url.pathname === '/api/atlas/civitai/status') {
        return new Response(JSON.stringify({
          ok: true,
          configured: true,
          items: [
            { request_id: 'civitai:900', exists: true, downloaded: true, filtered: false },
            {
              request_id: 'civitai:901',
              exists: true,
              blacklisted: true,
              filtered: true,
              filter_reasons: [{ type: 'blacklisted', name: 'Atlas blacklist' }],
            },
            { request_id: 'civitai:902', exists: false, downloaded: false, filtered: false },
          ],
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }

      if (url.pathname === '/api/atlas/civitai/reactions') {
        return new Response(JSON.stringify({
          configured: true,
          file: { id: 77, source: 'CivitAI', source_id: '902' },
          reaction: { type: 'love' },
          download: { requested: true },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }

      return new Response(
        JSON.stringify({ items: feedItems }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
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

    const statusCall = fetchMock.mock.calls.find((call) => String(call[0]) === '/api/atlas/civitai/status')
    expect(JSON.parse(String(statusCall?.[1]?.body))).toMatchObject({
      items: expect.arrayContaining([
        expect.objectContaining({
          id: 900,
          modelId: 101,
          modelVersionId: 201,
          resource_containers: [expect.objectContaining({ type: 'Checkpoint', modelVersionId: 201 })],
        }),
      ]),
    })

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

  it('shows a retry action and upstream detail when a feed request fails', async () => {
    let feedRequestCount = 0
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://127.0.0.1')
      if (url.pathname === '/api/civitai/images') {
        feedRequestCount += 1
        if (feedRequestCount === 1) {
          return new Response(JSON.stringify({
            ok: false,
            message: 'Civitai returned 503.',
            details: { error: 'Image search is temporarily overloaded - please retry.' },
          }), { status: 502, headers: { 'Content-Type': 'application/json' } })
        }

        return new Response(JSON.stringify({
          items: [{ id: 903, url: 'https://example.test/feed-after-retry.jpg', type: 'image', nsfw: false }],
          metadata: { nextCursor: null },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }

      return new Response(JSON.stringify({ ok: true, includeNsfw: false, atlasConfigured: false }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
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
          name: 'Retry feed model',
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

    expect(wrapper.text()).toContain('Civitai returned 503. Image search is temporarily overloaded - please retry.')
    await wrapper.get('[data-test="asset-preview-feed-retry"]').trigger('click')
    await flushPromises()

    expect(feedRequestCount).toBe(2)
    expect(wrapper.findAll('[data-test="asset-preview-feed-item"]')).toHaveLength(1)
  })

  it('shows the Atlas open action when Atlas is configured even if the feed has no status items', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://127.0.0.1')
      if (url.pathname === '/api/settings/app') {
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

      return new Response(
        JSON.stringify({ items: [], metadata: { nextCursor: null } }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
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
          name: 'Atlas linked model',
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

    expect(wrapper.find('[data-test="asset-preview-atlas-link"]').exists()).toBe(true)
    expect(fetchMock.mock.calls.some((call) => String(call[0]) === '/api/atlas/civitai/status')).toBe(false)
  })

  it('includes NSFW media in feed requests when the modal allows NSFW previews', async () => {
    const fetchMock = vi.fn(async () => new Response(
      JSON.stringify({ items: [] }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ))
    vi.stubGlobal('fetch', fetchMock)

    const { default: AssetPreviewModal } = await import('../../src/components/asset-preview/AssetPreviewModal.vue')
    mount(AssetPreviewModal, {
      attachTo: document.body,
      global: {
        stubs: {
          RouterLink: { template: '<a><slot /></a>' },
        },
      },
      props: {
        open: true,
        includeNsfw: true,
        model: {
          id: 101,
          name: 'NSFW feed model',
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

    const requestUrl = fetchMock.mock.calls
      .map((call) => new URL(String(call[0]), 'http://127.0.0.1'))
      .find((url) => url.pathname === '/api/civitai/images')!
    expect(requestUrl.pathname).toBe('/api/civitai/images')
    expect(requestUrl.searchParams.get('modelId')).toBe('101')
    expect(requestUrl.searchParams.get('modelVersionId')).toBe('201')
    expect(requestUrl.searchParams.get('nsfw')).toBe('true')
  })
})
