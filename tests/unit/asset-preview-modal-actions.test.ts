// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { toastError, toastSuccess } = vi.hoisted(() => ({
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}))

vi.mock('vue-sonner', () => ({
  toast: {
    error: toastError,
    success: toastSuccess,
  },
}))

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

describe('AssetPreviewModal actions', () => {
  beforeEach(() => {
    toastError.mockClear()
    toastSuccess.mockClear()
  })

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
    expect(wrapper.find('button[aria-label="Save safety override"]').exists()).toBe(false)
    await wrapper.get('button[aria-label="Use original safety metadata"]').trigger('click')

    expect(wrapper.emitted('save-safety')).toEqual([
      [{ modelNsfw: null, modelNsfwOverride: null }],
    ])
  })

  it('shows Sonner feedback after an autosaved safety override succeeds or fails', async () => {
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
          modelNsfw: false,
          modelNsfwOverride: null,
        },
      },
    })

    await wrapper.get('button[aria-label="Mark NSFW"]').trigger('click')
    await wrapper.setProps({ savingSafety: true })
    await wrapper.setProps({ savingSafety: false })

    expect(toastSuccess).toHaveBeenCalledWith('Safety saved.')

    await wrapper.get('button[aria-label="Mark safe"]').trigger('click')
    await wrapper.setProps({ savingSafety: true })
    await wrapper.setProps({ safetyError: 'Could not save safety override.' })

    expect(toastError).toHaveBeenCalledWith('Could not save safety override.')
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

    await wrapper.get('button[aria-label="Show feed"]').trigger('click')

    expect(wrapper.find('button[aria-label="Backfill previews for model.safetensors"]').exists()).toBe(false)
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
    expect(wrapper.find('button[aria-label="Save image safety override"]').exists()).toBe(false)

    expect(wrapper.emitted('save-image-safety')).toEqual([
      [{ imageKey: 'id:901', imageNsfw: true, imageNsfwOverride: true }],
    ])
  })
})
