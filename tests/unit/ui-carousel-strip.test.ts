// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

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

describe('UiCarousel strip layout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('applies custom item classes so a five-up media strip can share the carousel primitive', async () => {
    const { default: UiCarousel } = await import('../../src/components/ui/UiCarousel.vue')
    const wrapper = mount(UiCarousel, {
      props: {
        items: ['one', 'two', 'three'],
        itemClass: 'basis-1/5 px-1 h-16',
      },
      slots: {
        item: '<template #item="{ item }"><div>{{ item }}</div></template>',
      },
    })

    const items = wrapper.findAll('[data-test="carousel-item"]')
    expect(items).toHaveLength(3)
    expect(items[0]?.classes()).toContain('basis-1/5')
    expect(items[0]?.classes()).toContain('px-1')
    expect(items[0]?.classes()).toContain('h-16')
  })

  it('renders the asset preview strip as square cards with contained media', async () => {
    const { default: AssetPreviewMediaStrip } = await import('../../src/components/asset-preview/AssetPreviewMediaStrip.vue')
    const wrapper = mount(AssetPreviewMediaStrip, {
      props: {
        activeIndex: 0,
        slides: [
          {
            key: 'one',
            url: 'https://example.test/preview-1.jpg',
            image: { url: 'https://example.test/preview-1.jpg' },
            isVideo: false,
            source: 'civitai',
          },
        ],
      },
    })

    expect(wrapper.get('section > div').classes()).toContain('h-20')
    expect(wrapper.get('section > div').classes()).toContain('max-w-[25rem]')
    expect(wrapper.get('[data-test="carousel-item"]').classes()).toContain('basis-1/5')
    expect(wrapper.get('[data-test="carousel-item"]').classes()).toContain('p-1')
    expect(wrapper.get('[data-test="asset-preview-strip-button"]').classes()).toContain('h-[calc(100%-0.5rem)]')
    expect(wrapper.findComponent({ name: 'UiPreloadedMedia' }).props('mediaClass')).toContain('object-contain')
    expect(wrapper.text()).not.toContain('Image')
    expect(wrapper.text()).not.toContain('1')
  })
})
