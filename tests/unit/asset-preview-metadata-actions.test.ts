// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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

describe('AssetPreviewModal metadata actions', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('keeps metadata copying on the floating image action when no apply handler is available', async () => {
    const writeText = vi.fn(async () => undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        ...navigator.clipboard,
        writeText,
      },
    })

    const { default: AssetPreviewModal } = await import('../../src/components/asset-preview/AssetPreviewModal.vue')
    const wrapper = mount(AssetPreviewModal, {
      attachTo: document.body,
      props: {
        open: true,
        model: {
          id: 101,
          name: 'Copy metadata checkpoint',
          type: 'Checkpoint',
          modelVersions: [
            {
              id: 201,
              name: 'v1',
              baseModel: 'Illustrious',
              images: [
                {
                  id: 401,
                  url: 'https://example.test/copy-only.jpg',
                  type: 'image',
                  nsfw: false,
                  meta: {
                    prompt: 'copy prompt',
                    negativePrompt: 'copy negative',
                    seed: 123,
                  },
                },
              ],
            },
          ],
        },
      },
    })

    await nextTick()

    const copyAction = wrapper.get('[data-test="asset-preview-floating-copy-metadata"]')
    expect(copyAction.attributes('aria-label')).toBe('Copy metadata')
    expect(wrapper.find('[data-test="asset-preview-floating-apply-metadata"]').exists()).toBe(false)
    expect(wrapper.findAll('button').some((button) => button.text().includes('Copy metadata'))).toBe(false)

    await copyAction.trigger('click')

    expect(writeText).toHaveBeenCalledTimes(1)
    expect(writeText.mock.calls[0]?.[0]).toContain('copy prompt')
  })

  it('sizes the side sheets to keep long metadata text inside the preview modal', async () => {
    const { default: AssetPreviewModal } = await import('../../src/components/asset-preview/AssetPreviewModal.vue')
    const wrapper = mount(AssetPreviewModal, {
      attachTo: document.body,
      props: {
        open: true,
        model: {
          id: 101,
          name: 'Long metadata checkpoint',
          type: 'Checkpoint',
          modelVersions: [
            {
              id: 201,
              name: 'v1',
              baseModel: 'Illustrious',
              images: [
                {
                  id: 401,
                  url: 'https://example.test/long-metadata.jpg',
                  type: 'image',
                  nsfw: false,
                  meta: {
                    prompt: `Hatsune Miku,${'verylongunbrokenmetadataword'.repeat(8)}`,
                    negativePrompt: `worst quality,${'anotherlongunbrokenmetadataword'.repeat(8)}`,
                  },
                },
              ],
            },
          ],
        },
      },
    })

    await nextTick()

    expect(wrapper.get('[role="dialog"]').classes())
      .toContain('lg:grid-cols-[minmax(0,1fr)_minmax(44rem,54rem)]')
    expect(wrapper.get('[data-test="asset-preview-side-sheets"]').classes())
      .toEqual(expect.arrayContaining([
        'min-w-0',
        'sm:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]',
      ]))
    expect(wrapper.get('[data-test="asset-preview-image-metadata-sidebar"]').classes())
      .toEqual(expect.arrayContaining(['min-w-0', 'overflow-x-hidden']))
    expect(wrapper.get('[data-test="asset-preview-metadata-card"]').classes()).toContain('overflow-hidden')
    expect(wrapper.get('[data-test="asset-preview-metadata-row-value"]').attributes('class'))
      .toContain('[overflow-wrap:anywhere]')
  })
})
