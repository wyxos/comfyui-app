// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils'
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

describe('AssetPreviewModal sidebar layout', () => {
  it('opens on the newest sorted model version when no version is explicit', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ items: [] }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )))

    const { default: AssetPreviewModal } = await import('../../src/components/asset-preview/AssetPreviewModal.vue')
    const wrapper = mount(AssetPreviewModal, {
      attachTo: document.body,
      props: {
        open: true,
        model: {
          id: 101,
          name: 'Sorted model',
          type: 'Checkpoint',
          modelVersions: [
            {
              id: 201,
              name: 'Older',
              baseModel: 'Illustrious',
              publishedAt: '2024-01-01T00:00:00.000Z',
              files: [{ name: 'older.safetensors', type: 'Model', primary: true }],
              images: [{ url: 'https://example.test/older.jpg', type: 'image', nsfw: false }],
            },
            {
              id: 202,
              name: 'Newer',
              baseModel: 'Illustrious',
              publishedAt: '2024-05-01T00:00:00.000Z',
              files: [{ name: 'newer.safetensors', type: 'Model', primary: true }],
              images: [{ url: 'https://example.test/newer.jpg', type: 'image', nsfw: false }],
            },
          ],
        },
      },
    })

    await flushPromises()

    expect(wrapper.get('[data-test="asset-preview-modal-subtitle"]').text()).toBe('Newer - Illustrious')
    expect(wrapper.get('[data-test="asset-preview-selected-version-file-name"]').text()).toBe('newer.safetensors')
  })

  it('uses compact model detail rows and removes redundant sidebar copy', async () => {
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
          name: 'Compact detail model',
          type: 'LORA',
          creator: { username: 'samplemaker' },
          stats: { downloadCount: 1234 },
          modelVersions: [
            {
              id: 201,
              name: 'v1',
              baseModel: 'Pony',
              files: [{ name: 'compact-detail.safetensors', type: 'Model', primary: true }],
              images: [{ url: 'https://example.test/compact.jpg', type: 'image', nsfw: false }],
            },
          ],
        },
        showDownloadActions: true,
        downloadForVersion: () => ({ id: 'download-201', state: 'complete', fileName: 'compact-detail.safetensors' }),
        downloadStatusLabel: () => 'Downloaded',
        queueAssetDownload: vi.fn(),
        deleteAssetDownload: vi.fn(),
        modelDownloadKey: () => '101:201',
      },
    })

    await flushPromises()

    expect(wrapper.find('[data-test="asset-preview-kind-label"]').exists()).toBe(false)
    expect(wrapper.get('[data-test="asset-preview-model-type-badge"]').text()).toBe('LORA')
    expect(wrapper.findAll('[data-test="asset-preview-model-detail-row"]').map((row) => [
      row.get('dt').text(),
      row.get('dd').text(),
    ])).toEqual([
      ['Type', 'LORA'],
      ['Base model', 'Pony'],
      ['Creator', 'samplemaker'],
      ['Stats', '1,234 downloads'],
    ])
    expect(wrapper.text()).toContain('Selected version')
    expect(wrapper.text()).not.toContain('Selected version file')
    expect(wrapper.text()).not.toContain('Downloaded')
  })
})
