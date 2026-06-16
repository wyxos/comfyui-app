// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'

const { emblaApi } = vi.hoisted(() => ({
  emblaApi: {
    canScrollPrev: vi.fn(() => false),
    canScrollNext: vi.fn(() => false),
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

describe('AssetPreviewModal preview URLs', () => {
  it('keeps the full modal image original while using resized URLs for previews', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({
        items: [
          {
            id: 901,
            url: 'https://image.test/feed-preview.jpg?original=true&token=feed',
            type: 'image',
            nsfw: false,
          },
        ],
      }),
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
          name: 'Bandwidth model',
          type: 'Checkpoint',
          modelVersions: [
            {
              id: 201,
              name: 'v1',
              baseModel: 'Illustrious',
              images: [
                {
                  id: 801,
                  url: 'https://image.test/model-preview.jpg?original=true&token=model',
                  type: 'image',
                  nsfw: false,
                },
              ],
            },
          ],
        },
      },
    })

    await flushPromises()

    expect(wrapper.get('img[alt="Bandwidth model preview image"]').attributes('src')).toBe(
      'https://image.test/model-preview.jpg?original=true&token=model',
    )
    expect(wrapper.get('img[alt="Preview 1"]').attributes('src')).toBe(
      'https://image.test/model-preview.jpg?width=450&token=model',
    )

    await wrapper.get('button[aria-label="Show feed"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('img[alt="Feed preview 1"]').attributes('src')).toBe(
      'https://image.test/feed-preview.jpg?width=450&token=feed',
    )
  })
})
