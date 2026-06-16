import type { DownloadsResponse, DownloadsSummaryResponse } from './assetDownloadTypes'

export type AssetDownloadSnapshot = {
  downloads?: DownloadsResponse
  panel?: DownloadsResponse
  summary?: DownloadsSummaryResponse
}

type AssetDownloadSnapshotListener = (snapshot: AssetDownloadSnapshot) => void

const reconnectDelayMs = 3000
const listeners = new Set<AssetDownloadSnapshotListener>()
let socket: WebSocket | null = null
let reconnectTimer: number | undefined

function downloadEventsUrl() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}/api/civitai/downloads/events`
}

function notifySnapshotListeners(snapshot: AssetDownloadSnapshot) {
  for (const listener of listeners) {
    listener(snapshot)
  }
}

function scheduleReconnect() {
  if (reconnectTimer !== undefined || !listeners.size) {
    return
  }

  reconnectTimer = window.setTimeout(() => {
    reconnectTimer = undefined
    openDownloadEventsSocket()
  }, reconnectDelayMs)
}

function openDownloadEventsSocket() {
  if (!listeners.size || typeof WebSocket !== 'function') {
    return
  }

  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    return
  }

  const nextSocket = new WebSocket(downloadEventsUrl())
  socket = nextSocket

  nextSocket.addEventListener('message', (event) => {
    try {
      const message = JSON.parse(String(event.data)) as { type?: string; payload?: AssetDownloadSnapshot }
      if (message?.type === 'downloads:snapshot' && message.payload) {
        notifySnapshotListeners(message.payload)
      }
    } catch {
      // Ignore malformed socket messages.
    }
  })

  nextSocket.addEventListener('close', () => {
    if (socket === nextSocket) {
      socket = null
      scheduleReconnect()
    }
  })

  nextSocket.addEventListener('error', () => {
    try {
      nextSocket.close()
    } catch {}
  })
}

function closeDownloadEventsSocket() {
  if (reconnectTimer !== undefined) {
    window.clearTimeout(reconnectTimer)
    reconnectTimer = undefined
  }

  const activeSocket = socket
  socket = null
  activeSocket?.close()
}

export function subscribeAssetDownloadEvents(listener: AssetDownloadSnapshotListener) {
  listeners.add(listener)
  openDownloadEventsSocket()

  return () => {
    listeners.delete(listener)
    if (!listeners.size) {
      closeDownloadEventsSocket()
    }
  }
}
