// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils'
import { computed, defineComponent, h, nextTick, ref } from 'vue'
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

describe('AssetPreviewModal carousel and feed', () => {
  it('drops stale feed responses after the modal closes', async () => {
    let resolveFeed: ((response: Response) => void) | null = null
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => {
      resolveFeed = resolve
    }))
    vi.stubGlobal('fetch', fetchMock)

    const { useAssetPreviewMediaFeed } = await import('../../src/components/asset-preview/useAssetPreviewMediaFeed')
    const version = {
      id: 201,
      name: 'v1',
      baseModel: 'Illustrious',
      images: [{ url: 'https://example.test/version-1.jpg', type: 'image', nsfw: false }],
    }
    const model = {
      id: 101,
      name: 'Stale feed model',
      type: 'Checkpoint',
      modelVersions: [version],
    }
    const Probe = defineComponent({
      props: {
        open: {
          type: Boolean,
          required: true,
        },
      },
      setup(props) {
        const activeImageIndex = ref(0)
        const { feedSlides } = useAssetPreviewMediaFeed({
          open: computed(() => props.open),
          model: computed(() => model),
          selectedVersion: computed(() => version),
          includeNsfw: computed(() => false),
          previewUrl: null,
          isVideo: false,
          activeImageIndex,
        })

        return () => h('span', { 'data-test': 'feed-count' }, String(feedSlides.value.length))
      },
    })

    const wrapper = mount(Probe, {
      props: { open: true },
    })
    await nextTick()

    expect(fetchMock).toHaveBeenCalledTimes(1)

    await wrapper.setProps({ open: false })
    resolveFeed?.(new Response(
      JSON.stringify({ items: [{ id: 901, url: 'https://example.test/stale-feed.jpg', type: 'image', nsfw: false }] }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ))
    await flushPromises()

    expect(wrapper.get('[data-test="feed-count"]').text()).toBe('0')
  })

  it('keeps the selected version previews in the footer strip after the feed loads extra media', async () => {
    const feedItems = Array.from({ length: 20 }, (_, index) => ({
      id: 900 + index,
      url: `https://example.test/feed-${index + 1}.jpg`,
      type: index % 3 === 2 ? 'video' : 'image',
      nsfw: false,
      width: 768,
      height: 1024,
    }))

    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ items: feedItems }),
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
          name: 'Version preview model',
          type: 'Checkpoint',
          modelVersions: [
            {
              id: 201,
              name: 'v1',
              baseModel: 'Illustrious',
              images: [
                { url: 'https://example.test/version-1.jpg', type: 'image', nsfw: false },
                { url: 'https://example.test/version-2.gif', type: 'image', nsfw: false },
                { url: 'https://example.test/version-3.mp4', type: 'video', nsfw: false },
                { url: 'https://example.test/version-4.jpg', type: 'image', nsfw: false },
                { url: 'https://example.test/version-5.jpg', type: 'image', nsfw: false },
                { url: 'https://example.test/version-6.jpg', type: 'image', nsfw: false },
              ],
            },
          ],
        },
      },
    })

    await flushPromises()

    expect(wrapper.text()).toContain('1 / 6')
    expect(wrapper.findAll('[data-test="asset-preview-strip-button"]')).toHaveLength(6)

    await wrapper.get('button[aria-label="Show feed"]').trigger('click')
    await flushPromises()

    expect(wrapper.findAll('[data-test="asset-preview-feed-item"]')).toHaveLength(20)
    expect(wrapper.findAll('[data-test="asset-preview-strip-button"]')).toHaveLength(6)
    expect(wrapper.text()).toContain('1 / 6')
  })

  it('lets the user jump between previews from the footer media strip', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ items: [] }),
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
          name: 'Footer strip model',
          type: 'Checkpoint',
          modelVersions: [
            {
              id: 201,
              name: 'v1',
              baseModel: 'Illustrious',
              images: [
                { url: 'https://example.test/preview-1.jpg', type: 'image', nsfw: false },
                { url: 'https://example.test/preview-2.gif', type: 'image', nsfw: false },
                { url: 'https://example.test/preview-3.mp4', type: 'video', nsfw: false },
              ],
            },
          ],
        },
      },
    })

    await nextTick()

    const stripButtons = wrapper.findAll('[data-test="asset-preview-strip-button"]')
    expect(stripButtons).toHaveLength(3)
    expect(wrapper.text()).toContain('1 / 3')

    await stripButtons[1]?.trigger('click')
    await nextTick()
    await wrapper.get('button[aria-label="Show image and video details"]').trigger('click')
    await nextTick()

    expect(wrapper.text()).toContain('2 / 3')
    expect(wrapper.text()).toContain('2 of 3')
  })

  it('resets the footer strip to the new model previews when the modal reopens', async () => {
    let feedItems = Array.from({ length: 20 }, (_, index) => ({
      id: 1000 + index,
      url: `https://example.test/first-feed-${index + 1}.jpg`,
      type: 'image',
      nsfw: false,
    }))

    const fetchMock = vi.fn(async () => new Response(
      JSON.stringify({ items: feedItems }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ))
    vi.stubGlobal('fetch', fetchMock)

    const firstModel = {
      id: 101,
      name: 'First model',
      type: 'Checkpoint',
      modelVersions: [
        {
          id: 201,
          name: 'v1',
          baseModel: 'Illustrious',
          images: Array.from({ length: 6 }, (_, index) => ({
            url: `https://example.test/first-version-${index + 1}.jpg`,
            type: 'image',
            nsfw: false,
          })),
        },
      ],
    }
    const secondModel = {
      id: 202,
      name: 'Second model',
      type: 'Checkpoint',
      modelVersions: [
        {
          id: 301,
          name: 'v2',
          baseModel: 'Anima',
          images: [
            { url: 'https://example.test/second-version-1.jpg', type: 'image', nsfw: false },
            { url: 'https://example.test/second-version-2.jpg', type: 'image', nsfw: false },
          ],
        },
      ],
    }

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
        model: firstModel,
      },
    })

    await flushPromises()
    expect(wrapper.findAll('[data-test="asset-preview-strip-button"]')).toHaveLength(6)
    expect(wrapper.text()).toContain('1 / 6')

    await wrapper.setProps({ open: false })
    await nextTick()

    feedItems = []
    await wrapper.setProps({ open: true, model: secondModel })
    await flushPromises()

    const civitaiFeedRequests = fetchMock.mock.calls
      .map((call) => new URL(String(call[0]), 'http://127.0.0.1'))
      .filter((url) => url.pathname === '/api/civitai/images')
    expect(civitaiFeedRequests).toHaveLength(2)
    expect(wrapper.findAll('[data-test="asset-preview-strip-button"]')).toHaveLength(2)
    expect(wrapper.text()).toContain('1 / 2')
  })

  it('keeps the Civitai link as a compact icon beside the modal title', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ items: [] }),
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
          name: 'Linked model',
          type: 'Checkpoint',
          modelVersions: [{ id: 201, name: 'v1', images: [] }],
        },
      },
    })

    await flushPromises()

    const link = wrapper.get('[data-test="asset-preview-civitai-link"]')
    expect(link.attributes('href')).toBe('https://civitai.com/models/101')
    expect(link.attributes('aria-label')).toBe('Open Linked model on Civitai')
    expect(link.text()).toBe('')
    expect(wrapper.text()).not.toContain('Open on Civitai')
  })
})
