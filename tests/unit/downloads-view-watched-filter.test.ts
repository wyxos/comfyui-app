// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils'
import { computed, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

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

describe('DownloadsView watched filter', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('shows watched downloads only when the watched status filter is selected', async () => {
    const downloads = ref([
      {
        id: 'complete-download',
        state: 'complete',
        modelId: 1,
        modelName: 'Complete checkpoint',
        modelType: 'Checkpoint',
        versionId: 2,
        versionName: 'v1',
        fileName: 'complete.safetensors',
        targetPath: 'C:\\models\\checkpoints\\complete.safetensors',
        progressPercent: 100,
        updatedAt: 10,
      },
    ])
    const watchedDownloads = ref([
      {
        id: 'watched-download',
        state: 'watching',
        modelId: 3,
        modelName: 'Watched early LoRA',
        modelType: 'LORA',
        versionId: 4,
        versionName: 'Early v1',
        fileName: 'watched.safetensors',
        lastStatus: 'Early access locked until 2026-06-22T01:09:16.813Z.',
        updatedAt: 20,
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
      pauseDownload: vi.fn(),
      resumeDownload: vi.fn(),
      cancelDownload: vi.fn(),
      deleteDownloadedFile: vi.fn(),
      redownloadDownload: vi.fn(),
    }))

    vi.doMock('../../src/composables/useAssetDownloads', () => ({
      useAssetDownloads,
    }))
    vi.doMock('../../src/composables/useAppSettings', () => ({
      fetchAppSettings: vi.fn().mockResolvedValue({ includeNsfw: false }),
    }))
    vi.doMock('../../src/composables/useConfirmDialog', () => ({
      useConfirmDialog: () => vi.fn(),
    }))

    const { default: DownloadsView } = await import('../../src/views/DownloadsView.vue')
    const wrapper = mount(DownloadsView)

    expect(useAssetDownloads).toHaveBeenCalledWith({ includeWatched: true })
    expect(wrapper.text()).toContain('Complete checkpoint')
    expect(wrapper.text()).not.toContain('Watched early LoRA')
    expect(wrapper.text()).toContain('1 watched')

    await wrapper.get('[aria-label="Show watched downloads"]').trigger('click')

    expect(wrapper.text()).toContain('Watched early LoRA')
    expect(wrapper.text()).toContain('Early access locked until 2026-06-22T01:09:16.813Z.')
    expect(wrapper.text()).not.toContain('Complete checkpoint')
    expect(wrapper.find('[aria-label="Cancel Watched early LoRA"]').exists()).toBe(false)
    expect(wrapper.find('[aria-label="Redownload Watched early LoRA"]').exists()).toBe(false)
    expect(wrapper.find('[aria-label="Delete Watched early LoRA from disk"]').exists()).toBe(false)
  })

  it('keeps downloaded and watched rows visible when the NSFW toggle is off', async () => {
    const downloads = ref([
      {
        id: 'safe-complete-download',
        state: 'complete',
        modelId: 1,
        modelName: 'Safe checkpoint',
        modelType: 'Checkpoint',
        modelNsfw: false,
        modelMetadata: { nsfw: false },
        versionId: 2,
        versionName: 'v1',
        fileName: 'safe.safetensors',
        targetPath: 'C:\\models\\checkpoints\\safe.safetensors',
        progressPercent: 100,
        updatedAt: 10,
      },
      {
        id: 'nsfw-complete-download',
        state: 'complete',
        modelId: 3,
        modelName: 'NSFW checkpoint',
        modelType: 'Checkpoint',
        modelNsfw: true,
        modelMetadata: { nsfw: true },
        versionId: 4,
        versionName: 'v1',
        fileName: 'nsfw.safetensors',
        targetPath: 'C:\\models\\checkpoints\\nsfw.safetensors',
        progressPercent: 100,
        updatedAt: 20,
      },
    ])
    const watchedDownloads = ref([
      {
        id: 'safe-watched-download',
        state: 'watching',
        modelId: 5,
        modelName: 'Safe watched LoRA',
        modelType: 'LORA',
        modelNsfw: false,
        modelMetadata: { nsfw: false },
        versionId: 6,
        versionName: 'Early v1',
        fileName: 'safe-watched.safetensors',
        lastStatus: 'Waiting for availability.',
        updatedAt: 30,
      },
      {
        id: 'nsfw-watched-download',
        state: 'watching',
        modelId: 7,
        modelName: 'NSFW watched LoRA',
        modelType: 'LORA',
        modelNsfw: true,
        modelMetadata: { nsfw: true },
        versionId: 8,
        versionName: 'Early v2',
        fileName: 'nsfw-watched.safetensors',
        lastStatus: 'Waiting for availability.',
        updatedAt: 40,
      },
    ])
    const useAssetDownloads = vi.fn(() => ({
      downloads,
      watchedDownloads,
      activeDownloads: computed(() => []),
      completedDownloads: computed(() => downloads.value.filter((item) => item.state === 'complete')),
      loading: ref(false),
      error: ref(''),
      refreshDownloads: vi.fn(),
      refreshWatchedDownloads: vi.fn(),
      pauseDownload: vi.fn(),
      resumeDownload: vi.fn(),
      cancelDownload: vi.fn(),
      deleteDownloadedFile: vi.fn(),
      redownloadDownload: vi.fn(),
    }))

    vi.doMock('../../src/composables/useAssetDownloads', () => ({
      useAssetDownloads,
    }))
    vi.doMock('../../src/composables/useAppSettings', () => ({
      fetchAppSettings: vi.fn().mockResolvedValue({ includeNsfw: false }),
    }))
    vi.doMock('../../src/composables/useConfirmDialog', () => ({
      useConfirmDialog: () => vi.fn(),
    }))

    const { default: DownloadsView } = await import('../../src/views/DownloadsView.vue')
    const wrapper = mount(DownloadsView)
    await flushPromises()

    expect(wrapper.text()).toContain('Safe checkpoint')
    expect(wrapper.text()).toContain('NSFW checkpoint')
    expect(wrapper.text()).toContain('2 downloaded')
    expect((wrapper.get('[aria-label="Include NSFW downloads"]').element as HTMLInputElement).checked).toBe(false)

    await wrapper.get('[aria-label="Include NSFW downloads"]').setValue(true)

    expect(wrapper.text()).toContain('NSFW checkpoint')
    expect(wrapper.text()).toContain('2 downloaded')

    await wrapper.get('[aria-label="Show watched downloads"]').trigger('click')

    expect(wrapper.text()).toContain('Safe watched LoRA')
    expect(wrapper.text()).toContain('NSFW watched LoRA')
    expect(wrapper.text()).not.toContain('Safe checkpoint')

    await wrapper.get('[aria-label="Include NSFW downloads"]').setValue(false)

    expect(wrapper.text()).toContain('Safe watched LoRA')
    expect(wrapper.text()).toContain('NSFW watched LoRA')
    expect(wrapper.text()).toContain('2 watched')
  })

  it('uses the saved NSFW default as the initial Downloads toggle state', async () => {
    const downloads = ref([
      {
        id: 'nsfw-complete-download',
        state: 'complete',
        modelId: 3,
        modelName: 'Default-visible NSFW checkpoint',
        modelType: 'Checkpoint',
        modelNsfw: true,
        modelMetadata: { nsfw: true },
        versionId: 4,
        versionName: 'v1',
        fileName: 'default-visible-nsfw.safetensors',
        targetPath: 'C:\\models\\checkpoints\\default-visible-nsfw.safetensors',
        progressPercent: 100,
        updatedAt: 20,
      },
    ])
    const useAssetDownloads = vi.fn(() => ({
      downloads,
      watchedDownloads: ref([]),
      activeDownloads: computed(() => []),
      completedDownloads: computed(() => downloads.value.filter((item) => item.state === 'complete')),
      loading: ref(false),
      error: ref(''),
      refreshDownloads: vi.fn(),
      refreshWatchedDownloads: vi.fn(),
      pauseDownload: vi.fn(),
      resumeDownload: vi.fn(),
      cancelDownload: vi.fn(),
      deleteDownloadedFile: vi.fn(),
      redownloadDownload: vi.fn(),
    }))

    vi.doMock('../../src/composables/useAssetDownloads', () => ({
      useAssetDownloads,
    }))
    vi.doMock('../../src/composables/useAppSettings', () => ({
      fetchAppSettings: vi.fn().mockResolvedValue({ includeNsfw: true }),
    }))
    vi.doMock('../../src/composables/useConfirmDialog', () => ({
      useConfirmDialog: () => vi.fn(),
    }))

    const { default: DownloadsView } = await import('../../src/views/DownloadsView.vue')
    const wrapper = mount(DownloadsView)
    await flushPromises()

    expect(wrapper.text()).toContain('Default-visible NSFW checkpoint')
    expect((wrapper.get('[aria-label="Include NSFW downloads"]').element as HTMLInputElement).checked).toBe(true)
  })

  it('blurs a visible NSFW preview image without blurring the safe model title', async () => {
    const downloads = ref([
      {
        id: 'nsfw-complete-download',
        state: 'complete',
        modelId: 3,
        modelName: 'Safe checkpoint',
        modelType: 'Checkpoint',
        modelNsfw: false,
        modelMetadata: { nsfw: false },
        versionId: 4,
        versionName: 'v1',
        fileName: 'nsfw.safetensors',
        targetPath: 'C:\\models\\checkpoints\\nsfw.safetensors',
        progressPercent: 100,
        previewUrl: '/api/civitai/downloads/nsfw-complete-download/preview',
        previewPaths: [{ url: '/api/civitai/downloads/nsfw-complete-download/preview', mediaType: 'image', nsfwLevel: 8 }],
        updatedAt: 20,
      },
    ])
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://companion.test')
      if (url.pathname === '/api/civitai/models') {
        return new Response(JSON.stringify({
          items: [{
            id: 3,
            name: 'Safe checkpoint',
            type: 'Checkpoint',
            nsfw: false,
            modelVersions: [{ id: 4, name: 'v1', images: [{ url: 'https://example.test/nsfw-preview.png', nsfwLevel: 8 }] }],
          }],
        }), { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8' } })
      }
      return new Response(JSON.stringify({ ok: false }), { status: 500 })
    }))
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
        pauseDownload: vi.fn(),
        resumeDownload: vi.fn(),
        cancelDownload: vi.fn(),
        deleteDownloadedFile: vi.fn(),
        redownloadDownload: vi.fn(),
      }),
    }))
    vi.doMock('../../src/composables/useAppSettings', () => ({
      fetchAppSettings: vi.fn().mockResolvedValue({ includeNsfw: true, blurNsfwModels: true, blurNsfwMediaLevel: 4 }),
    }))
    vi.doMock('../../src/composables/useConfirmDialog', () => ({
      useConfirmDialog: () => vi.fn(),
    }))

    const { default: DownloadsView } = await import('../../src/views/DownloadsView.vue')
    const wrapper = mount(DownloadsView)
    await flushPromises()

    expect(wrapper.get('img[alt="Safe checkpoint preview"]').classes()).toContain('blur-sm')
    expect(wrapper.get('[data-download-title-button]').classes()).not.toContain('blur-sm')
    expect(wrapper.get('[data-download-title-civitai-link]').attributes('href')).toBe('https://civitai.red/models/3?modelVersionId=4')

    await wrapper.get('[aria-label="Open Safe checkpoint preview"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[role="dialog"]').text()).toContain('Safe checkpoint')
  })
})
