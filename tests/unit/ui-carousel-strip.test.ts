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

  it('keeps strip paging controls outside the thumbnail viewport and pages five at a time', async () => {
    const { default: AssetPreviewMediaStrip } = await import('../../src/components/asset-preview/AssetPreviewMediaStrip.vue')
    const wrapper = mount(AssetPreviewMediaStrip, {
      props: {
        activeIndex: 0,
        slides: Array.from({ length: 8 }, (_, index) => ({
          key: `preview-${index}`,
          url: `https://example.test/preview-${index}.jpg`,
          image: { url: `https://example.test/preview-${index}.jpg` },
          isVideo: false,
          source: 'civitai' as const,
        })),
      },
    })

    const viewport = wrapper.get('[data-test="asset-preview-strip-viewport"]')
    const nextButton = wrapper.get('[data-test="asset-preview-strip-next"]')

    expect(viewport.element.contains(nextButton.element)).toBe(false)

    vi.clearAllMocks()
    await nextButton.trigger('click')

    expect(emblaApi.scrollTo).toHaveBeenCalledWith(5, true)
    expect(emblaApi.scrollNext).not.toHaveBeenCalled()
  })

  it('keeps strip paging controls inside compact viewports and outside wider viewports', async () => {
    const { default: AssetPreviewMediaStrip } = await import('../../src/components/asset-preview/AssetPreviewMediaStrip.vue')
    const wrapper = mount(AssetPreviewMediaStrip, {
      props: {
        activeIndex: 0,
        slides: Array.from({ length: 8 }, (_, index) => ({
          key: `preview-${index}`,
          url: `https://example.test/preview-${index}.jpg`,
          image: { url: `https://example.test/preview-${index}.jpg` },
          isVideo: false,
          source: 'civitai' as const,
        })),
      },
    })

    const controls = wrapper.get('[data-test="asset-preview-strip-next"]').element.parentElement
    expect(controls?.className).toContain('left-0')
    expect(controls?.className).toContain('right-0')
    expect(controls?.className).toContain('sm:-left-12')
    expect(controls?.className).toContain('sm:-right-12')
  })

  it('keeps the visible five thumbnails stable until the active item enters the next group', async () => {
    const { default: AssetPreviewMediaStrip } = await import('../../src/components/asset-preview/AssetPreviewMediaStrip.vue')
    const wrapper = mount(AssetPreviewMediaStrip, {
      props: {
        activeIndex: 0,
        slides: Array.from({ length: 13 }, (_, index) => ({
          key: `preview-${index}`,
          url: `https://example.test/preview-${index}.jpg`,
          image: { url: `https://example.test/preview-${index}.jpg` },
          isVideo: false,
          source: 'civitai' as const,
        })),
      },
    })

    vi.clearAllMocks()

    await wrapper.setProps({ activeIndex: 3 })
    expect(emblaApi.scrollTo).not.toHaveBeenCalledWith(3, true)

    await wrapper.setProps({ activeIndex: 5 })
    expect(emblaApi.scrollTo).toHaveBeenCalledWith(5, true)
  })

  it('keeps the final thumbnail page selected when Embla reports its clamped snap index', async () => {
    const { default: UiCarousel } = await import('../../src/components/ui/UiCarousel.vue')
    const { default: AssetPreviewMediaStrip } = await import('../../src/components/asset-preview/AssetPreviewMediaStrip.vue')
    const wrapper = mount(AssetPreviewMediaStrip, {
      props: {
        activeIndex: 5,
        slides: Array.from({ length: 8 }, (_, index) => ({
          key: `preview-${index}`,
          url: `https://example.test/preview-${index}.jpg`,
          image: { url: `https://example.test/preview-${index}.jpg` },
          isVideo: false,
          source: 'civitai' as const,
        })),
      },
    })
    const carousel = wrapper.getComponent(UiCarousel)

    expect(carousel.props('modelValue')).toBe(5)

    await carousel.vm.$emit('update:modelValue', 3)
    await wrapper.vm.$nextTick()

    expect(carousel.props('modelValue')).toBe(5)
  })

  it('uses logical thumbnail pages when paging after selecting an item in the first group', async () => {
    const { default: UiCarousel } = await import('../../src/components/ui/UiCarousel.vue')
    const { default: AssetPreviewMediaStrip } = await import('../../src/components/asset-preview/AssetPreviewMediaStrip.vue')
    const wrapper = mount(AssetPreviewMediaStrip, {
      props: {
        activeIndex: 3,
        slides: Array.from({ length: 8 }, (_, index) => ({
          key: `preview-${index}`,
          url: `https://example.test/preview-${index}.jpg`,
          image: { url: `https://example.test/preview-${index}.jpg` },
          isVideo: false,
          source: 'civitai' as const,
        })),
      },
    })
    const carousel = wrapper.getComponent(UiCarousel)
    const nextButton = wrapper.get('[data-test="asset-preview-strip-next"]')

    await nextButton.trigger('click')
    await wrapper.vm.$nextTick()

    expect(carousel.props('modelValue')).toBe(5)

    await carousel.vm.$emit('update:modelValue', 3)
    await wrapper.setProps({ activeIndex: 7 })
    await wrapper.vm.$nextTick()

    expect(carousel.props('modelValue')).toBe(5)
  })
})
