// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
import { computed, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

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
})
