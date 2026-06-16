// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { describe, expect, it, vi } from 'vitest'

vi.mock('embla-carousel-vue', async () => {
  const { ref } = await import('vue')
  return {
    default: () => [ref(null), ref({
      canScrollPrev: () => false,
      canScrollNext: () => true,
      selectedScrollSnap: () => 0,
      scrollPrev: vi.fn(),
      scrollNext: vi.fn(),
      scrollTo: vi.fn(),
      reInit: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
    })],
  }
})

describe('AssetPreviewModal media loading', () => {
  it('renders modal preview images without a separate JavaScript image preload', async () => {
    const imageConstructor = vi.fn(function MockImage(this: { onload: (() => void) | null; onerror: (() => void) | null }) {
      this.onload = null
      this.onerror = null
    })
    vi.stubGlobal('Image', imageConstructor)

    const { default: AssetPreviewModal } = await import('../../src/components/asset-preview/AssetPreviewModal.vue')
    const wrapper = mount(AssetPreviewModal, {
      attachTo: document.body,
      props: {
        open: true,
        model: {
          id: 101,
          name: 'Single request preview model',
          type: 'Checkpoint',
          modelVersions: [
            {
              id: 201,
              name: 'v1',
              baseModel: 'Illustrious',
              images: [
                { url: 'https://example.test/single-request.jpg', type: 'image', nsfw: false },
              ],
            },
          ],
        },
      },
    })

    await nextTick()

    expect(imageConstructor).not.toHaveBeenCalled()
    expect(wrapper.get('img').attributes('src')).toBe('https://example.test/single-request.jpg')
  })

  it('does not blur a safe preview image just because the model is NSFW', async () => {
    const { default: AssetPreviewModal } = await import('../../src/components/asset-preview/AssetPreviewModal.vue')
    const wrapper = mount(AssetPreviewModal, {
      attachTo: document.body,
      props: {
        open: true,
        blurNsfwContent: true,
        model: {
          id: 101,
          name: 'Safe preview on NSFW model',
          type: 'Checkpoint',
          nsfw: true,
          modelVersions: [
            {
              id: 201,
              name: 'v1',
              baseModel: 'Illustrious',
              images: [
                { url: 'https://example.test/safe-preview.jpg', type: 'image', nsfw: false },
              ],
            },
          ],
        },
      },
    })

    await nextTick()

    expect(wrapper.get('img[alt="Safe preview on NSFW model preview image"]').classes()).not.toContain('blur-2xl')
  })

  it('does not blur PG-13 numeric nsfwLevel preview images', async () => {
    const { default: AssetPreviewModal } = await import('../../src/components/asset-preview/AssetPreviewModal.vue')
    const wrapper = mount(AssetPreviewModal, {
      attachTo: document.body,
      props: {
        open: true,
        blurNsfwContent: true,
        model: {
          id: 101,
          name: 'PG-13 preview model',
          type: 'Checkpoint',
          modelVersions: [
            {
              id: 201,
              name: 'v1',
              baseModel: 'Illustrious',
              images: [
                { url: 'https://example.test/pg13-preview.jpg', type: 'image', nsfwLevel: 2 },
              ],
            },
          ],
        },
      },
    })

    await nextTick()

    expect(wrapper.get('img[alt="PG-13 preview model preview image"]').classes()).not.toContain('blur-2xl')
  })

  it('does not request preview feed images with nsfw=false when the saved default toggle is off', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ items: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const { default: AssetPreviewModal } = await import('../../src/components/asset-preview/AssetPreviewModal.vue')
    mount(AssetPreviewModal, {
      attachTo: document.body,
      props: {
        open: true,
        includeNsfw: false,
        model: {
          id: 101,
          name: 'Feed request model',
          type: 'Checkpoint',
          modelVersions: [
            {
              id: 201,
              name: 'v1',
              baseModel: 'Illustrious',
              images: [
                { url: 'https://example.test/feed-preview.jpg', type: 'image' },
              ],
            },
          ],
        },
      },
    })

    await flushPromises()

    const feedRequest = fetchMock.mock.calls
      .map(([input]) => String(input))
      .find((url) => url.includes('/api/civitai/images?') && url.includes('modelVersionId=201'))

    expect(feedRequest).toBeTruthy()
    expect(new URL(String(feedRequest), 'http://companion.test').searchParams.get('nsfw')).toBeNull()
  })
})
