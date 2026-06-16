// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils'
import { computed, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory } from 'vue-router'
import { createAppRouter } from '../../src/router'
import { BLACKLIST_STORAGE_KEY } from '../../src/views/assets/assetViewTypes'
import { createMockModel } from '../fixtures/mockApi'
import { jsonResponse } from '../fixtures/mockApiData'

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

describe('LibraryView hidden source filtering', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.unstubAllGlobals()
    installLocalStorageStub()
  })

  it('excludes hidden models from All and shows them only under Hidden', async () => {
    const hiddenModel = createMockModel({ id: 505, name: 'Hidden Library LoRA', nsfw: false })
    const downloads = ref([
      {
        id: 'visible-library-lora',
        state: 'complete',
        modelId: 606,
        modelName: 'Visible Library LoRA',
        modelType: 'LORA',
        modelNsfw: false,
        modelMetadata: { nsfw: false },
        versionId: 707,
        versionName: 'v1',
        fileId: 808,
        fileName: 'visible_library_lora.safetensors',
        baseModel: 'Pony',
        targetPath: 'C:\\models\\loras\\visible_library_lora.safetensors',
        finishedAt: 20,
        updatedAt: 20,
        previewUrl: null,
        previewPaths: [],
      },
    ])
    window.localStorage.setItem(BLACKLIST_STORAGE_KEY, JSON.stringify([505]))
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://companion.test')

      if (url.pathname === '/api/settings/app') {
        return jsonResponse({ ok: true, includeNsfw: true, blurNsfwModels: false, blurNsfwMediaLevel: null })
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

    const router = createAppRouter(createMemoryHistory())
    await router.push('/library?source=all')
    await router.isReady()
    const { default: LibraryView } = await import('../../src/views/LibraryView.vue')
    const wrapper = mount(LibraryView, {
      global: {
        plugins: [router],
      },
    })
    await flushPromises()

    expect(wrapper.text()).toContain('Visible Library LoRA')
    expect(wrapper.text()).not.toContain('Hidden Library LoRA')
    expect(wrapper.text()).toContain('1 library items')
    expect(wrapper.text()).toContain('1 hidden')
    expect(wrapper.text()).toContain('1-1 of 1')

    await wrapper.get('[aria-label="Show hidden library items only"]').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Hidden Library LoRA')
    expect(wrapper.text()).not.toContain('Visible Library LoRA')
    expect(wrapper.text()).toContain('1-1 of 1')
  })
})
