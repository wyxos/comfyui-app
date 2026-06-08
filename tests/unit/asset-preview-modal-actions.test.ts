// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'

describe('AssetPreviewModal actions', () => {
  it('restores model safety to original metadata from the shadcn toggle group', async () => {
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
        editableSafety: true,
        compatibility: {
          modelNsfw: true,
          modelNsfwOverride: false,
        },
      },
    })

    expect(wrapper.get('[role="group"][aria-label="Safety override"]').exists()).toBe(true)
    await wrapper.get('button[aria-label="Use original safety metadata"]').trigger('click')
    await wrapper.get('button[aria-label="Save safety override"]').trigger('click')

    expect(wrapper.emitted('save-safety')).toEqual([
      [{ modelNsfw: null, modelNsfwOverride: null }],
    ])
  })

  it('repairs previews for the selected downloaded version from the modal', async () => {
    const repairDownloadPreviews = vi.fn()
    const download = { id: 'download-201', state: 'complete', fileName: 'model.safetensors' }
    const { default: AssetPreviewModal } = await import('../../src/components/asset-preview/AssetPreviewModal.vue')
    const wrapper = mount(AssetPreviewModal, {
      attachTo: document.body,
      props: {
        open: true,
        model: {
          id: 101,
          name: 'Repairable model',
          type: 'Checkpoint',
          modelVersions: [{ id: 201, name: 'v1', files: [], images: [] }],
        },
        showDownloadActions: true,
        downloadForVersion: vi.fn(() => download),
        repairDownloadPreviews,
      },
    })

    await wrapper.get('button[aria-label="Backfill previews for model.safetensors"]').trigger('click')

    expect(repairDownloadPreviews).toHaveBeenCalledWith(download)
  })

  it('emits image safety overrides for the active Civitai image', async () => {
    const { default: AssetPreviewModal } = await import('../../src/components/asset-preview/AssetPreviewModal.vue')
    const wrapper = mount(AssetPreviewModal, {
      attachTo: document.body,
      props: {
        open: true,
        model: {
          id: 101,
          name: 'Image safety model',
          type: 'Checkpoint',
          modelVersions: [
            {
              id: 201,
              name: 'v1',
              images: [{ id: 901, url: 'https://example.test/image.jpg', type: 'image', nsfw: false }],
            },
          ],
        },
        editableSafety: true,
        compatibility: {
          modelNsfw: false,
          modelNsfwOverride: null,
          imageSafetyOverrides: {},
        },
      },
    })

    expect(wrapper.text()).toContain('Image safety')
    await wrapper.get('button[aria-label="Mark image NSFW"]').trigger('click')
    await wrapper.get('button[aria-label="Save image safety override"]').trigger('click')

    expect(wrapper.emitted('save-image-safety')).toEqual([
      [{ imageKey: 'id:901', imageNsfw: true, imageNsfwOverride: true }],
    ])
  })
})
