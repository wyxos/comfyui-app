import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { describe, expect, it } from 'vitest'

import {
  buildQueueSummaryForPromptIds,
  configureCompanionServerForTests,
  createCompanionServer,
  createDownloadsResponse,
  extractInputImageNameFromHistory,
  getQueueSnapshot,
  mergeJobOutputs,
  normalizeQueueEntries,
  resetJobStoreRuntimeState,
  serializeDownload,
  startCompanionServer,
} from '../../server/index.mjs'
import { handleComfySocketMessage } from '../../server/comfy-socket.mjs'
import { ensureJob } from '../../server/job-state.mjs'
import { deletePersistedJob } from '../../server/job-store.mjs'

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

  it('keeps websocket progress events from reopening terminal ComfyUI jobs', () => {
    const promptId = 'prompt-progress-websocket-terminal'
    resetJobStoreRuntimeState()
    deletePersistedJob(promptId)
    const job = ensureJob(promptId, {
      nodeLabels: {
        9: 'Sampling prompt',
      },
    })

    handleComfySocketMessage(JSON.stringify({
      type: 'progress',
      data: { prompt_id: promptId, node: '9', value: 12, max: 30 },
    }))
    expect(job).toMatchObject({
      state: 'running',
      currentNode: '9',
      currentNodeLabel: 'Sampling prompt',
      progressValue: 12,
      progressMax: 30,
    })

    handleComfySocketMessage(JSON.stringify({
      type: 'execution_success',
      data: { prompt_id: promptId },
    }))
    expect(job).toMatchObject({
      state: 'complete',
      currentNodeLabel: 'Completed',
      progressValue: 30,
      progressMax: 30,
    })

    handleComfySocketMessage(JSON.stringify({
      type: 'executing',
      data: { prompt_id: promptId, node: null },
    }))
    handleComfySocketMessage(JSON.stringify({
      type: 'progress_state',
      data: {
        prompt_id: promptId,
        nodes: {
          9: {
            state: 'running',
            node_id: '9',
            real_node_id: '9',
            value: 14,
            max: 30,
          },
        },
      },
    }))

    expect(job).toMatchObject({
      state: 'complete',
      currentNodeLabel: 'Completed',
      progressValue: 30,
      progressMax: 30,
    })

    deletePersistedJob(promptId)
  })

  it('marks websocket interruption as cancelled without waiting for history polling', () => {
    const promptId = 'prompt-cancelled-websocket-interrupted'
    resetJobStoreRuntimeState()
    deletePersistedJob(promptId)
    const job = ensureJob(promptId, { cancelRequestedAt: 1000 })

    handleComfySocketMessage(JSON.stringify({
      type: 'execution_interrupted',
      data: { prompt_id: promptId, node_id: '9' },
    }))

    expect(job).toMatchObject({
      state: 'cancelled',
      queuePosition: null,
      queueNumber: null,
      currentNode: '9',
      currentNodeLabel: 'Cancelled',
      error: null,
      progressValue: null,
      progressMax: null,
    })

    deletePersistedJob(promptId)
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

  it('returns JSON for unmatched API routes instead of the frontend shell', async () => {
    const server = createCompanionServer({ connectWebSocket: false })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))

    try {
      const address = server.address() as AddressInfo
      const response = await fetch(`http://127.0.0.1:${address.port}/api/does-not-exist`)
      await expect(response.json()).resolves.toMatchObject({
        ok: false,
        error: 'route-not-found',
      })
      expect(response.status).toBe(404)
      expect(response.headers.get('content-type')).toContain('application/json')
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()))
      })
    }
  })

  it('proxies frontend requests to the Vite dev origin when configured', async () => {
    let requestedPath = ''
    const frontendServer = createServer((request, response) => {
      requestedPath = request.url ?? ''
      response.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' })
      response.end('dev asset body')
    })
    await new Promise<void>((resolve) => frontendServer.listen(0, '127.0.0.1', resolve))
    const frontendAddress = frontendServer.address() as AddressInfo
    const server = createCompanionServer({
      connectWebSocket: false,
      devAssetOrigin: new URL(`http://127.0.0.1:${frontendAddress.port}/`),
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))

    try {
      const address = server.address() as AddressInfo
      const response = await fetch(`http://127.0.0.1:${address.port}/src/main.ts?cache=skip`)
      await expect(response.text()).resolves.toBe('dev asset body')
      expect(response.status).toBe(200)
      expect(requestedPath).toBe('/src/main.ts?cache=skip')
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()))
      })
      await new Promise<void>((resolve, reject) => {
        frontendServer.close((error) => (error ? reject(error) : resolve()))
      })
    }
  })

  it('does not connect a ComfyUI websocket when the HTTP server cannot bind', async () => {
    const blocker = createServer()
    await new Promise<void>((resolve) => blocker.listen(0, '127.0.0.1', resolve))
    const blockedPort = (blocker.address() as AddressInfo).port
    const originalPort = process.env.COMFY_COMPANION_PORT
    const originalWebSocket = globalThis.WebSocket
    let constructedSockets = 0

    class FakeWebSocket {
      static CONNECTING = 0
      static OPEN = 1
      readyState = FakeWebSocket.CONNECTING

      constructor() {
        constructedSockets += 1
      }

      addEventListener() {}
    }

    let restoreAdapters: (() => void) | null = null
    let server: ReturnType<typeof startCompanionServer> | null = null

    try {
      process.env.COMFY_COMPANION_PORT = String(blockedPort)
      restoreAdapters = configureCompanionServerForTests()
      globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket

      server = startCompanionServer()
      await expect(new Promise((resolve) => server?.once('error', resolve))).resolves.toMatchObject({
        code: 'EADDRINUSE',
      })

      expect(constructedSockets).toBe(0)
    } finally {
      if (server?.listening) {
        await new Promise<void>((resolve, reject) => {
          server?.close((error) => (error ? reject(error) : resolve()))
        })
      }
      await new Promise<void>((resolve, reject) => {
        blocker.close((error) => (error ? reject(error) : resolve()))
      })
      if (originalPort === undefined) {
        delete process.env.COMFY_COMPANION_PORT
      } else {
        process.env.COMFY_COMPANION_PORT = originalPort
      }
      globalThis.WebSocket = originalWebSocket
      restoreAdapters?.()
    }
  })
})
