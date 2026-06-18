// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { emblaApi } = vi.hoisted(() => ({
  emblaApi: {
    canScrollPrev: vi.fn(() => false),
    canScrollNext: vi.fn(() => true),
    selectedScrollSnap: vi.fn(() => 0),
    scrollPrev: vi.fn(),
    scrollNext: vi.fn(),
    scrollTo: vi.fn(),
    reInit: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  },
}))

vi.mock('embla-carousel-vue', async () => {
  const { ref } = await import('vue')
  return {
    default: () => [ref(null), ref(emblaApi)],
  }
})

class FakeWebSocket {
  static instances: FakeWebSocket[] = []

  readonly sent: string[] = []
  private readonly listeners = new Map<string, Array<(event: { data: string }) => void>>()

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this)
  }

  addEventListener(event: string, listener: (event: { data: string }) => void) {
    this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener])
  }

  send(message: string) {
    this.sent.push(message)
  }

  close() {}

  emitMessage(message: unknown) {
    for (const listener of this.listeners.get('message') ?? []) {
      listener({ data: JSON.stringify(message) })
    }
  }
}

function atlasSettingsResponse() {
  return new Response(JSON.stringify({
    ok: true,
    atlasConfigured: true,
    atlasUrl: 'https://atlas.test',
    atlasKeyConfigured: true,
  }), { status: 200, headers: { 'Content-Type': 'application/json' } })
}

function createModel() {
  return {
    id: 101,
    name: 'Atlas progress model',
    type: 'Checkpoint',
    modelVersions: [{
      id: 201,
      name: 'Latest version',
      images: [{
        id: 800,
        url: 'https://example.test/version-original.jpg',
        type: 'image',
        nsfw: false,
      }],
    }],
  }
}

async function mountModal(fetchMock: ReturnType<typeof vi.fn>) {
  vi.stubGlobal('fetch', fetchMock)

  const { default: AssetPreviewModal } = await import('../../src/components/asset-preview/AssetPreviewModal.vue')
  const wrapper = mount(AssetPreviewModal, {
    attachTo: document.body,
    global: {
      stubs: {
        RouterLink: { template: '<a><slot /></a>' },
      },
    },
    props: {
      open: true,
      model: createModel(),
    },
  })

  await flushPromises()
  return wrapper
}

function statusResponse() {
  return new Response(JSON.stringify({
    ok: true,
    configured: true,
    items: [{ request_id: 'civitai:800', exists: false, filtered: false }],
  }), { status: 200, headers: { 'Content-Type': 'application/json' } })
}

