// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils'
import { computed, defineComponent, h } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
  })
}

describe('useAssetPreviewDownloadActions', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.doUnmock('../../src/composables/useAssetDownloads')
  })

  it('can defer full download polling until a preview opens', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true, items: [] }))
    vi.stubGlobal('fetch', fetchMock)

    const { useAssetPreviewDownloadActions } = await import('../../src/components/asset-preview/useAssetPreviewDownloadActions')
    let actions: ReturnType<typeof useAssetPreviewDownloadActions> | null = null
    const Consumer = defineComponent({
      setup() {
        actions = useAssetPreviewDownloadActions({ autoStart: false })
        return () => h('div')
      },
    })

    const wrapper = mount(Consumer)
    await flushPromises()

    expect(fetchMock).not.toHaveBeenCalled()

    actions?.startPolling()
    await flushPromises()

    expect(fetchMock).toHaveBeenCalledWith('/api/civitai/downloads', {
      headers: {
        Accept: 'application/json',
      },
    })

    wrapper.unmount()
    vi.runOnlyPendingTimers()
  })

  it('requires confirmation before redownloading a completed preview version', async () => {
    const queueDownload = vi.fn()
    vi.doMock('../../src/composables/useAssetDownloads', () => ({
      useAssetDownloads: () => ({
        downloadByVersionId: computed(() => new Map([
          [201, [{ id: 'complete-version', state: 'complete', versionId: 201, fileName: 'preview.safetensors' }]],
        ])),
        queueDownload,
        deleteDownloadedFile: vi.fn(),
        startPolling: vi.fn(),
        stopPolling: vi.fn(),
      }),
    }))

    const { useAssetPreviewDownloadActions } = await import('../../src/components/asset-preview/useAssetPreviewDownloadActions')
    const { provideConfirmDialog } = await import('../../src/composables/useConfirmDialog')
    const confirm = vi.fn().mockResolvedValue(false)
    let actions: ReturnType<typeof useAssetPreviewDownloadActions> | null = null
    const Consumer = defineComponent({
      setup() {
        actions = useAssetPreviewDownloadActions({ autoStart: false })
        return () => h('div')
      },
    })
    const Provider = defineComponent({
      setup() {
        provideConfirmDialog(confirm)
        return () => h(Consumer)
      },
    })

    const wrapper = mount(Provider)
    await actions?.queueAssetDownload({
      id: 101,
      name: 'Preview LoRA',
      type: 'LORA',
      nsfw: false,
      creator: null,
      stats: null,
      modelVersions: [],
    }, {
      id: 201,
      name: 'v1',
      baseModel: 'Pony',
      files: [{ id: 301, name: 'preview.safetensors', type: 'Model', primary: true, downloadUrl: 'https://download.test/file' }],
    })

    expect(queueDownload).not.toHaveBeenCalled()
    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Re-download file?',
      description: 'Re-download preview.safetensors? This will replace the existing downloaded file.',
      confirmLabel: 'Re-download',
      destructive: true,
    }))

    wrapper.unmount()
  })

  it('posts a single-download preview repair action', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true, items: [] }))
    vi.stubGlobal('fetch', fetchMock)

    const { useAssetPreviewDownloadActions } = await import('../../src/components/asset-preview/useAssetPreviewDownloadActions')
    let actions: ReturnType<typeof useAssetPreviewDownloadActions> | null = null
    const Consumer = defineComponent({
      setup() {
        actions = useAssetPreviewDownloadActions({ autoStart: false })
        return () => h('div')
      },
    })

    const wrapper = mount(Consumer)
    await actions?.repairDownloadPreviews({ id: 'download-1', state: 'complete', fileName: 'model.safetensors' })
    await flushPromises()

    expect(fetchMock).toHaveBeenCalledWith('/api/civitai/downloads/download-1/repair-previews', expect.objectContaining({
      method: 'POST',
    }))

    wrapper.unmount()
  })
})
