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

class FakeDownloadEventsSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSED = 3
  static instances: FakeDownloadEventsSocket[] = []
  readyState = FakeDownloadEventsSocket.OPEN
  listeners = new Map<string, Array<(event: MessageEvent | Event) => void>>()
  url: string

  constructor(url: string) {
    this.url = url
    FakeDownloadEventsSocket.instances.push(this)
  }

  addEventListener(type: string, listener: (event: MessageEvent | Event) => void) {
    const listeners = this.listeners.get(type) ?? []
    listeners.push(listener)
    this.listeners.set(type, listeners)
  }

  close() {
    this.readyState = FakeDownloadEventsSocket.CLOSED
  }

  emitMessage(payload: unknown) {
    const event = new MessageEvent('message', { data: JSON.stringify(payload) })
    for (const listener of this.listeners.get('message') ?? []) {
      listener(event)
    }
  }

  static reset() {
    FakeDownloadEventsSocket.instances = []
  }
}

function installFakeDownloadEventsSocket() {
  FakeDownloadEventsSocket.reset()
  vi.stubGlobal('WebSocket', FakeDownloadEventsSocket)
}

describe('asset download websocket events', () => {
  beforeEach(() => {
    vi.resetModules()
    FakeDownloadEventsSocket.reset()
  })

  it('updates downloads from the websocket and posts queue actions without list polling', async () => {
    vi.useFakeTimers()
    installFakeDownloadEventsSocket()
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ ok: true }))
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

    expect(FakeDownloadEventsSocket.instances).toHaveLength(1)
    expect(FakeDownloadEventsSocket.instances[0].url).toContain('/api/civitai/downloads/events')
    expect(fetchMock).not.toHaveBeenCalledWith('/api/civitai/downloads', expect.anything())

    FakeDownloadEventsSocket.instances[0].emitMessage({
      type: 'downloads:snapshot',
      payload: {
        downloads: {
          ok: true,
          items: [{ id: 'download-1', state: 'queued', modelName: 'Model', versionId: 2 }],
        },
      },
    })
    await flushPromises()
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

  it('updates the downloads summary from the websocket without polling summary endpoints', async () => {
    vi.useFakeTimers()
    installFakeDownloadEventsSocket()
    const fetchMock = vi.fn()
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

    expect(FakeDownloadEventsSocket.instances).toHaveLength(1)
    expect(fetchMock).not.toHaveBeenCalledWith('/api/civitai/downloads/summary', expect.anything())
    expect(fetchMock).not.toHaveBeenCalledWith('/api/civitai/downloads', expect.anything())

    vi.advanceTimersByTime(10000)
    await flushPromises()
    expect(fetchMock).not.toHaveBeenCalledWith('/api/civitai/downloads/summary', expect.anything())

    FakeDownloadEventsSocket.instances[0].emitMessage({
      type: 'downloads:snapshot',
      payload: {
        summary: {
          ok: true,
          counts: { active: 2, attention: 1, visibleComplete: 4 },
        },
      },
    })
    await flushPromises()

    expect(wrapper.text()).toBe('2')
    wrapper.unmount()
    vi.runOnlyPendingTimers()
  })

  it('updates panel downloads from the shared websocket without polling panel endpoints', async () => {
    vi.useFakeTimers()
    installFakeDownloadEventsSocket()
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const { useAssetDownloads, useAssetDownloadPanel } = await import('../../src/composables/useAssetDownloads')
    const Consumer = defineComponent({
      setup() {
        const downloads = useAssetDownloads()
        const panel = useAssetDownloadPanel()
        return () => h('div', [
          h('span', downloads.downloads.value.map((item) => item.modelName).join(',')),
          h('span', panel.downloads.value.map((item) => item.modelName).join(',')),
        ])
      },
    })

    const wrapper = mount(Consumer)
    await flushPromises()

    expect(FakeDownloadEventsSocket.instances).toHaveLength(1)
    expect(fetchMock).not.toHaveBeenCalledWith('/api/civitai/downloads', expect.anything())
    expect(fetchMock).not.toHaveBeenCalledWith('/api/civitai/downloads/panel', expect.anything())

    vi.advanceTimersByTime(10000)
    await flushPromises()
    expect(fetchMock).not.toHaveBeenCalledWith('/api/civitai/downloads', expect.anything())
    expect(fetchMock).not.toHaveBeenCalledWith('/api/civitai/downloads/panel', expect.anything())

    FakeDownloadEventsSocket.instances[0].emitMessage({
      type: 'downloads:snapshot',
      payload: {
        downloads: {
          ok: true,
          items: [{ id: 'download-1', state: 'complete', modelName: 'Full model', versionId: 2 }],
        },
        panel: {
          ok: true,
          items: [{ id: 'download-1', state: 'complete', modelName: 'Panel model', versionId: 2 }],
        },
      },
    })
    await flushPromises()

    expect(wrapper.text()).toContain('Full model')
    expect(wrapper.text()).toContain('Panel model')
    wrapper.unmount()
    vi.runOnlyPendingTimers()
  })
})
