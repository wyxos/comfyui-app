// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils'
import { computed, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory } from 'vue-router'
import { BLACKLIST_STORAGE_KEY } from '../../src/views/assets/assetViewTypes'
import { createAppRouter } from '../../src/router'
import { createMockModel } from '../fixtures/mockApi'
import { jsonResponse } from '../fixtures/mockApiData'

function installLocalStorageStub() {
  const values = new Map<string, string>()
  const storage = {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, String(value))
    }),
    removeItem: vi.fn((key: string) => values.delete(key)),
    clear: vi.fn(() => values.clear()),
  }
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: storage,
  })
  vi.stubGlobal('localStorage', storage)
  return storage
}

describe('LibraryView filters', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.doUnmock('../../src/composables/useAppSettings')
    vi.doUnmock('../../src/composables/useAssetDownloads')
    vi.unstubAllGlobals()
    installLocalStorageStub()
  })

  it('paginates local models with NSFW items hidden until the toggle is on', async () => {
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
              nsfwLevel: modelNsfw ? 8 : 1,
            },
          ],
        }
      }),
    )
    const refreshDownloads = vi.fn()

    vi.doMock('../../src/composables/useAssetDownloads', () => ({
      useAssetDownloads: () => ({
        downloads,
        watchedDownloads: ref([]),
        activeDownloads: computed(() => []),
        completedDownloads: computed(() => downloads.value.filter((item) => item.state === 'complete')),
        loading: ref(false),
        error: ref(''),
        refreshDownloads,
        refreshWatchedDownloads: vi.fn(),
      }),
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

    expect(wrapper.text()).toContain('46 library items, 23 checkpoints, 23 LoRAs')
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
    expect(wrapper.text()).not.toContain('Library model 46')
    expect((wrapper.get('[aria-label="Include NSFW library models"]').element as HTMLInputElement).checked).toBe(false)
    await wrapper.get('[aria-label="Include NSFW library models"]').setValue(true)
    expect(wrapper.text()).toContain('1-40 of 46')
    await wrapper.get('[aria-label="Next library page"]').trigger('click')
    expect(wrapper.text()).toContain('41-46 of 46')
    expect(wrapper.text()).toContain('Library model 46')
    expect(wrapper.text()).toContain('NSFW')
  })

  it('shows watched Civitai models in the library and filters to watched items only', async () => {
    const now = Date.now()
    const downloads = ref([
      {
        id: 'downloaded-library-lora',
        state: 'complete',
        modelId: 101,
        modelName: 'Downloaded Library LoRA',
        modelType: 'LORA',
        modelNsfw: false,
        modelMetadata: { nsfw: false },
        versionId: 201,
        versionName: 'v1',
        fileId: 301,
        fileName: 'downloaded_library_lora.safetensors',
        baseModel: 'Pony',
        targetPath: 'C:\\models\\loras\\downloaded_library_lora.safetensors',
        finishedAt: now - 10,
        updatedAt: now - 10,
        previewUrl: '/api/view?filename=downloaded-library.png',
        previewPaths: [],
      },
    ])
    const watchedDownloads = ref([
      {
        id: 'watched-library-lora',
        state: 'watching',
        modelId: 102,
        modelName: 'Watched Library LoRA',
        modelType: 'LORA',
        modelNsfw: false,
        modelMetadata: { nsfw: false },
        versionId: 202,
        versionName: 'early',
        fileId: 302,
        fileName: 'watched_library_lora.safetensors',
        baseModel: 'Illustrious',
        previewImage: { url: '/mock-assets/watched-library.png', type: 'image' },
        previewImages: [{ url: '/mock-assets/watched-library.png', type: 'image' }],
        updatedAt: now,
      },
      {
        id: 'cancelled-watch',
        state: 'cancelled',
        modelId: 103,
        modelName: 'Cancelled Watch LoRA',
        modelType: 'LORA',
        modelNsfw: false,
        versionId: 203,
        versionName: 'cancelled',
        fileId: 303,
        fileName: 'cancelled_watch_lora.safetensors',
        baseModel: 'Pony',
        updatedAt: now + 1,
      },
    ])
    const refreshDownloads = vi.fn()
    const refreshWatchedDownloads = vi.fn()
    const useAssetDownloads = vi.fn(() => ({
      downloads,
      watchedDownloads,
      activeDownloads: computed(() => []),
      completedDownloads: computed(() => downloads.value.filter((item) => item.state === 'complete')),
      loading: ref(false),
      error: ref(''),
      refreshDownloads,
      refreshWatchedDownloads,
    }))

    vi.doMock('../../src/composables/useAssetDownloads', () => ({
      useAssetDownloads,
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

    expect(useAssetDownloads).toHaveBeenCalledWith({ includeWatched: true })
    expect(refreshDownloads).toHaveBeenCalled()
    expect(refreshWatchedDownloads).toHaveBeenCalled()
    expect(wrapper.text()).toContain('Downloaded Library LoRA')
    expect(wrapper.text()).toContain('Watched Library LoRA')
    expect(wrapper.text()).not.toContain('Cancelled Watch LoRA')
    expect(wrapper.text()).toContain('1 watched')

    await wrapper.get('[aria-label="Show watched library items only"]').trigger('click')

    expect(wrapper.text()).toContain('1-1 of 1')
    expect(wrapper.text()).toContain('Watched Library LoRA')
    expect(wrapper.text()).not.toContain('Downloaded Library LoRA')
  })

  it('shows hidden Civitai models in the library hidden filter and restores them from storage', async () => {
    const hiddenModel = createMockModel({ id: 505, name: 'Hidden Library LoRA', nsfw: false })
    const visibleModel = createMockModel({ id: 606, name: 'Visible Library LoRA' })
    window.localStorage.setItem(BLACKLIST_STORAGE_KEY, JSON.stringify([505]))
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://companion.test')

      if (url.pathname === '/api/settings/app') {
        return jsonResponse({ ok: true, includeNsfw: false })
      }

      if (url.pathname === '/api/controlnets') {
        return jsonResponse({ ok: true, controlNets: [] })
      }

      if (url.pathname === '/api/civitai/models') {
        const ids = new Set((url.searchParams.get('ids') ?? '').split(','))
        return jsonResponse({
          items: [hiddenModel, visibleModel].filter((model) => ids.has(String(model.id))),
          metadata: { totalItems: 1, totalPages: 1 },
        })
      }

      return jsonResponse({ ok: false, message: `Unhandled ${url.pathname}` }, 500)
    })
    vi.stubGlobal('fetch', fetchMock)

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
      useAssetDownloadSummary: () => ({
        counts: computed(() => ({
          active: 0,
          attention: 0,
          visibleComplete: 0,
        })),
      }),
    }))

    const router = createAppRouter(createMemoryHistory())
    await router.push('/library?source=hidden')
    await router.isReady()
    const { default: LibraryView } = await import('../../src/views/LibraryView.vue')
    const wrapper = mount(LibraryView, {
      global: {
        plugins: [router],
      },
    })
    await flushPromises()

    const hiddenCall = fetchMock.mock.calls
      .map(([input]) => new URL(String(input), 'http://companion.test'))
      .find((url) => url.pathname === '/api/civitai/models')
    expect(hiddenCall?.searchParams.get('ids')).toBe('505')
    expect(hiddenCall?.searchParams.get('nsfw')).toBe('true')
    expect(wrapper.text()).toContain('Hidden Library LoRA')
    expect(wrapper.text()).not.toContain('Visible Library LoRA')
    expect(wrapper.text()).toContain('Hidden')
    expect(wrapper.text()).toContain('1 hidden')

    await wrapper.get('[aria-label="Show Hidden Library LoRA"]').trigger('click')

    expect(window.localStorage.getItem(BLACKLIST_STORAGE_KEY)).toBe('[]')
    expect(wrapper.text()).not.toContain('Hidden Library LoRA')
    expect(wrapper.text()).toContain('No hidden models match the current filters.')
  })

  it('keeps hidden NSFW Library models visible when the local toggle is off', async () => {
    const hiddenModel = createMockModel({ id: 505, name: 'Hidden NSFW Library LoRA', nsfw: true })
    window.localStorage.setItem(BLACKLIST_STORAGE_KEY, JSON.stringify([505]))
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://companion.test')
      if (url.pathname === '/api/settings/app') {
        return jsonResponse({ ok: true, includeNsfw: false })
      }
      if (url.pathname === '/api/controlnets') {
        return jsonResponse({ ok: true, controlNets: [] })
      }
      if (url.pathname === '/api/civitai/models') {
        return jsonResponse({
          items: [hiddenModel],
          metadata: { totalItems: 1, totalPages: 1 },
        })
      }
      return jsonResponse({ ok: false, message: `Unhandled ${url.pathname}` }, 500)
    })
    vi.stubGlobal('fetch', fetchMock)
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
      useAssetDownloadSummary: () => ({
        counts: computed(() => ({
          active: 0,
          attention: 0,
          visibleComplete: 0,
        })),
      }),
    }))

    const router = createAppRouter(createMemoryHistory())
    await router.push('/library?source=hidden')
    await router.isReady()
    const { default: LibraryView } = await import('../../src/views/LibraryView.vue')
    const wrapper = mount(LibraryView, {
      global: {
        plugins: [router],
      },
    })
    await flushPromises()
    expect(wrapper.text()).toContain('Hidden NSFW Library LoRA')
    expect(wrapper.text()).toContain('1-1 of 1')
    expect((wrapper.get('[aria-label="Include NSFW library models"]').element as HTMLInputElement).checked).toBe(false)
    await wrapper.get('[aria-label="Include NSFW library models"]').setValue(true)
    expect(wrapper.text()).toContain('Hidden NSFW Library LoRA')
    expect(wrapper.text()).toContain('1-1 of 1')
  })

  it('keeps hidden model id batches inside the proxy query limit', async () => {
    const hiddenIds = Array.from({ length: 65 }, (_, index) => 7_100_000 + index)
    const hiddenModels = hiddenIds.map((id, index) =>
      createMockModel({ id, name: `Chunked Hidden LoRA ${String(index + 1).padStart(2, '0')}` }),
    )
    window.localStorage.setItem(BLACKLIST_STORAGE_KEY, JSON.stringify(hiddenIds))
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://companion.test')

      if (url.pathname === '/api/settings/app') {
        return jsonResponse({ ok: true, includeNsfw: false })
      }

      if (url.pathname === '/api/controlnets') {
        return jsonResponse({ ok: true, controlNets: [] })
      }

      if (url.pathname === '/api/civitai/models') {
        const ids = new Set((url.searchParams.get('ids') ?? '').split(','))
        return jsonResponse({
          items: hiddenModels.filter((model) => ids.has(String(model.id))),
          metadata: { totalItems: ids.size, totalPages: 1 },
        })
      }

      return jsonResponse({ ok: false, message: `Unhandled ${url.pathname}` }, 500)
    })
    vi.stubGlobal('fetch', fetchMock)

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
      useAssetDownloadSummary: () => ({
        counts: computed(() => ({
          active: 0,
          attention: 0,
          visibleComplete: 0,
        })),
      }),
    }))

    const router = createAppRouter(createMemoryHistory())
    await router.push('/library?source=hidden')
    await router.isReady()
    const { default: LibraryView } = await import('../../src/views/LibraryView.vue')
    const wrapper = mount(LibraryView, {
      global: {
        plugins: [router],
      },
    })
    await flushPromises()

    const hiddenCalls = fetchMock.mock.calls
      .map(([input]) => new URL(String(input), 'http://companion.test'))
      .filter((url) => url.pathname === '/api/civitai/models')
    expect(hiddenCalls.length).toBeGreaterThan(1)
    for (const call of hiddenCalls) {
      expect(call.searchParams.get('ids')?.length).toBeLessThanOrEqual(500)
      expect(call.searchParams.get('nsfw')).toBe('true')
    }
    expect(wrapper.text()).toContain('65 hidden')
    expect(wrapper.text()).toContain('1-40 of 65')
  })

  it('shows when stored hidden ids are not all loadable', async () => {
    const loadableHiddenModel = createMockModel({ id: 7_200_001, name: 'Loadable Hidden LoRA' })
    window.localStorage.setItem(BLACKLIST_STORAGE_KEY, JSON.stringify([7_200_001, 7_200_002]))
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://companion.test')

      if (url.pathname === '/api/settings/app') {
        return jsonResponse({ ok: true, includeNsfw: false })
      }

      if (url.pathname === '/api/controlnets') {
        return jsonResponse({ ok: true, controlNets: [] })
      }

      if (url.pathname === '/api/civitai/models') {
        return jsonResponse({
          items: [loadableHiddenModel],
          metadata: { totalItems: 1, totalPages: 1 },
        })
      }

      return jsonResponse({ ok: false, message: `Unhandled ${url.pathname}` }, 500)
    })
    vi.stubGlobal('fetch', fetchMock)

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
      useAssetDownloadSummary: () => ({
        counts: computed(() => ({
          active: 0,
          attention: 0,
          visibleComplete: 0,
        })),
      }),
    }))

    const router = createAppRouter(createMemoryHistory())
    await router.push('/library?source=hidden')
    await router.isReady()
    const { default: LibraryView } = await import('../../src/views/LibraryView.vue')
    const wrapper = mount(LibraryView, {
      global: {
        plugins: [router],
      },
    })
    await flushPromises()

    expect(wrapper.text()).toContain('Loadable Hidden LoRA')
    expect(wrapper.text()).toContain('1 of 2 hidden loadable')
  })
})
