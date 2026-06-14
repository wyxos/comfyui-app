// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils'
import { computed, defineComponent, h, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
  })
}

describe('useAssetDownloads', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('loads downloads on first subscriber and posts queue actions', async () => {
    vi.useFakeTimers()
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          ok: true,
          items: [
            {
              id: 'download-1',
              state: 'queued',
              modelId: 1,
              modelName: 'Model',
              modelType: 'Checkpoint',
              versionId: 2,
              versionName: 'v1',
              fileName: 'model.safetensors',
              updatedAt: 10,
            },
          ],
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ ok: true }))
      .mockResolvedValueOnce(jsonResponse({ ok: true, items: [] }))
    vi.stubGlobal('fetch', fetchMock)

    const { useAssetDownloads } = await import('../../src/composables/useAssetDownloads')
    let exposedDownloads: ReturnType<typeof useAssetDownloads> | null = null
    const Consumer = defineComponent({
      setup() {
        const downloads = useAssetDownloads()
        exposedDownloads = downloads
        return () => h('div', downloads.downloads.value.map((item) => item.modelName).join(','))
      },
    })

    const wrapper = mount(Consumer)
    await flushPromises()

    expect(fetchMock).toHaveBeenCalledWith('/api/civitai/downloads', {
      headers: {
        Accept: 'application/json',
      },
    })
    expect(wrapper.text()).toBe('Model')

    await exposedDownloads?.queueDownload({
      modelId: 1,
      modelName: 'Model',
      modelType: 'Checkpoint',
      versionId: 2,
      versionName: 'v1',
      file: { id: 3, name: 'model.safetensors' },
    })

    expect(fetchMock).toHaveBeenCalledWith('/api/civitai/downloads', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({
        modelId: 1,
        modelName: 'Model',
        modelType: 'Checkpoint',
        versionId: 2,
        versionName: 'v1',
        file: { id: 3, name: 'model.safetensors' },
      }),
    })

    wrapper.unmount()
    vi.runOnlyPendingTimers()
  })

  it('surfaces refresh failures', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: false, message: 'No downloads.' }, 500))
    vi.stubGlobal('fetch', fetchMock)

    const { useAssetDownloads } = await import('../../src/composables/useAssetDownloads')
    const Consumer = defineComponent({
      setup() {
        const downloads = useAssetDownloads()
        return () => h('div', downloads.error.value)
      },
    })

    const wrapper = mount(Consumer)
    await flushPromises()

    expect(wrapper.text()).toBe('No downloads.')
  })

  it('loads the lightweight downloads summary without fetching the full list', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        ok: true,
        counts: {
          active: 1,
          attention: 0,
          visibleComplete: 12,
        },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const { useAssetDownloadSummary } = await import('../../src/composables/useAssetDownloads')
    const Consumer = defineComponent({
      setup() {
        const summary = useAssetDownloadSummary()
        return () => h('div', String(summary.counts.value.active || summary.counts.value.visibleComplete))
      },
    })

    const wrapper = mount(Consumer)
    await flushPromises()

    expect(fetchMock).toHaveBeenCalledWith('/api/civitai/downloads/summary', {
      headers: {
        Accept: 'application/json',
      },
    })
    expect(fetchMock).not.toHaveBeenCalledWith('/api/civitai/downloads', expect.anything())
    expect(wrapper.text()).toBe('1')

    wrapper.unmount()
    vi.runOnlyPendingTimers()
  })

  it('posts pause, resume, cancel, delete, redownload, and clear actions', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ ok: true, items: [] }))
      .mockResolvedValue(jsonResponse({ ok: true, item: { id: 'download-1', state: 'paused' } }))
    vi.stubGlobal('fetch', fetchMock)

    const { useAssetDownloads } = await import('../../src/composables/useAssetDownloads')
    let exposedDownloads: ReturnType<typeof useAssetDownloads> | null = null
    const Consumer = defineComponent({
      setup() {
        exposedDownloads = useAssetDownloads()
        return () => h('div')
      },
    })

    const wrapper = mount(Consumer)
    await flushPromises()

    await exposedDownloads?.pauseDownload('download-1')
    await exposedDownloads?.resumeDownload('download-1')
    await exposedDownloads?.cancelDownload('download-1')
    await exposedDownloads?.deleteDownloadedFile('download-1')
    await exposedDownloads?.redownloadDownload('download-1')
    await exposedDownloads?.clearDownloads()

    expect(fetchMock).toHaveBeenCalledWith('/api/civitai/downloads/download-1/pause', expect.objectContaining({ method: 'POST' }))
    expect(fetchMock).toHaveBeenCalledWith('/api/civitai/downloads/download-1/resume', expect.objectContaining({ method: 'POST' }))
    expect(fetchMock).toHaveBeenCalledWith('/api/civitai/downloads/download-1/cancel', expect.objectContaining({ method: 'POST' }))
    expect(fetchMock).toHaveBeenCalledWith('/api/civitai/downloads/download-1/delete-file', expect.objectContaining({ method: 'POST' }))
    expect(fetchMock).toHaveBeenCalledWith('/api/civitai/downloads/download-1/redownload', expect.objectContaining({ method: 'POST' }))
    expect(fetchMock).toHaveBeenCalledWith('/api/civitai/downloads/clear', expect.objectContaining({ method: 'POST' }))

    wrapper.unmount()
  })
})

