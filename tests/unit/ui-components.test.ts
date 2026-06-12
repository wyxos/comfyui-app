// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h, nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import UiSelect from '../../src/components/ui/UiSelect.vue'
import UiSwitch from '../../src/components/ui/UiSwitch.vue'
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

describe('UiSwitch', () => {
  it('uses a square-rounded thumb', () => {
    const wrapper = mount(UiSwitch, {
      props: {
        checked: true,
      },
    })

    const thumb = wrapper.get('span')
    expect(thumb.classes()).toContain('rounded-sm')
    expect(thumb.classes()).not.toContain('rounded-full')
  })
})

describe('AssetPreviewModal', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
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

  it('shows download and delete actions for a downloaded version file', async () => {
    const { default: AssetPreviewModal } = await import('../../src/components/asset-preview/AssetPreviewModal.vue')
    const { default: ConfirmationProvider } = await import('../../src/components/ConfirmationProvider.vue')
    const version = {
      id: 201,
      name: 'v16.0',
      baseModel: 'Illustrious',
      files: [
        {
          id: 301,
          name: 'wai.safetensors',
          type: 'Model',
          primary: true,
          downloadUrl: 'https://example.test/wai.safetensors',
        },
      ],
    }
    const download = {
      id: 'download-1',
      state: 'complete',
      fileName: 'wai.safetensors',
    }
    const deleteAssetDownload = vi.fn()
    const Host = defineComponent({
      setup() {
        return () =>
          h(ConfirmationProvider, null, {
            default: () =>
              h(AssetPreviewModal, {
                open: true,
                model: {
                  id: 101,
                  name: 'Civitai WAI checkpoint',
                  type: 'Checkpoint',
                  modelVersions: [version],
                },
                showDownloadActions: true,
                downloadForVersion: () => download,
                queueAssetDownload: vi.fn(),
                deleteAssetDownload,
                modelDownloadKey: () => '101:201',
              }),
          })
      },
    })
    const wrapper = mount(Host, { attachTo: document.body })

    await nextTick()

    expect(wrapper.text()).toContain('Re-download')
    const deleteButton = wrapper.find('button[aria-label="Delete wai.safetensors from disk"]')
    expect(deleteButton.exists()).toBe(true)

    await deleteButton.trigger('click')
    await nextTick()

    expect(document.body.textContent).toContain('Delete downloaded file?')
    const confirmButton = Array.from(document.body.querySelectorAll('button'))
      .find((button) => button.textContent?.trim() === 'Delete file') as HTMLButtonElement | undefined
    expect(confirmButton).toBeDefined()
    confirmButton?.click()
    await flushPromises()

    expect(deleteAssetDownload).toHaveBeenCalledWith(download, version)
  })

  it('emits manual safety override changes from the asset preview modal', async () => {
    const { default: AssetPreviewModal } = await import('../../src/components/asset-preview/AssetPreviewModal.vue')
    const wrapper = mount(AssetPreviewModal, {
      attachTo: document.body,
      props: {
        open: true,
        model: {
          id: 101,
          name: 'Local checkpoint',
          type: 'Checkpoint',
          modelVersions: [],
        },
        modelType: 'Checkpoint',
        fileName: 'local.safetensors',
        editableSafety: true,
        compatibility: {
          modelNsfw: false,
          modelNsfwOverride: null,
        },
      },
    })

    await nextTick()

    expect(wrapper.text()).toContain('Safety')
    await wrapper.get('button[aria-label="Mark NSFW"]').trigger('click')
    await wrapper.get('button[aria-label="Save safety override"]').trigger('click')

    expect(wrapper.emitted('save-safety')).toEqual([
      [{ modelNsfw: true, modelNsfwOverride: true }],
    ])
  })

  it('filters model versions by base model groups when metadata is available', async () => {
    const { default: AssetPreviewModal } = await import('../../src/components/asset-preview/AssetPreviewModal.vue')
    const wrapper = mount(AssetPreviewModal, {
      attachTo: document.body,
      props: {
        open: true,
        model: {
          id: 101,
          name: 'Grouped version model',
          type: 'Checkpoint',
          modelVersions: [
            {
              id: 201,
              name: 'niTratto [ANIMA]',
              baseModel: 'Anima',
              files: [{ name: 'trattoNero_nitrattoANIMA.safetensors', type: 'Model', primary: true }],
              images: [{ url: 'https://example.test/anima.jpg', type: 'image', nsfw: false }],
            },
            {
              id: 202,
              name: 'Holbein',
              baseModel: 'Illustrious',
              files: [{ name: 'trattoNero_holbein.safetensors', type: 'Model', primary: true }],
              images: [{ url: 'https://example.test/illustrious.jpg', type: 'image', nsfw: false }],
            },
          ],
        },
      },
    })

    await nextTick()

    expect(wrapper.find('button[aria-label="Show Anima versions"]').exists()).toBe(true)
    expect(wrapper.find('button[aria-label="Show Illustrious versions"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('trattoNero_nitrattoANIMA.safetensors')

    await wrapper.get('button[aria-label="Show Illustrious versions"]').trigger('click')
    await nextTick()

    expect(wrapper.text()).toContain('trattoNero_holbein.safetensors')
    expect(wrapper.text()).not.toContain('trattoNero_nitrattoANIMA.safetensors')
  })

  it('cycles preview images with mouse back and forward buttons while open', async () => {
    const { default: AssetPreviewModal } = await import('../../src/components/asset-preview/AssetPreviewModal.vue')
    mount(AssetPreviewModal, {
      attachTo: document.body,
      props: {
        open: true,
        model: {
          id: 101,
          name: 'Mouse navigation model',
          type: 'Checkpoint',
          modelVersions: [
            {
              id: 201,
              name: 'v1',
              baseModel: 'Illustrious',
              images: [
                { url: 'https://example.test/first.jpg', type: 'image', nsfw: false },
                { url: 'https://example.test/second.jpg', type: 'image', nsfw: false },
              ],
            },
          ],
        },
      },
    })

    await nextTick()
    expect(document.body.textContent).toContain('1 / 2')

    const forwardEvent = new MouseEvent('mousedown', { button: 4, bubbles: true, cancelable: true })
    window.dispatchEvent(forwardEvent)
    await nextTick()

    expect(forwardEvent.defaultPrevented).toBe(true)
    expect(document.body.textContent).toContain('2 / 2')

    const forwardMouseup = new MouseEvent('mouseup', { button: 4, bubbles: true, cancelable: true })
    window.dispatchEvent(forwardMouseup)
    const forwardAuxclick = new MouseEvent('auxclick', { button: 4, bubbles: true, cancelable: true })
    window.dispatchEvent(forwardAuxclick)
    await nextTick()

    expect(forwardMouseup.defaultPrevented).toBe(true)
    expect(forwardAuxclick.defaultPrevented).toBe(true)
    expect(document.body.textContent).toContain('2 / 2')

    const backEvent = new MouseEvent('mousedown', { button: 3, bubbles: true, cancelable: true })
    window.dispatchEvent(backEvent)
    await nextTick()

    expect(backEvent.defaultPrevented).toBe(true)
    expect(document.body.textContent).toContain('1 / 2')

    const auxOnlyForwardEvent = new MouseEvent('auxclick', { button: 4, bubbles: true, cancelable: true })
    window.dispatchEvent(auxOnlyForwardEvent)
    await nextTick()

    expect(auxOnlyForwardEvent.defaultPrevented).toBe(true)
    expect(document.body.textContent).toContain('2 / 2')
  })

  it('opens on the requested initial image index', async () => {
    const { default: AssetPreviewModal } = await import('../../src/components/asset-preview/AssetPreviewModal.vue')
    mount(AssetPreviewModal, {
      attachTo: document.body,
      props: {
        open: true,
        initialImageIndex: 2,
        model: {
          id: 101,
          name: 'Indexed preview model',
          type: 'Checkpoint',
          modelVersions: [
            {
              id: 201,
              name: 'v1',
              baseModel: 'Illustrious',
              images: [
                { url: 'https://example.test/first.jpg', type: 'image', nsfw: false },
                { url: 'https://example.test/second.jpg', type: 'image', nsfw: false },
                { url: 'https://example.test/third.jpg', type: 'image', nsfw: false },
              ],
            },
          ],
        },
      },
    })

    await nextTick()

    expect(document.body.textContent).toContain('3 / 3')
    expect(document.body.textContent).toContain('3 of 3')
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
