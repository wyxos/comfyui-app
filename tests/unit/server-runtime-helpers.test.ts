import type { AddressInfo } from 'node:net'
import { describe, expect, it } from 'vitest'

import {
  buildQueueSummaryForPromptIds,
  createCompanionServer,
  createDownloadsResponse,
  extractInputImageNameFromHistory,
  getQueueSnapshot,
  mergeJobOutputs,
  normalizeQueueEntries,
  serializeDownload,
} from '../../server/index.mjs'

describe('server runtime helpers', () => {
  it('serializes downloads without abort controllers and summarizes counts', () => {
    const serialized = serializeDownload({
      id: 'download-1',
      state: 'complete',
      abortController: new AbortController(),
      previewImage: {
        id: 1,
        url: ' https://example.test/preview.png ',
        hash: ' abc ',
      },
      updatedAt: 10,
    })

    expect(serialized).not.toHaveProperty('abortController')
    expect(serialized.previewImage).toMatchObject({
      id: 1,
      url: 'https://example.test/preview.png',
      hash: 'abc',
    })

    const response = createDownloadsResponse([
      { id: 'complete', state: 'complete', updatedAt: 10 },
      { id: 'queued', state: 'queued', updatedAt: 1 },
      { id: 'downloading', state: 'downloading', updatedAt: 5 },
    ])

    expect(response.items.map((item: { id: string }) => item.id)).toEqual(['downloading', 'queued', 'complete'])
    expect(response.counts).toMatchObject({
      queued: 1,
      downloading: 1,
      complete: 1,
    })
  })

  it('summarizes ComfyUI queue state for app-owned prompt ids', () => {
    const queueSnapshot = getQueueSnapshot({
      queue_running: [[12, 'app-running']],
      queue_pending: [
        [13, 'external-pending'],
        [14, 'app-pending'],
      ],
    })

    expect(normalizeQueueEntries(null, 'queued')).toEqual([])
    expect(buildQueueSummaryForPromptIds(queueSnapshot, ['app-running', 'app-pending'])).toEqual({
      running: 1,
      pending: 2,
      appRunning: 1,
      appPending: 1,
      externalRunning: 0,
      externalPending: 1,
    })
  })

  it('extracts the main img2img input from ComfyUI history', () => {
    expect(
      extractInputImageNameFromHistory({
        prompt: [
          1,
          'prompt-id',
          {
            7: {
              class_type: 'LoadImage',
              inputs: { image: 'main-input.png' },
            },
            8: {
              class_type: 'ImageScale',
              inputs: { image: ['7', 0] },
            },
            9: {
              class_type: 'VAEEncode',
              inputs: { pixels: ['8', 0] },
            },
            10: {
              class_type: 'KSampler',
              inputs: { latent_image: ['9', 0] },
            },
            20: {
              class_type: 'LoadImage',
              inputs: { image: 'controlnet-only.png' },
            },
          },
        ],
      }),
    ).toBe('main-input.png')
  })

  it('merges job outputs by variant and image reference', () => {
    expect(
      mergeJobOutputs(
        [{ variantId: 'original', type: 'output', subfolder: '', filename: 'one.png' }],
        [
          { variantId: 'original', type: 'output', subfolder: '', filename: 'one.png', promptText: 'new' },
          { variantId: 'improved', type: 'output', subfolder: '', filename: 'two.png' },
        ],
      ),
    ).toEqual([
      { variantId: 'original', type: 'output', subfolder: '', filename: 'one.png', promptText: 'new' },
      { variantId: 'improved', type: 'output', subfolder: '', filename: 'two.png' },
    ])
  })

  it('creates an importable HTTP server without connecting to ComfyUI', async () => {
    const server = createCompanionServer({ connectWebSocket: false })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))

    try {
      const address = server.address() as AddressInfo
      const response = await fetch(`http://127.0.0.1:${address.port}/health`)
      await expect(response.json()).resolves.toMatchObject({
        ok: true,
        app: 'comfyui-companion-app',
      })
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()))
      })
    }
  })
})
