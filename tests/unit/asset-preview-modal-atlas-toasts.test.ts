// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { emblaApi, toastError } = vi.hoisted(() => ({
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
  toastError: vi.fn(),
}))

vi.mock('embla-carousel-vue', async () => {
  const { ref } = await import('vue')
  return {
    default: () => [ref(null), ref(emblaApi)],
  }
})

vi.mock('vue-sonner', () => ({
  toast: {
    error: toastError,
  },
}))

describe('AssetPreviewModal Atlas toasts', () => {
  beforeEach(() => {
    toastError.mockClear()
  })

  it('shows a bottom-center toast when an Atlas reaction fails', async () => {
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
        })
      }

      if (url.pathname === '/api/atlas/civitai/status') {
        return jsonResponse({
          ok: true,
          configured: true,
          items: [{ request_id: 'civitai:800', exists: false, filtered: false }],
        })
      }

      if (url.pathname === '/api/atlas/civitai/reactions') {
        return jsonResponse({
          ok: false,
          configured: true,
          message: 'Invalid extension API key.',
        }, 401)
      }

      return jsonResponse({ items: [] })
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
          name: 'Atlas toast model',
          type: 'Checkpoint',
          modelVersions: [
            {
              id: 201,
              name: 'Latest version',
              images: [{ id: 800, url: 'https://example.test/version-original.jpg', type: 'image', nsfw: false }],
            },
          ],
        },
      },
    })

    await flushPromises()
    await wrapper
      .get('[data-test="asset-preview-main-atlas-reactions"]')
      .get('button[aria-label="Favorite in Atlas"]')
      .trigger('click')
    await flushPromises()

    expect(toastError).toHaveBeenCalledWith('Invalid extension API key.')
  })
})

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
