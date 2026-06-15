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
    expect(wrapper.find('[aria-label="Filter assets by base model"]').exists()).toBe(false)

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

    const assetCard = wrapper.get('[data-asset-picker-card]')
    expect(assetCard.classes()).toContain('flex-col')
    expect(assetCard.classes()).toContain('min-h-[20rem]')
    expect(assetCard.find('.h-64').exists()).toBe(true)
    expect(assetCard.find('img').classes()).toContain('object-contain')
    expect(wrapper.find('button[aria-label="Preview asset"]').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('preview-asset.safetensors')
  })

  it('shows base model badges and cycles picker previews without selecting the asset', async () => {
    const wrapper = mount(HomeAssetPickerModal, {
      attachTo: document.body,
      props: {
        open: true,
        title: 'Select checkpoint',
        options: [
          {
            label: 'Multi preview checkpoint',
            value: 'multi-preview.safetensors',
            previewUrl: '/fallback-preview.png',
            previewPaths: [
              { url: '/preview-one.png', mediaType: 'image' },
              { url: '/preview-two.png', mediaType: 'image' },
            ],
            modelMetadata: {
              baseModel: 'Illustrious',
            },
            typeLabel: 'Checkpoint',
          },
        ],
      },
    })

    expect(wrapper.text()).toContain('Illustrious')
    expect(wrapper.text()).toContain('1 / 2')
    expect(wrapper.text()).not.toContain('Checkpoint')
    expect(wrapper.get('img').attributes('src')).toBe('/preview-one.png')

    await wrapper.get('button[aria-label="Next preview image for Multi preview checkpoint"]').trigger('click')

    expect(wrapper.emitted('select')).toBeUndefined()
    expect(wrapper.get('img').attributes('src')).toBe('/preview-two.png')
    expect(wrapper.text()).toContain('2 / 2')

    await wrapper.get('button[aria-label="Previous preview image for Multi preview checkpoint"]').trigger('click')

    expect(wrapper.get('img').attributes('src')).toBe('/preview-one.png')

    await wrapper.get('button[aria-label="Multi preview checkpoint"]').trigger('click')

    expect(wrapper.emitted('select')).toEqual([['multi-preview.safetensors']])
  })

  it('keeps NSFW models visible when the picker toggle is off', async () => {
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

    expect(wrapper.text()).toContain('2 available assets')
    expect(wrapper.text()).toContain('1-2 of 2')
    expect(wrapper.text()).toContain('SFW LoRA')
    expect(wrapper.text()).toContain('NSFW LoRA')
    expect(wrapper.findAll('span').filter((span) => span.text().trim() === 'NSFW')).toHaveLength(1)

    await wrapper.get('[aria-label="Include NSFW asset picker models"]').setValue(true)

    expect(wrapper.text()).toContain('2 available assets')
    expect(wrapper.text()).toContain('1-2 of 2')
    expect(wrapper.text()).toContain('NSFW LoRA')
    expect(wrapper.findAll('span').filter((span) => span.text().trim() === 'NSFW')).toHaveLength(1)
  })

  it('filters visible assets by available base model metadata', async () => {
    const wrapper = mount(HomeAssetPickerModal, {
      attachTo: document.body,
      props: {
        open: true,
        title: 'Select LoRA',
        options: [
          {
            label: 'Pony detail LoRA',
            value: 'pony-detail.safetensors',
            modelMetadata: {
              baseModel: 'Pony',
            },
            typeLabel: 'LoRA',
          },
          {
            label: 'Pony texture LoRA',
            value: 'pony-texture.safetensors',
            modelMetadata: {
              compatibleBaseModels: ['Pony'],
            },
            typeLabel: 'LoRA',
          },
          {
            label: 'Anima glow LoRA',
            value: 'anima-glow.safetensors',
            modelMetadata: {
              baseModel: 'Anima',
            },
            typeLabel: 'LoRA',
          },
        ],
      },
    })

    const filterGroup = wrapper.get('[aria-label="Filter assets by base model"]')

    expect(filterGroup.text()).toContain('All 3')
    expect(filterGroup.text()).toContain('Pony 2')
    expect(filterGroup.text()).toContain('Anima 1')
    expect(wrapper.get('button[aria-label="Show all base model assets"]').attributes('aria-pressed')).toBe('true')

    await wrapper.get('button[aria-label="Show Pony assets"]').trigger('click')

    expect(wrapper.text()).toContain('2 available assets')
    expect(wrapper.text()).toContain('1-2 of 2')
    expect(wrapper.text()).toContain('Pony detail LoRA')
    expect(wrapper.text()).toContain('Pony texture LoRA')
    expect(wrapper.text()).not.toContain('Anima glow LoRA')
    expect(wrapper.get('button[aria-label="Show Pony assets"]').attributes('aria-pressed')).toBe('true')

    await wrapper.get('button[aria-label="Show all base model assets"]').trigger('click')

    expect(wrapper.text()).toContain('3 available assets')
    expect(wrapper.text()).toContain('Anima glow LoRA')
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
