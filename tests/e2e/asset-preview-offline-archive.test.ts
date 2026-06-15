import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, type App as VueApp } from 'vue'
import AssetPreviewModal from '../../src/components/asset-preview/AssetPreviewModal.vue'

const mountedApps: Array<{ app: VueApp<Element>; host: HTMLElement }> = []

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  })
}

function mountArchiveModal(applyGenerationMetadata: (metadata: Record<string, unknown>) => void) {
  const host = document.body.appendChild(document.createElement('section'))
  const app = createApp(AssetPreviewModal, {
    open: true,
    title: 'Browser offline LoRA',
    previewUrl: '/api/model-preview?type=lora&name=offlineDetail.safetensors',
    modelId: 101,
    versionId: 201,
    modelType: 'LORA',
    baseModel: 'Pony',
    fileName: 'offlineDetail.safetensors',
    applyGenerationMetadata,
  })
  app.component('RouterLink', {
    setup(_, { slots }) {
      return () => h('a', { href: '#' }, slots.default?.())
    },
  })
  app.mount(host)
  mountedApps.push({ app, host })
  return host
}

describe('AssetPreviewModal offline archive browser flow', () => {
  afterEach(() => {
    while (mountedApps.length) {
      const mounted = mountedApps.pop()
      mounted?.app.unmount()
      mounted?.host.remove()
    }
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('renders cached archive gallery metadata when remote Civitai is unavailable', async () => {
    const applyGenerationMetadata = vi.fn()
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/civitai/models?')) {
        return jsonResponse({ ok: false, message: 'gone' }, 404)
      }
      if (url.includes('/api/model-archive?')) {
        return jsonResponse({
          ok: true,
          source: 'local-archive',
          archiveStatus: { state: 'ready', mediaTotal: 1, mediaDownloaded: 1 },
          item: {
            id: 101,
            name: 'Archived Browser LoRA',
            type: 'LORA',
            creator: { username: 'offline-browser' },
            modelVersions: [{
              id: 201,
              name: 'v1',
              baseModel: 'Pony',
              trainedWords: ['offline detail'],
              images: [{
                id: 601,
                url: '/api/model-archive-media?type=lora&name=offlineDetail.safetensors&index=0',
                remoteUrl: 'https://image.test/offline.png',
                archiveSource: 'local',
                mediaType: 'image',
                width: 640,
                height: 960,
                meta: {
                  prompt: 'browser offline prompt',
                  negativePrompt: 'browser offline negative',
                  seed: 4321,
                  sampler: 'Euler a',
                  steps: 28,
                  cfgScale: 6,
                  Size: '640x960',
                },
              }],
            }],
          },
        })
      }
      throw new Error(`Unexpected fetch ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const host = mountArchiveModal(applyGenerationMetadata)

    await vi.waitFor(() => {
      expect(host.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe(
        'Archived Browser LoRA image preview',
      )
      expect(host.textContent).toContain('browser offline prompt')
      expect(host.textContent).toContain('browser offline negative')
    })
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining('/api/civitai/images?'), expect.anything())

    const mediaButton = [...host.querySelectorAll('button')].find((button) => button.getAttribute('aria-label') === 'Show image and video details')
    mediaButton?.click()
    await vi.waitFor(() => {
      expect(host.textContent).toContain('Offline archive')
    })

    const applyButton = [...host.querySelectorAll('button')].find((button) => button.textContent?.includes('Apply metadata'))
    expect(applyButton).toBeDefined()
    applyButton?.click()
    await vi.waitFor(() => {
      expect(applyGenerationMetadata).toHaveBeenCalledWith(expect.objectContaining({
        prompt: 'browser offline prompt',
        seed: 4321,
      }))
    })
  })
})
