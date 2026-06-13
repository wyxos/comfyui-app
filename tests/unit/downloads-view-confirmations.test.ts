// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils'
import { computed, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('DownloadsView confirmations', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('cancels redownload when confirmation is declined', async () => {
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
    const redownloadDownload = vi.fn()

    vi.doMock('../../src/composables/useAssetDownloads', () => ({
      useAssetDownloads: () => ({
        downloads,
        watchedDownloads: ref([]),
        activeDownloads: computed(() => []),
        completedDownloads: computed(() => downloads.value),
        loading: ref(false),
        error: ref(''),
        refreshDownloads: vi.fn(),
        refreshWatchedDownloads: vi.fn(),
        pauseDownload: vi.fn(),
        resumeDownload: vi.fn(),
        cancelDownload: vi.fn(),
        deleteDownloadedFile: vi.fn(),
        redownloadDownload,
      }),
    }))
    vi.doMock('../../src/composables/useAppSettings', () => ({
      fetchAppSettings: vi.fn().mockResolvedValue({ includeNsfw: false }),
    }))
    const confirm = vi.fn().mockResolvedValue(false)
    vi.doMock('../../src/composables/useConfirmDialog', () => ({
      useConfirmDialog: () => confirm,
    }))

    const { default: DownloadsView } = await import('../../src/views/DownloadsView.vue')
    const wrapper = mount(DownloadsView)

    await wrapper.get('[aria-label="Redownload Complete checkpoint"]').trigger('click')
    await flushPromises()

    expect(redownloadDownload).not.toHaveBeenCalled()
    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Re-download file?',
      description: 'Re-download complete.safetensors? This will replace the existing downloaded file.',
      confirmLabel: 'Re-download',
      destructive: true,
    }))
  })
})
