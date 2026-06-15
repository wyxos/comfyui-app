// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
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

describe('AssetPreviewModal version ordering', () => {
  it('renders newest published versions first and selects the newest by default', async () => {
    const { default: AssetPreviewModal } = await import('../../src/components/asset-preview/AssetPreviewModal.vue')
    const wrapper = mount(AssetPreviewModal, {
      attachTo: document.body,
      props: {
        open: true,
        model: {
          id: 101,
          name: 'Version order model',
          type: 'Checkpoint',
          modelVersions: [
            {
              id: 201,
              name: 'Older version',
              publishedAt: '2024-03-01T00:00:00.000Z',
              files: [{ name: 'older.safetensors', type: 'Model', primary: true }],
              images: [{ url: 'https://example.test/older.jpg', type: 'image', nsfw: false }],
            },
            {
              id: 202,
              name: 'Latest version',
              publishedAt: '2024-05-01T00:00:00.000Z',
              files: [{ name: 'latest.safetensors', type: 'Model', primary: true }],
              images: [{ url: 'https://example.test/latest.jpg', type: 'image', nsfw: false }],
            },
          ],
        },
      },
    })

    await nextTick()

    const versionButtons = wrapper.findAll('ul li > button')

    expect(versionButtons[0]?.text()).toContain('Latest version')
    expect(wrapper.text()).toContain('latest.safetensors')
  })
})
