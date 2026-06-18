// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import LibraryModelCard from '../../src/views/library/LibraryModelCard.vue'
import type { LibraryModelItem } from '../../src/views/library/libraryModelHelpers'

function carouselLibraryItem(): LibraryModelItem {
  return {
    id: 'download:carousel-library',
    itemKind: 'lora',
    librarySource: 'downloaded',
    modelId: 101,
    modelName: 'Library Carousel LoRA',
    modelType: 'LORA',
    modelNsfw: false,
    modelMetadata: { nsfw: false },
    versionId: 201,
    versionName: 'v1',
    fileName: 'library-carousel.safetensors',
    previewUrl: null,
    previewPaths: [
      { id: 1, url: '/previews/library-first.png', mediaType: 'image', nsfwLevel: 1 },
      { id: 2, url: '/previews/library-second.png', mediaType: 'image', nsfwLevel: 1 },
      { id: 3, url: '/previews/library-third.png', mediaType: 'image', nsfwLevel: 1 },
    ],
    updatedAt: 10,
  } as LibraryModelItem
}

function pendingPreviewLibraryItem(): LibraryModelItem {
  return {
    id: 'download:pending-preview-library',
    itemKind: 'lora',
    librarySource: 'downloaded',
    modelId: 102,
    modelName: 'Library Pending Preview LoRA',
    modelType: 'LORA',
    modelNsfw: false,
    modelMetadata: { nsfw: false },
    versionId: 202,
    versionName: 'v1',
    fileName: 'library-pending-preview.safetensors',
    previewUrl: null,
    previewPaths: [],
    previewBackfillPending: true,
    updatedAt: 10,
  } as LibraryModelItem
}

describe('LibraryModelCard', () => {
  it('cycles card previews and shows the active preview count without opening the modal', async () => {
    const item = carouselLibraryItem()
    const wrapper = mount(LibraryModelCard, {
      props: { item },
    })

    expect(wrapper.get('img[alt="Library Carousel LoRA preview"]').attributes('src')).toBe('/previews/library-first.png')
    expect(wrapper.text()).toContain('1 / 3')

    await wrapper.get('button[aria-label="Next preview image for Library Carousel LoRA"]').trigger('click')

    expect(wrapper.emitted('open')).toBeUndefined()
    expect(wrapper.get('img[alt="Library Carousel LoRA preview"]').attributes('src')).toBe('/previews/library-second.png')
    expect(wrapper.text()).toContain('2 / 3')

    await wrapper.get('button[aria-label="Previous preview image for Library Carousel LoRA"]').trigger('click')

    expect(wrapper.get('img[alt="Library Carousel LoRA preview"]').attributes('src')).toBe('/previews/library-first.png')

    await wrapper.get('[aria-label="Open Library Carousel LoRA preview"]').trigger('click')

    expect(wrapper.emitted('open')).toEqual([[item]])
  })

  it('reserves the media slot with a spinner while a missing preview is loading', () => {
    const wrapper = mount(LibraryModelCard, {
      props: { item: pendingPreviewLibraryItem() },
    })

    expect(wrapper.text()).toContain('Loading preview image...')
    expect(wrapper.text()).not.toContain('No preview available')
  })
})
