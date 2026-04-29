// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import UiSelect from '../../src/components/ui/UiSelect.vue'
import UiPaginatedCardGrid from '../../src/components/ui/UiPaginatedCardGrid.vue'
import UiTooltip from '../../src/components/ui/UiTooltip.vue'

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

describe('UiSelect', () => {
  it('filters options and emits the selected value', async () => {
    const wrapper = mount(UiSelect, {
      props: {
        modelValue: '',
        searchable: true,
        searchPlaceholder: 'Search models...',
        options: [
          { label: 'Alpha checkpoint', value: 'alpha.safetensors' },
          { label: 'Beta LoRA', value: 'beta.safetensors' },
        ],
      },
    })

    await wrapper.get('button').trigger('click')
    await wrapper.get('input[type="search"]').setValue('beta')

    expect(wrapper.text()).toContain('Beta LoRA')
    expect(wrapper.text()).not.toContain('Alpha checkpoint')

    await wrapper.findAll('button').find((button) => button.text().includes('Beta LoRA'))?.trigger('click')

    expect(wrapper.emitted('update:modelValue')).toEqual([['beta.safetensors']])
    expect(wrapper.find('input[type="search"]').exists()).toBe(false)
  })

  it('closes when the user clicks outside', async () => {
    const wrapper = mount(UiSelect, {
      attachTo: document.body,
      props: {
        modelValue: '',
        options: [{ label: 'Alpha checkpoint', value: 'alpha.safetensors' }],
      },
    })

    await wrapper.get('button').trigger('click')
    expect(wrapper.text()).toContain('Alpha checkpoint')

    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    await nextTick()

    expect(wrapper.findAll('button')).toHaveLength(1)
  })
})

describe('UiTooltip', () => {
  it('opens on focus and closes on blur', async () => {
    const wrapper = mount(UiTooltip, {
      attachTo: document.body,
      props: {
        content: 'Tooltip content',
      },
      slots: {
        default: '<button type="button">Trigger</button>',
      },
    })

    await wrapper.get('button').trigger('focusin')
    await nextTick()

    expect(document.body.textContent).toContain('Tooltip content')

    await wrapper.get('button').trigger('focusout')
    await nextTick()

    expect(document.body.textContent).not.toContain('Tooltip content')
  })
})

describe('UiPaginatedCardGrid', () => {
  it('supports cursor pagination controls and forwards scroll container attributes', async () => {
    const wrapper = mount(UiPaginatedCardGrid, {
      attrs: {
        'data-assets-results-scroll': '',
      },
      props: {
        itemsPresent: true,
        rangeLabel: '24 shown',
        currentPage: 1,
        pageCount: 1,
        pageText: 'Page 1',
        canGoPrevious: false,
        canGoNext: true,
      },
      slots: {
        default: '<article>Model card</article>',
      },
    })

    expect(wrapper.find('[data-assets-results-scroll]').exists()).toBe(true)
    expect(wrapper.text()).toContain('24 shown')
    expect(wrapper.text()).toContain('Page 1')
    expect(wrapper.find('article').text()).toBe('Model card')

    const buttons = wrapper.findAll('button')
    expect(buttons[0].attributes('disabled')).toBeDefined()
    expect(buttons[1].attributes('disabled')).toBeUndefined()

    await buttons[1].trigger('click')
    expect(wrapper.emitted('go-to-page')).toEqual([[2]])
  })
})

describe('AssetPreviewModal', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('hydrates local asset previews from Civitai model and image data', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/civitai/images?')) {
        return new Response(
          JSON.stringify({
            items: [
              {
                id: 401,
                url: 'https://example.test/wai-preview.jpg',
                type: 'image',
                nsfw: 'Safe',
                width: 512,
                height: 768,
                meta: { prompt: 'image-detail prompt', seed: 777 },
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }

      return new Response(
        JSON.stringify({
          items: [
            {
              id: 101,
              name: 'Civitai WAI checkpoint',
              type: 'Checkpoint',
              creator: { username: 'sample-creator' },
              stats: { downloadCount: 1234 },
              modelVersions: [
                {
                  id: 201,
                  name: 'v16.0',
                  baseModel: 'Illustrious',
                  trainedWords: ['blue armor'],
                  files: [
                    {
                      id: 301,
                      name: 'wai.safetensors',
                      type: 'Model',
                      primary: true,
                      sizeKB: 2048,
                      pickleScanResult: 'Success',
                      virusScanResult: 'Success',
                      metadata: { format: 'SafeTensor' },
                    },
                  ],
                  images: [
                    {
                      id: 401,
                      url: 'https://example.test/wai-preview.jpg',
                      type: 'image',
                      nsfw: 'Safe',
                      width: 512,
                      height: 768,
                      meta: { prompt: 'model-list prompt', seed: 42 },
                    },
                  ],
                },
              ],
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    })
    vi.stubGlobal('fetch', fetchMock)

    const { default: AssetPreviewModal } = await import('../../src/components/asset-preview/AssetPreviewModal.vue')
    mount(AssetPreviewModal, {
      attachTo: document.body,
      props: {
        open: true,
        title: 'Local checkpoint',
        previewUrl: '/api/model-preview?type=checkpoint&name=wai.safetensors',
        modelId: 101,
        versionId: 201,
        modelType: 'Checkpoint',
        baseModel: 'Illustrious',
        fileName: 'wai.safetensors',
      },
    })

    await flushPromises()

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/civitai/models?'),
      expect.objectContaining({ headers: { Accept: 'application/json' } }),
    )
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/civitai/images?'),
      expect.objectContaining({ headers: { Accept: 'application/json' } }),
    )
    expect(document.body.textContent).toContain('Civitai WAI checkpoint')
    expect(document.body.textContent).toContain('sample-creator')
    expect(document.body.textContent).toContain('Illustrious')
    expect(document.body.textContent).toContain('blue armor')
    expect(document.body.textContent).toContain('image-detail prompt')
    expect(document.body.textContent).toContain('Civitai API')
  })
})

describe('UiCarousel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders items and delegates navigation to Embla', async () => {
    const { default: UiCarousel } = await import('../../src/components/ui/UiCarousel.vue')
    const wrapper = mount(UiCarousel, {
      props: {
        items: ['first', 'second'],
        modelValue: 0,
      },
      slots: {
        item: '<template #item="{ item }"><div>{{ item }}</div></template>',
      },
    })

    expect(wrapper.text()).toContain('first')
    expect(wrapper.text()).toContain('second')

    await wrapper.findAll('button')[1].trigger('click')

    expect(emblaApi.scrollNext).toHaveBeenCalled()
  })
})
