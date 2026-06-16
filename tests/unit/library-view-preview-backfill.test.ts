// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils'
import { computed, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory } from 'vue-router'
import { createAppRouter } from '../../src/router'
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
}

describe('LibraryView preview backfill', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.doUnmock('../../src/composables/useAppSettings')
    vi.doUnmock('../../src/composables/useAssetDownloads')
    vi.unstubAllGlobals()
    installLocalStorageStub()
  })

  it('backfills downloaded card previews without relying on the NSFW library toggle', async () => {
    const now = Date.now()
    const downloads = ref([
      {
        id: 'downloaded-without-local-preview',
        state: 'complete',
        modelId: 9001,
        modelName: 'Downloaded Preview Backfill LoRA',
        modelType: 'LORA',
        modelNsfw: false,
        modelMetadata: { nsfw: false },
        versionId: 9002,
        versionName: 'v1',
        fileId: 9003,
        fileName: 'downloaded_preview_backfill.safetensors',
        baseModel: 'Illustrious',
        targetPath: 'C:\\models\\loras\\downloaded_preview_backfill.safetensors',
        finishedAt: now,
        updatedAt: now,
        previewUrl: null,
        previewPaths: [],
      },
    ])
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://companion.test')

      if (url.pathname === '/api/settings/app') {
        return jsonResponse({ ok: true, includeNsfw: false, blurNsfwContent: true })
      }

      if (url.pathname === '/api/controlnets') {
        return jsonResponse({ ok: true, controlNets: [] })
      }

      if (url.pathname === '/api/civitai/model-previews') {
        return jsonResponse({
          ok: true,
          items: [
            {
              modelId: 9001,
              versionId: 9002,
              previews: [
                { id: 9101, url: '/mock-assets/backfilled-preview.png', mediaType: 'image', nsfwLevel: 16 },
                { id: 9102, url: '/mock-assets/backfilled-preview-2.png', mediaType: 'image', nsfwLevel: 16 },
                { id: 9103, url: '/mock-assets/backfilled-preview-3.png', mediaType: 'image', nsfwLevel: 16 },
              ],
            },
          ],
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
    await router.push('/library')
    await router.isReady()
    const { default: LibraryView } = await import('../../src/views/LibraryView.vue')
    const wrapper = mount(LibraryView, {
      global: {
        plugins: [router],
      },
    })
    await flushPromises()
    await flushPromises()

    const previewCall = fetchMock.mock.calls
      .map(([input]) => new URL(String(input), 'http://companion.test'))
      .find((url) => url.pathname === '/api/civitai/model-previews')
    expect(previewCall?.searchParams.get('modelIds')).toBe('9001')
    expect(previewCall?.searchParams.get('versionIds')).toBe('9002')
    expect(wrapper.text()).not.toContain('No preview available')
    const preview = wrapper.get('img[alt="Downloaded Preview Backfill LoRA preview"]')
    expect(preview.attributes('src')).toBe('/mock-assets/backfilled-preview.png')
    expect(preview.classes().join(' ')).toContain('blur-sm')
  })
})
