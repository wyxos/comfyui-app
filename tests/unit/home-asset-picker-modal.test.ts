// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'

import HomeAssetPickerModal from '../../src/views/home/HomeAssetPickerModal.vue'

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
  })
}

describe('HomeAssetPickerModal', () => {
  it('defaults to forty assets per page', async () => {
    const options = Array.from({ length: 45 }, (_, index) => {
      const id = index + 1
      return {
        label: `Asset ${id}`,
        value: `asset-${id}.safetensors`,
      }
    })
    const wrapper = mount(HomeAssetPickerModal, {
      attachTo: document.body,
      props: {
        open: true,
        title: 'Select checkpoint',
        options,
      },
    })

    expect(wrapper.text()).toContain('1-40 of 45')
    expect(wrapper.text()).toContain('Asset 40')
    expect(wrapper.text()).not.toContain('Asset 41')

    await wrapper.get('button[aria-label="Next asset picker page"]').trigger('click')

    expect(wrapper.text()).toContain('41-45 of 45')
    expect(wrapper.text()).toContain('Asset 41')
  })

  it('renders asset picker cards with top previews and bottom text', () => {
    const wrapper = mount(HomeAssetPickerModal, {
      attachTo: document.body,
      props: {
        open: true,
        title: 'Select checkpoint',
        options: [
          {
            label: 'Preview asset',
            value: 'preview-asset.safetensors',
            previewUrl: '/mock-preview.png',
          },
        ],
      },
    })

    const assetCard = wrapper.get('button[aria-label="Preview asset"]')
    expect(assetCard.classes()).toContain('flex-col')
    expect(assetCard.classes()).toContain('min-h-[20rem]')
    expect(assetCard.find('.h-64').exists()).toBe(true)
    expect(assetCard.find('img').classes()).toContain('object-contain')
    expect(wrapper.text()).not.toContain('preview-asset.safetensors')
  })

  it('filters NSFW models by default and exposes badges when included', async () => {
    const wrapper = mount(HomeAssetPickerModal, {
      attachTo: document.body,
      props: {
        open: true,
        title: 'Select LoRA',
        options: [
          {
            label: 'SFW LoRA',
            value: 'sfw.safetensors',
            modelNsfw: false,
            typeLabel: 'LoRA',
          },
          {
            label: 'NSFW LoRA',
            value: 'nsfw.safetensors',
            modelNsfw: true,
            typeLabel: 'LoRA',
          },
        ],
      },
    })

    expect(wrapper.text()).toContain('1 available asset')
    expect(wrapper.text()).toContain('1-1 of 1')
    expect(wrapper.text()).toContain('SFW LoRA')
    expect(wrapper.text()).not.toContain('NSFW LoRA')

    await wrapper.get('[aria-label="Include NSFW asset picker models"]').setValue(true)

    expect(wrapper.text()).toContain('2 available assets')
    expect(wrapper.text()).toContain('1-2 of 2')
    expect(wrapper.text()).toContain('NSFW LoRA')
    expect(wrapper.findAll('span').filter((span) => span.text().trim() === 'NSFW')).toHaveLength(1)
  })

  it('uses the saved NSFW default when opened', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ ok: true, includeNsfw: true })))

    const wrapper = mount(HomeAssetPickerModal, {
      attachTo: document.body,
      props: {
        open: true,
        title: 'Select LoRA',
        options: [
          {
            label: 'NSFW LoRA',
            value: 'nsfw.safetensors',
            modelNsfw: true,
            typeLabel: 'LoRA',
          },
        ],
      },
    })

    await flushPromises()

    expect(wrapper.text()).toContain('NSFW LoRA')
    expect((wrapper.get('[aria-label="Include NSFW asset picker models"]').element as HTMLInputElement).checked).toBe(true)
  })

  it('searches, paginates, and emits the selected asset', async () => {
    const options = Array.from({ length: 25 }, (_, index) => {
      const id = index + 1
      return {
        label: `Asset ${id}`,
        value: `asset-${id}.safetensors`,
      }
    })
    const wrapper = mount(HomeAssetPickerModal, {
      attachTo: document.body,
      props: {
        open: true,
        title: 'Select checkpoint',
        options,
        pageSize: 4,
      },
    })

    expect(wrapper.text()).toContain('1-4 of 25')
    expect(wrapper.text()).toContain('Asset 1')
    expect(wrapper.text()).not.toContain('Asset 5')

    await wrapper.get('button[aria-label="Next asset picker page"]').trigger('click')

    expect(wrapper.text()).toContain('5-8 of 25')
    expect(wrapper.text()).toContain('Asset 5')

    await wrapper.get('input[type="search"]').setValue('Asset 25')

    expect(wrapper.text()).toContain('1 matching asset')
    expect(wrapper.text()).toContain('1-1 of 1')
    expect(wrapper.text()).toContain('Asset 25')

    await wrapper.findAll('button').find((button) => button.attributes('aria-label') === 'Asset 25')?.trigger('click')

    expect(wrapper.emitted('select')).toEqual([['asset-25.safetensors']])
    expect(wrapper.emitted('close')).toHaveLength(1)
  })
})
