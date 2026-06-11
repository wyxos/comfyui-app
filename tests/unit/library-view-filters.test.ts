// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils'
import { computed, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('LibraryView filters', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('paginates and filters local models by type, base model, and safety', async () => {
    const now = Date.now()
    const downloads = ref(
      Array.from({ length: 46 }, (_, index) => {
        const displayNumber = index + 1
        const suffix = String(displayNumber).padStart(2, '0')
        const modelType = index % 2 === 0 ? 'LORA' : 'Checkpoint'
        const modelNsfw = displayNumber === 46
        const baseModel = displayNumber % 3 === 0 ? 'Pony' : displayNumber % 3 === 1 ? 'Illustrious' : 'Anima'

        return {
          id: `library-download-${suffix}`,
          state: 'complete',
          modelId: 1000 + displayNumber,
          modelName: `Library model ${suffix}`,
          modelType,
          modelNsfw,
          modelMetadata: { nsfw: modelNsfw },
          versionId: 2000 + displayNumber,
          versionName: `v${displayNumber}`,
          fileId: 3000 + displayNumber,
          fileName: `library_model_${suffix}.safetensors`,
          baseModel,
          targetPath: `C:\\models\\${modelType.toLowerCase()}\\library_model_${suffix}.safetensors`,
          finishedAt: now - index,
          updatedAt: now - index,
          previewUrl: `/api/view?filename=library-${suffix}.png`,
          previewPaths: [
            {
              url: `/api/civitai/downloads/library-download-${suffix}/previews/0`,
              mediaType: displayNumber === 1 ? 'video' : 'image',
            },
          ],
        }
      }),
    )
    const refreshDownloads = vi.fn()

    vi.doMock('../../src/composables/useAssetDownloads', () => ({
      useAssetDownloads: () => ({
        downloads,
        activeDownloads: computed(() => []),
        completedDownloads: computed(() => downloads.value.filter((item) => item.state === 'complete')),
        loading: ref(false),
        error: ref(''),
        refreshDownloads,
      }),
    }))

    const { default: LibraryView } = await import('../../src/views/LibraryView.vue')
    const wrapper = mount(LibraryView)
    await flushPromises()

    expect(wrapper.text()).toContain('46 local models, 23 checkpoints, 23 LoRAs')
    expect(wrapper.text()).toContain('1-40 of 45')
    expect(wrapper.text()).toContain('Library model 01')
    expect(wrapper.text()).not.toContain('library_model_01.safetensors')
    expect(wrapper.text()).not.toContain('Downloaded')
    expect(wrapper.find('video').exists()).toBe(true)
    const firstCard = wrapper.get('[aria-label="Open Library model 01 preview"]')
    expect(firstCard.classes()).toContain('min-h-[20rem]')
    expect(firstCard.find('.h-64').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('Library model 41')
    expect(wrapper.text()).not.toContain('Library model 46')
    expect(refreshDownloads).toHaveBeenCalled()

    await wrapper.get('[aria-label="Show Pony base models"]').trigger('click')
    expect(wrapper.text()).toContain('1-15 of 15')
    expect(wrapper.text()).toContain('Library model 03')
    expect(wrapper.text()).not.toContain('Library model 01')

    await wrapper.get('[aria-label="Next library page"]').trigger('click')
    expect(wrapper.text()).toContain('1-15 of 15')
    await wrapper.get('[aria-label="Show All bases base models"]').trigger('click')
    await wrapper.get('[aria-label="Next library page"]').trigger('click')
    expect(wrapper.text()).toContain('41-45 of 45')
    expect(wrapper.text()).toContain('Library model 41')
    await wrapper.get('[aria-label="Include NSFW library models"]').setValue(true)
    expect(wrapper.text()).toContain('1-40 of 46')
    await wrapper.get('[aria-label="Next library page"]').trigger('click')
    expect(wrapper.text()).toContain('41-46 of 46')
    expect(wrapper.text()).toContain('Library model 46')
    expect(wrapper.text()).toContain('NSFW')
  })
})
