// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils'
import { computed, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory } from 'vue-router'
import { createAppRouter } from '../../src/router'

function installLocalStorageStub() {
  const values = new Map<string, string>()
  const storage = {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, String(value))
    }),
    removeItem: vi.fn((key: string) => {
      values.delete(key)
    }),
    clear: vi.fn(() => {
      values.clear()
    }),
  }
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: storage,
  })
  vi.stubGlobal('localStorage', storage)
}

describe('LibraryView route filters', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.doUnmock('../../src/composables/useAppSettings')
    vi.doUnmock('../../src/composables/useAssetDownloads')
    vi.unstubAllGlobals()
    installLocalStorageStub()
  })

  it('restores Library filters from the URL and writes filter changes back to it', async () => {
    const now = Date.now()
    const downloads = ref(
      Array.from({ length: 42 }, (_, index) => {
        const displayNumber = index + 1
        const suffix = String(displayNumber).padStart(2, '0')

        return {
          id: `restored-library-${suffix}`,
          state: 'complete',
          modelId: 5000 + displayNumber,
          modelName: `Restored Library LoRA ${suffix}`,
          modelType: 'LORA',
          modelNsfw: displayNumber === 42,
          modelMetadata: { nsfw: displayNumber === 42 },
          versionId: 6000 + displayNumber,
          versionName: `v${displayNumber}`,
          fileId: 7000 + displayNumber,
          fileName: `restored_library_${suffix}.safetensors`,
          baseModel: 'Pony',
          targetPath: `C:\\models\\loras\\restored_library_${suffix}.safetensors`,
          finishedAt: now - index,
          updatedAt: now - index,
          previewUrl: `/api/view?filename=restored-library-${suffix}.png`,
          previewPaths: [],
        }
      }),
    )

    vi.doMock('../../src/composables/useAssetDownloads', () => ({
      useAssetDownloads: () => ({
        downloads,
        watchedDownloads: ref([]),
        activeDownloads: computed(() => []),
        completedDownloads: computed(() => downloads.value.filter((item) => item.state === 'complete')),
        loading: ref(false),
        error: ref(''),
        refreshDownloads: vi.fn(),
        refreshWatchedDownloads: vi.fn(),
      }),
    }))
    vi.doMock('../../src/composables/useAppSettings', () => ({
      fetchAppSettings: vi.fn().mockResolvedValue({ includeNsfw: false, blurNsfwModels: true, blurNsfwMediaLevel: 4 }),
    }))

    const router = createAppRouter(createMemoryHistory())
    await router.push('/library?q=Restored&type=lora&source=all&base=Pony&nsfw=1&page=2')
    await router.isReady()
    const { default: LibraryView } = await import('../../src/views/LibraryView.vue')
    const wrapper = mount(LibraryView, {
      global: {
        plugins: [router],
      },
    })
    await flushPromises()

    expect(wrapper.text()).toContain('41-42 of 42')
    expect(wrapper.text()).toContain('Restored Library LoRA 42')
    expect((wrapper.get('[aria-label="Include NSFW library models"]').element as HTMLInputElement).checked).toBe(true)

    await wrapper.get('input[type="search"]').setValue('Restored Library LoRA 01')
    await flushPromises()

    expect(router.currentRoute.value.query).toMatchObject({
      q: 'Restored Library LoRA 01',
      type: 'lora',
      base: 'Pony',
      nsfw: '1',
    })
    expect(router.currentRoute.value.query.page).toBeUndefined()
    expect(wrapper.text()).toContain('1-1 of 1')

    await wrapper.get('[aria-label="Include NSFW library models"]').setValue(false)
    await flushPromises()

    expect(router.currentRoute.value.query.nsfw).toBe('0')
  })

  it('uses the Settings NSFW preference as the Library default when the URL does not override it', async () => {
    vi.doMock('../../src/composables/useAssetDownloads', () => ({
      useAssetDownloads: () => ({
        downloads: ref([]),
        watchedDownloads: ref([]),
        activeDownloads: computed(() => []),
        completedDownloads: computed(() => []),
        loading: ref(false),
        error: ref(''),
        refreshDownloads: vi.fn(),
        refreshWatchedDownloads: vi.fn(),
      }),
    }))
    vi.doMock('../../src/composables/useAppSettings', () => ({
      fetchAppSettings: vi.fn().mockResolvedValue({ includeNsfw: true, blurNsfwModels: true, blurNsfwMediaLevel: 4 }),
    }))

    const router = createAppRouter(createMemoryHistory())
    await router.push('/library')
    await router.isReady()
    const { default: LibraryView } = await import('../../src/views/LibraryView.vue')
    const wrapper = mount(LibraryView, {
      global: {
        plugins: [router],
      },
    })
    await flushPromises()

    expect((wrapper.get('[aria-label="Include NSFW library models"]').element as HTMLInputElement).checked).toBe(true)
  })
})