describe('AssetPreviewModal Atlas reaction progress', () => {
  afterEach(() => {
    FakeWebSocket.instances = []
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('shows a spinner on the clicked reaction while Atlas is submitting it', async () => {
    let resolveReaction: ((response: Response) => void) | null = null
    const reactionResponse = new Promise<Response>((resolve) => {
      resolveReaction = resolve
    })
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://127.0.0.1')
      if (url.pathname === '/api/settings/app') {
        return atlasSettingsResponse()
      }
      if (url.pathname === '/api/atlas/civitai/status') {
        return statusResponse()
      }
      if (url.pathname === '/api/atlas/civitai/reactions') {
        return reactionResponse
      }
      return new Response(JSON.stringify({ items: [] }), { status: 200 })
    })

    const wrapper = await mountModal(fetchMock)
    await wrapper.get('button[aria-label="Like in Atlas"]').trigger('click')
    await wrapper.vm.$nextTick()

    expect(wrapper.get('button[aria-label="Like in Atlas"]').find('[data-test="asset-preview-atlas-reaction-spinner"]').exists()).toBe(true)

    resolveReaction?.(new Response(JSON.stringify({
      configured: true,
      file: { id: 88, source_id: '800' },
      reaction: { type: 'like' },
      download: { requested: true },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    await flushPromises()

    expect(wrapper.get('button[aria-label="Like in Atlas"]').attributes('aria-pressed')).toBe('true')
  })

  it('updates Atlas download progress from Reverb events after reacting', async () => {
    vi.stubGlobal('WebSocket', FakeWebSocket)
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://127.0.0.1')
      if (url.pathname === '/api/settings/app') {
        return atlasSettingsResponse()
      }
      if (url.pathname === '/api/atlas/civitai/status') {
        return statusResponse()
      }
      if (url.pathname === '/api/atlas/broadcasting/auth') {
        return new Response(JSON.stringify({ auth: 'atlas-key:signature' }), { status: 200 })
      }
      if (url.pathname === '/api/atlas/civitai/reactions') {
        return new Response(JSON.stringify({
          configured: true,
          file: {
            id: 88,
            source_id: '800',
            url: 'https://atlas.test/files/version-original.jpg',
            referrer_url: 'https://civitai.com/models/101?modelVersionId=201',
          },
          reaction: { type: 'like' },
          download: { requested: true, transfer_id: 55, status: 'queued', progress_percent: 0 },
          reverb: {
            enabled: true,
            key: 'atlas-key',
            host: 'atlas.test',
            port: 443,
            scheme: 'https',
            channel: 'private-extension-downloads.test',
          },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      return new Response(JSON.stringify({ items: [] }), { status: 200 })
    })

    const wrapper = await mountModal(fetchMock)
    await wrapper.get('button[aria-label="Like in Atlas"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-test="asset-preview-atlas-download-progress"]').text()).toContain('Queued · 0%')
    const socket = FakeWebSocket.instances[0]
    expect(socket?.url).toContain('wss://atlas.test/app/atlas-key')

    socket?.emitMessage({
      event: 'pusher:connection_established',
      data: JSON.stringify({ socket_id: '123.456' }),
    })
    await flushPromises()

    const authCall = fetchMock.mock.calls.find((call) => String(call[0]) === '/api/atlas/broadcasting/auth')
    expect(JSON.parse(String((authCall?.[1] as RequestInit | undefined)?.body))).toMatchObject({
      socket_id: '123.456',
      channel_name: 'private-extension-downloads.test',
    })
    expect(socket?.sent.map((message) => JSON.parse(message))).toContainEqual({
      event: 'pusher:subscribe',
      data: { channel: 'private-extension-downloads.test', auth: 'atlas-key:signature' },
    })

    socket?.emitMessage({
      event: 'DownloadTransferProgressUpdated',
      data: JSON.stringify({
        original: 'https://atlas.test/files/version-original.jpg',
        status: 'downloading',
        percent: 48,
      }),
    })
    await flushPromises()

    const progress = wrapper.get('[data-test="asset-preview-atlas-download-progress"]')
    expect(progress.attributes('aria-valuenow')).toBe('48')
    expect(progress.text()).toContain('Downloading · 48%')
  })

  it('polls Atlas status after reacting when Reverb is not available', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://127.0.0.1')
      if (url.pathname === '/api/settings/app') {
        return atlasSettingsResponse()
      }
      if (url.pathname === '/api/atlas/civitai/status') {
        const statusCalls = fetchMock.mock.calls.filter((call) => String(call[0]) === '/api/atlas/civitai/status').length
        return new Response(JSON.stringify({
          ok: true,
          configured: true,
          items: [{
            request_id: 'civitai:800',
            exists: statusCalls > 1,
            file_id: statusCalls > 1 ? 88 : null,
            downloaded: statusCalls > 1,
            downloaded_at: statusCalls > 1 ? '2026-06-18T05:00:00Z' : null,
            filtered: false,
            download: statusCalls > 1
              ? { requested: true, transfer_id: 55, status: 'failed', progress_percent: 0, downloaded_at: '2026-06-18T05:00:00Z' }
              : null,
          }],
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      if (url.pathname === '/api/atlas/civitai/reactions') {
        return new Response(JSON.stringify({
          configured: true,
          file: {
            id: 88,
            source_id: '800',
            url: 'https://atlas.test/files/version-original.jpg',
            referrer_url: 'https://civitai.com/models/101?modelVersionId=201',
          },
          reaction: { type: 'like' },
          download: { requested: true, transfer_id: 55, status: 'queued', progress_percent: 0 },
          reverb: { enabled: false },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      return new Response(JSON.stringify({ items: [] }), { status: 200 })
    })

    const wrapper = await mountModal(fetchMock)
    vi.useFakeTimers()
    await wrapper.get('button[aria-label="Like in Atlas"]').trigger('click')
    await flushPromises()

    expect(FakeWebSocket.instances).toHaveLength(0)
    expect(wrapper.get('[data-test="asset-preview-atlas-download-progress"]').text()).toContain('Queued · 0%')

    await vi.advanceTimersByTimeAsync(2500)
    await flushPromises()

    const progress = wrapper.get('[data-test="asset-preview-atlas-download-progress"]')
    expect(progress.attributes('aria-valuenow')).toBe('100')
    expect(progress.text()).toContain('Complete · 100%')
  })
})
