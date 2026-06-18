import {
  atlasDownloadProgressEventFromPayload,
  type AtlasDownloadProgressEvent,
  type AtlasReverbConfig,
} from './assetPreviewAtlasMedia'

export type AtlasDownloadProgressSubscription = {
  close: () => void
}

const DOWNLOAD_PROGRESS_EVENTS = new Set([
  'DownloadTransferCreated',
  'DownloadTransferQueued',
  'DownloadTransferProgressUpdated',
])

type PusherMessage = {
  event: string
  data: unknown
}

function parseJson(value: unknown) {
  if (typeof value !== 'string') {
    return value
  }

  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

function parsePusherMessage(raw: unknown): PusherMessage | null {
  const message = parseJson(raw)
  if (!message || typeof message !== 'object') {
    return null
  }

  const payload = message as { event?: unknown, data?: unknown }
  return typeof payload.event === 'string'
    ? { event: payload.event, data: parseJson(payload.data) }
    : null
}

function normalizePort(value: AtlasReverbConfig['port']) {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return String(Math.trunc(value))
  }

  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    return value.trim()
  }

  return ''
}

function reverbWebSocketUrl(config: AtlasReverbConfig) {
  const host = typeof config.host === 'string' ? config.host.trim() : ''
  const key = typeof config.key === 'string' ? config.key.trim() : ''
  const protocol = config.scheme === 'https' ? 'wss' : 'ws'
  const url = new URL(`/app/${encodeURIComponent(key)}`, `${protocol}://${host}`)
  const port = normalizePort(config.port)
  if (port) {
    url.port = port
  }

  url.searchParams.set('protocol', '7')
  url.searchParams.set('client', 'js')
  url.searchParams.set('version', '8.4.0')
  url.searchParams.set('flash', 'false')
  return url.toString()
}

function canConnect(config: AtlasReverbConfig) {
  return config.enabled === true &&
    typeof config.key === 'string' &&
    config.key.trim() !== '' &&
    typeof config.host === 'string' &&
    config.host.trim() !== '' &&
    typeof config.channel === 'string' &&
    config.channel.trim() !== '' &&
    typeof WebSocket !== 'undefined'
}

async function authorizeChannel(socketId: string, channelName: string) {
  const response = await fetch('/api/atlas/broadcasting/auth', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({
      socket_id: socketId,
      channel_name: channelName,
    }),
  })

  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(`Atlas Reverb auth failed with status ${response.status}.`)
  }

  return payload
}

function sendPusherMessage(socket: WebSocket, event: string, data: unknown) {
  socket.send(JSON.stringify({ event, data }))
}

function pusherSubscribeData(channel: string, auth: unknown) {
  const payload = auth && typeof auth === 'object' ? auth as { auth?: unknown, channel_data?: unknown } : {}
  return {
    channel,
    ...(typeof payload.auth === 'string' ? { auth: payload.auth } : {}),
    ...(typeof payload.channel_data === 'string' ? { channel_data: payload.channel_data } : {}),
  }
}

export function subscribeAtlasDownloadProgress(
  config: AtlasReverbConfig | null | undefined,
  onEvent: (event: AtlasDownloadProgressEvent) => void,
): AtlasDownloadProgressSubscription | null {
  if (!config || !canConnect(config)) {
    return null
  }

  const channelName = config.channel?.trim() ?? ''
  const socket = new WebSocket(reverbWebSocketUrl(config))
  let closed = false

  socket.addEventListener('message', (message) => {
    if (closed) {
      return
    }

    const pusherMessage = parsePusherMessage(message.data)
    if (!pusherMessage) {
      return
    }

    if (pusherMessage.event === 'pusher:connection_established') {
      const socketId = typeof (pusherMessage.data as { socket_id?: unknown })?.socket_id === 'string'
        ? (pusherMessage.data as { socket_id: string }).socket_id
        : ''
      if (!socketId) {
        return
      }

      void authorizeChannel(socketId, channelName)
        .then((auth) => {
          if (!closed) {
            sendPusherMessage(socket, 'pusher:subscribe', pusherSubscribeData(channelName, auth))
          }
        })
        .catch(() => undefined)
      return
    }

    if (pusherMessage.event === 'pusher:ping') {
      sendPusherMessage(socket, 'pusher:pong', {})
      return
    }

    if (!DOWNLOAD_PROGRESS_EVENTS.has(pusherMessage.event)) {
      return
    }

    const progressEvent = atlasDownloadProgressEventFromPayload(pusherMessage.event, pusherMessage.data)
    if (progressEvent) {
      onEvent(progressEvent)
    }
  })

  return {
    close: () => {
      closed = true
      socket.close()
    },
  }
}
