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

  it('requires confirmation before keeping a Civitai hash-mismatched download anyway', async () => {
    const downloads = ref([
      {
        id: 'hash-mismatch-download',
        state: 'error',
        modelId: 1,
        modelName: 'Hash mismatch LoRA',
        modelType: 'LORA',
        versionId: 2,
        versionName: 'v1',
        fileName: 'hash-mismatch.safetensors',
        targetPath: 'C:\\models\\loras\\hash-mismatch.safetensors',
        progressPercent: 100,
        error: `Downloaded file hash mismatch. Expected ${'A'.repeat(64)}, got ${'B'.repeat(64)}.`,
        updatedAt: 10,
      },
    ])
    const keepDownloadAnyway = vi.fn()

    vi.doMock('../../src/composables/useAssetDownloads', () => ({
      useAssetDownloads: () => ({
        downloads,
        watchedDownloads: ref([]),
        activeDownloads: computed(() => []),
        completedDownloads: computed(() => []),
        loading: ref(false),
        error: ref(''),
        refreshDownloads: vi.fn(),
        refreshWatchedDownloads: vi.fn(),
        pauseDownload: vi.fn(),
        resumeDownload: vi.fn(),
        cancelDownload: vi.fn(),
        deleteDownloadedFile: vi.fn(),
        redownloadDownload: vi.fn(),
        keepDownloadAnyway,
      }),
    }))
    vi.doMock('../../src/composables/useAppSettings', () => ({
      fetchAppSettings: vi.fn().mockResolvedValue({ includeNsfw: false }),
    }))
    const confirm = vi.fn().mockResolvedValue(true)
    vi.doMock('../../src/composables/useConfirmDialog', () => ({
      useConfirmDialog: () => confirm,
    }))

    const { default: DownloadsView } = await import('../../src/views/DownloadsView.vue')
    const wrapper = mount(DownloadsView)

    expect(wrapper.text()).toContain('Hash mismatch')
    await wrapper.get('[aria-label="Keep Hash mismatch LoRA despite Civitai hash mismatch"]').trigger('click')
    await flushPromises()

    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Keep hash-mismatched file?',
      description: "Download hash-mismatch.safetensors again and keep it even if Civitai's served bytes still do not match its SHA-256 metadata.",
      confirmLabel: 'Keep anyway',
      destructive: true,
    }))
    expect(keepDownloadAnyway).toHaveBeenCalledWith('hash-mismatch-download')
  })

  it('keeps hash-mismatch row actions reachable when the table overflows horizontally', async () => {
    const downloads = ref([
      {
        id: 'hash-mismatch-download',
        state: 'error',
        modelId: 1,
        modelName: 'Hash mismatch LoRA',
        modelType: 'LORA',
        versionId: 2,
        versionName: 'v1',
        fileName: 'hash-mismatch.safetensors',
        targetPath: 'C:\\models\\loras\\hash-mismatch.safetensors',
        progressPercent: 100,
        error: `Downloaded file hash mismatch. Expected ${'A'.repeat(64)}, got ${'B'.repeat(64)}.`,
        updatedAt: 10,
      },
    ])

    vi.doMock('../../src/composables/useAssetDownloads', () => ({
      useAssetDownloads: () => ({
        downloads,
        watchedDownloads: ref([]),
        activeDownloads: computed(() => []),
        completedDownloads: computed(() => []),
        loading: ref(false),
        error: ref(''),
        refreshDownloads: vi.fn(),
        refreshWatchedDownloads: vi.fn(),
        pauseDownload: vi.fn(),
        resumeDownload: vi.fn(),
        cancelDownload: vi.fn(),
        deleteDownloadedFile: vi.fn(),
        redownloadDownload: vi.fn(),
        keepDownloadAnyway: vi.fn(),
      }),
    }))
    vi.doMock('../../src/composables/useAppSettings', () => ({
      fetchAppSettings: vi.fn().mockResolvedValue({ includeNsfw: false }),
    }))
    vi.doMock('../../src/composables/useConfirmDialog', () => ({
      useConfirmDialog: () => vi.fn(),
    }))

    const { default: DownloadsView } = await import('../../src/views/DownloadsView.vue')
    const wrapper = mount(DownloadsView)
    const keepButton = wrapper.get('[aria-label="Keep Hash mismatch LoRA despite Civitai hash mismatch"]')
    const actionCell = keepButton.element.closest('td')
    const actionHeader = wrapper.findAll('th').find((header) => header.text() === 'Actions')

    expect(actionHeader?.classes()).toEqual(expect.arrayContaining(['sticky', 'right-0', 'z-20', 'w-64']))
    expect(actionCell?.classList.contains('sticky')).toBe(true)
    expect(actionCell?.classList.contains('right-0')).toBe(true)
    expect(actionCell?.classList.contains('z-10')).toBe(true)
    expect(keepButton.element.parentElement?.classList.contains('min-w-44')).toBe(true)
  })
})
