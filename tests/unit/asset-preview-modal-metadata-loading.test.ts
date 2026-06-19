// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h, nextTick, ref } from 'vue'
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

  it('restarts first image metadata loading when the modal model changes but the image id stays the same', async () => {
    let imageDetailRequests = 0
    const firstImageRequest = { aborted: false }

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), 'http://127.0.0.1')
      if (url.pathname === '/api/civitai/images' && url.searchParams.get('imageId') === '901') {
        imageDetailRequests += 1
        if (imageDetailRequests === 1) {
          return new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => {
              firstImageRequest.aborted = true
              reject(new DOMException('Aborted', 'AbortError'))
            }, { once: true })
          })
        }

        return new Response(
          JSON.stringify({
            items: [{
              id: 901,
              url: 'https://example.test/same-image.jpg',
              type: 'image',
              nsfw: false,
              meta: {
                prompt: 'refetched first prompt',
                seed: 901901,
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

    const activeModel = ref(modelWithFirstImage(101))
    const { default: AssetPreviewModal } = await import('../../src/components/asset-preview/AssetPreviewModal.vue')
    const Host = defineComponent({
      setup() {
        return () => h(AssetPreviewModal, {
          open: true,
          model: activeModel.value,
        })
      },
    })
    const wrapper = mount(Host, {
      attachTo: document.body,
      global: {
        stubs: {
          RouterLink: { template: '<a><slot /></a>' },
        },
      },
    })

    await nextTick()
    expect(imageDetailRequests).toBe(1)

    activeModel.value = modelWithFirstImage(202)
    await nextTick()
    await flushPromises()

    expect(firstImageRequest.aborted).toBe(true)
    expect(imageDetailRequests).toBe(2)
    expect(wrapper.text()).toContain('refetched first prompt')
    expect(wrapper.find('[data-test="asset-preview-floating-copy-metadata"]').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('No prompt metadata found for this image.')
  })
})

function modelWithFirstImage(modelId: number) {
  return {
    id: modelId,
    name: 'Metadata refresh model',
    type: 'Checkpoint',
    modelVersions: [
      {
        id: 201,
        name: 'v1',
        images: [{ id: 901, url: 'https://example.test/same-image.jpg', type: 'image', nsfw: false }],
      },
    ],
  }
}
