import { describe, expect, it } from 'vitest'
import WebSocket from 'ws'
import { useServerHarness } from './serverApiTestUtils'

const { setupHarness, downloadItem } = useServerHarness()

function nextSocketMessage(socket: WebSocket) {
  return new Promise<Record<string, unknown>>((resolveMessage, rejectMessage) => {
    socket.once('message', (rawMessage) => {
      try {
        resolveMessage(JSON.parse(String(rawMessage)))
      } catch (error) {
        rejectMessage(error)
      }
    })
    socket.once('error', rejectMessage)
  })
}

describe('download websocket events', () => {
  it('streams download snapshots over a websocket endpoint', async () => {
    const server = await setupHarness()
    await server.writeDownloads([
      downloadItem('socket-download', 'complete', {
        modelName: 'Socket model',
        modelNsfw: false,
        modelMetadata: { nsfw: false },
      }),
    ])

    const socket = new WebSocket(server.baseUrl.replace(/^http/, 'ws') + '/api/civitai/downloads/events')
    try {
      const message = await nextSocketMessage(socket)

      expect(message).toMatchObject({
        type: 'downloads:snapshot',
        payload: {
          downloads: {
            items: [expect.objectContaining({ id: 'socket-download', modelName: 'Socket model' })],
          },
          panel: {
            items: [expect.objectContaining({ id: 'socket-download', modelName: 'Socket model' })],
          },
          summary: {
            counts: expect.objectContaining({ complete: 1, visibleComplete: 1 }),
          },
        },
      })
    } finally {
      socket.close()
    }
  })
})
