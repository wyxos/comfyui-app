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

describe('AssetPreviewModal image metadata loading', () => {
  it('keeps the metadata section visible when Civitai returns no prompt data', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ items: [], metadata: {} }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )))

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
          name: 'Metadata missing model',
          type: 'Checkpoint',
          modelVersions: [
            {
              id: 201,
              name: 'v1',
              images: [{ id: 901, url: 'https://example.test/no-meta.jpg', type: 'image', nsfw: false }],
            },
          ],
        },
      },
    })

    await flushPromises()

    expect(wrapper.text()).toContain('Metadata')
    expect(wrapper.text()).toContain('No prompt metadata found for this image.')
    expect(wrapper.text()).not.toContain('Source:')
  })

  it('loads selected image metadata in the image metadata sheet', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://127.0.0.1')
      if (url.pathname === '/api/civitai/images' && url.searchParams.get('imageId') === '901') {
        return new Response(
          JSON.stringify({
            items: [{
              id: 901,
              url: 'https://example.test/with-meta.jpg',
              type: 'image',
              nsfw: false,
              meta: {
                prompt: 'blue hair, underwater',
                negativePrompt: 'blur, text',
                seed: 424011486,
                steps: 30,
                cfgScale: 7,
                sampler: 'Euler a',
              },
            }],
            metadata: {},
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }

      return new Response(JSON.stringify({ items: [], metadata: {} }), {
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
          name: 'Metadata lookup model',
          type: 'Checkpoint',
          modelVersions: [
            {
              id: 201,
              name: 'v1',
              images: [{ id: 901, url: 'https://example.test/with-meta.jpg', type: 'image', nsfw: false }],
            },
          ],
        },
      },
    })

    await flushPromises()
    await flushPromises()

    const imageDetailRequest = fetchMock.mock.calls
      .map((call) => new URL(String(call[0]), 'http://127.0.0.1'))
      .find((url) => url.searchParams.get('imageId') === '901')
    expect(imageDetailRequest?.pathname).toBe('/api/civitai/images')
    expect(imageDetailRequest?.searchParams.get('limit')).toBe('1')
    expect(wrapper.text()).toContain('Prompt')
    expect(wrapper.text()).toContain('blue hair, underwater')
    expect(wrapper.text()).not.toContain('No prompt metadata found for this image.')
  })
})