describe('AssetDownloadsPanel', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('renders active downloads and delegates item actions', async () => {
    const downloads = ref([
      {
        id: 'download-1',
        state: 'downloading',
        modelId: 1,
        modelName: 'Mock model',
        modelType: 'Checkpoint',
        versionId: 2,
        versionName: 'v1',
        fileName: 'model.safetensors',
        progressPercent: 42,
        updatedAt: 10,
      },
    ])
    const pauseDownload = vi.fn()
    const resumeDownload = vi.fn()
    const cancelDownload = vi.fn()
    const clearDownloads = vi.fn()
    const startPolling = vi.fn()
    const stopPolling = vi.fn()

    vi.doMock('../../src/composables/useAssetDownloads', () => ({
      useAssetDownloadPanel: () => ({
        downloads,
        activeDownloads: computed(() => downloads.value.filter((item) => item.state === 'downloading')),
        completedDownloads: computed(() => downloads.value.filter((item) => item.state === 'complete')),
        loading: ref(false),
        error: ref(''),
        pauseDownload,
        resumeDownload,
        cancelDownload,
        clearDownloads,
        startPolling,
        stopPolling,
      }),
    }))

    const { default: AssetDownloadsPanel } = await import('../../src/components/AssetDownloadsPanel.vue')
    const wrapper = mount(AssetDownloadsPanel, {
      props: {
        open: true,
      },
    })

    expect(wrapper.text()).toContain('Mock model')
    expect(wrapper.text()).toContain('42%')

    await wrapper.get('[aria-label="Pause download"]').trigger('click')
    await wrapper.get('[aria-label="Cancel download"]').trigger('click')

    expect(pauseDownload).toHaveBeenCalledWith('download-1')
    expect(cancelDownload).toHaveBeenCalledWith('download-1')
    expect(resumeDownload).not.toHaveBeenCalled()
  })

  it('renders failed and completed downloads with resume and clear actions', async () => {
    const downloads = ref([
      {
        id: 'failed-download',
        state: 'error',
        modelId: 1,
        modelName: 'Failed model',
        modelType: 'Checkpoint',
        versionId: 2,
        versionName: 'v1',
        fileName: 'failed.safetensors',
        error: 'Network failed',
        updatedAt: 20,
      },
      {
        id: 'complete-download',
        state: 'complete',
        modelId: 2,
        modelName: 'Complete model',
        modelType: 'LORA',
        versionId: 3,
        versionName: 'v2',
        fileName: 'complete.safetensors',
        updatedAt: 10,
      },
    ])
    const pauseDownload = vi.fn()
    const resumeDownload = vi.fn()
    const cancelDownload = vi.fn()
    const clearDownloads = vi.fn()
    const startPolling = vi.fn()
    const stopPolling = vi.fn()

    vi.doMock('../../src/composables/useAssetDownloads', () => ({
      useAssetDownloadPanel: () => ({
        downloads,
        activeDownloads: computed(() => []),
        completedDownloads: computed(() => downloads.value.filter((item) => item.state === 'complete')),
        loading: ref(false),
        error: ref(''),
        pauseDownload,
        resumeDownload,
        cancelDownload,
        clearDownloads,
        startPolling,
        stopPolling,
      }),
    }))

    const { default: AssetDownloadsPanel } = await import('../../src/components/AssetDownloadsPanel.vue')
    const wrapper = mount(AssetDownloadsPanel, {
      props: {
        open: true,
      },
    })

    expect(wrapper.text()).toContain('Failed model')
    expect(wrapper.text()).toContain('Failed')
    expect(wrapper.text()).toContain('Complete model')

    await wrapper.get('[aria-label="Resume download"]').trigger('click')
    await wrapper.get('[aria-label="Clear finished downloads"]').trigger('click')

    expect(resumeDownload).toHaveBeenCalledWith('failed-download')
    expect(clearDownloads).toHaveBeenCalled()
    expect(pauseDownload).not.toHaveBeenCalled()
    expect(cancelDownload).not.toHaveBeenCalled()
  })
})

