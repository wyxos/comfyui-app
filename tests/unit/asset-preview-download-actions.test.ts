// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
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
})
