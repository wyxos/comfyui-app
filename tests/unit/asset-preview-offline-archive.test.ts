// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
  })
}

describe('AssetPreviewModal offline archive fallback', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('uses cached archive media and metadata when the Civitai model lookup fails', async () => {
    const applyGenerationMetadata = vi.fn()
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/civitai/models?')) {
        return jsonResponse({ error: 'Model not found' }, 404)
      }
      if (url.includes('/api/model-archive?')) {
        return jsonResponse({
          ok: true,
          source: 'local-archive',
          archiveStatus: {
            state: 'ready',
            mediaTotal: 1,
            mediaDownloaded: 1,
            mediaFailed: 0,
          },
          item: {
            id: 101,
            name: 'Archived Detail LoRA',
            type: 'LORA',
            creator: { username: 'offline-creator' },
            stats: { downloadCount: 12 },
            modelVersions: [
              {
                id: 201,
                name: 'v1',
                baseModel: 'Pony',
                trainedWords: ['detail boost'],
                files: [
                  {
                    id: 301,
                    name: 'detailBoost.safetensors',
                    type: 'Model',
                    primary: true,
                  },
                ],
                images: [
                  {
                    id: 601,
                    url: '/api/model-archive-media?type=lora&name=detailBoost.safetensors&index=0',
                    remoteUrl: 'https://image.test/detail.png',
                    type: 'image',
                    mediaType: 'image',
                    archiveSource: 'local',
                    width: 640,
                    height: 960,
                    meta: {
                      prompt: 'offline archive prompt',
                      negativePrompt: 'offline archive negative',
                      seed: 999,
                      sampler: 'Euler a',
                      steps: 30,
                      cfgScale: 7,
                      Size: '640x960',
                    },
                  },
                ],
              },
            ],
          },
        })
      }
      if (url.includes('/api/civitai/images?')) {
        return jsonResponse({ items: [] })
      }

      throw new Error(`Unexpected fetch ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const { default: AssetPreviewModal } = await import('../../src/components/asset-preview/AssetPreviewModal.vue')
    const wrapper = mount(AssetPreviewModal, {
      attachTo: document.body,
      props: {
        open: true,
        title: 'Local detail LoRA',
        previewUrl: '/api/model-preview?type=lora&name=detailBoost.safetensors',
        modelId: 101,
        versionId: 201,
        modelType: 'LORA',
        baseModel: 'Pony',
        fileName: 'detailBoost.safetensors',
        applyGenerationMetadata,
      },
    })

    await flushPromises()

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/civitai/models?'),
      expect.objectContaining({ headers: { Accept: 'application/json' } }),
    )
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/model-archive?'),
      expect.objectContaining({ headers: { Accept: 'application/json' } }),
    )
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/civitai/images?'),
      expect.objectContaining({ headers: { Accept: 'application/json' } }),
    )
    expect(wrapper.text()).toContain('Archived Detail LoRA')
    expect(wrapper.text()).toContain('offline-creator')

    await wrapper.get('button[aria-label="Show image and video details"]').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Offline archive')
    expect(wrapper.text()).toContain('offline archive prompt')
    expect(wrapper.text()).toContain('offline archive negative')
    expect(wrapper.text()).not.toContain('Civitai returned 404')

    const applyButton = wrapper.findAll('button').find((button) => button.text().includes('Apply metadata'))
    expect(applyButton).toBeTruthy()
    await applyButton?.trigger('click')

    expect(applyGenerationMetadata).toHaveBeenCalledWith(expect.objectContaining({
      prompt: 'offline archive prompt',
      negativePrompt: 'offline archive negative',
      seed: 999,
    }))
  })
})