describe('DownloadsView', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('confirms before deleting or redownloading downloaded models', async () => {
    const downloads = ref([
      {
        id: 'complete-download',
        state: 'complete',
        modelId: 1,
        modelName: 'Complete checkpoint',
        modelType: 'Checkpoint',
        modelNsfw: true,
        modelMetadata: { nsfw: true },
        versionId: 2,
        versionName: 'v1',
        fileName: 'complete.safetensors',
        fileSizeKb: 1024,
        targetPath: 'C:\\models\\checkpoints\\complete.safetensors',
        progressPercent: 100,
        previewUrl: '/api/civitai/downloads/complete-download/preview',
        updatedAt: 10,
      },
      {
        id: 'deleted-download',
        state: 'deleted',
        modelId: 3,
        modelName: 'Deleted lora',
        modelType: 'LORA',
        versionId: 4,
        versionName: 'v2',
        fileName: 'deleted.safetensors',
        targetPath: 'C:\\models\\loras\\deleted.safetensors',
        updatedAt: 20,
      },
      {
        id: 'embedding-download',
        state: 'complete',
        modelId: 5,
        modelName: 'Ignored embedding',
        modelType: 'TextualInversion',
        versionId: 6,
        versionName: 'v3',
        fileName: 'embedding.pt',
        updatedAt: 30,
      },
    ])
    const refreshDownloads = vi.fn()
    const pauseDownload = vi.fn()
    const resumeDownload = vi.fn()
    const cancelDownload = vi.fn()
    const deleteDownloadedFile = vi.fn()
    const redownloadDownload = vi.fn()

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
        pauseDownload,
        resumeDownload,
        cancelDownload,
        deleteDownloadedFile,
        redownloadDownload,
      }),
    }))
    vi.doMock('../../src/composables/useAppSettings', () => ({
      fetchAppSettings: vi.fn().mockResolvedValue({ includeNsfw: true, blurNsfwContent: false }),
    }))
    const confirm = vi.fn().mockResolvedValue(true)
    vi.doMock('../../src/composables/useConfirmDialog', () => ({
      useConfirmDialog: () => confirm,
    }))

    const { default: DownloadsView } = await import('../../src/views/DownloadsView.vue')
    const wrapper = mount(DownloadsView)
    await flushPromises()

    expect(wrapper.text()).toContain('Complete checkpoint')
    expect(wrapper.text()).toContain('Deleted lora')
    expect(wrapper.text()).not.toContain('Ignored embedding')
    expect(wrapper.get('img[alt="Complete checkpoint preview"]').classes()).not.toContain('blur-sm')
    const civitaiLink = wrapper.get('a[aria-label="Open Complete checkpoint on Civitai"]')
    expect(civitaiLink.attributes('href')).toBe('https://civitai.red/models/1?modelVersionId=2')
    expect(civitaiLink.attributes('target')).toBe('_blank')
    expect(civitaiLink.attributes('rel')).toContain('noreferrer')

    await wrapper.get('[aria-label="Redownload Complete checkpoint"]').trigger('click')
    await wrapper.get('[aria-label="Delete Complete checkpoint from disk"]').trigger('click')
    await flushPromises()

    expect(redownloadDownload).toHaveBeenCalledWith('complete-download')
    expect(deleteDownloadedFile).toHaveBeenCalledWith('complete-download')
    expect(confirm).toHaveBeenNthCalledWith(1, expect.objectContaining({
      title: 'Re-download file?',
      description: 'Re-download complete.safetensors? This will replace the existing downloaded file.',
      confirmLabel: 'Re-download',
      destructive: true,
    }))
    expect(confirm).toHaveBeenNthCalledWith(2, expect.objectContaining({
      title: 'Delete downloaded file?',
      description: 'Delete complete.safetensors from disk? The download record will remain for redownload.',
      confirmLabel: 'Delete file',
      destructive: true,
    }))
  })

})
