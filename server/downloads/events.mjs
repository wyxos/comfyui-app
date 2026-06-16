import { WebSocket, WebSocketServer } from 'ws'
import { civitaiDownloads } from '../config.mjs'
import {
  createDownloadsPanelResponse,
  createDownloadsSummaryResponse,
  ensureDownloadsLoaded,
  serializeDownloadsResponse,
} from './state.mjs'

const downloadEventPath = '/api/civitai/downloads/events'
const broadcastDelayMs = 250
const downloadEventServers = new Set()
let broadcastTimer = null

export async function buildDownloadsSnapshot() {
  await ensureDownloadsLoaded()

  return {
    type: 'downloads:snapshot',
    payload: {
      downloads: serializeDownloadsResponse(),
      panel: createDownloadsPanelResponse(civitaiDownloads.values()),
      summary: createDownloadsSummaryResponse(civitaiDownloads.values()),
    },
  }
}

function sendSocketJson(socket, payload) {
  if (socket.readyState !== WebSocket.OPEN) {
    return
  }

  socket.send(JSON.stringify(payload))
}

async function sendDownloadsSnapshot(socket) {
  sendSocketJson(socket, await buildDownloadsSnapshot())
}

function activeDownloadEventClients() {
  return [...downloadEventServers].flatMap((server) =>
    [...server.clients].filter((socket) => socket.readyState === WebSocket.OPEN),
  )
}

async function broadcastDownloadsSnapshot() {
  broadcastTimer = null
  const clients = activeDownloadEventClients()
  if (!clients.length) {
    return
  }

  const snapshot = await buildDownloadsSnapshot()
  for (const client of clients) {
    sendSocketJson(client, snapshot)
  }
}

export function queueDownloadsSnapshotBroadcast({ immediate = false } = {}) {
  if (!activeDownloadEventClients().length || broadcastTimer) {
    return
  }

  broadcastTimer = setTimeout(() => {
    void broadcastDownloadsSnapshot()
  }, immediate ? 0 : broadcastDelayMs)
}

export function installDownloadsEventSocket(httpServer) {
  const socketServer = new WebSocketServer({ noServer: true })
  downloadEventServers.add(socketServer)

  httpServer.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? '127.0.0.1'}`)
    if (url.pathname !== downloadEventPath) {
      socket.destroy()
      return
    }

    socketServer.handleUpgrade(request, socket, head, (webSocket) => {
      socketServer.emit('connection', webSocket, request)
    })
  })

  socketServer.on('connection', (socket) => {
    void sendDownloadsSnapshot(socket).catch(() => {
      socket.close()
    })
  })

  httpServer.once('close', () => {
    downloadEventServers.delete(socketServer)
    socketServer.close()
    if (!downloadEventServers.size && broadcastTimer) {
      clearTimeout(broadcastTimer)
      broadcastTimer = null
    }
  })

  return socketServer
}
