import { vi } from 'vitest'

type DownloadSnapshotFactory = () => unknown

export function installMockDownloadEventsSocket(createSnapshot: DownloadSnapshotFactory) {
  const sockets = new Set<MockDownloadEventsSocket>()

  class MockDownloadEventsSocket {
    static CONNECTING = 0
    static OPEN = 1
    static CLOSED = 3
    readyState = MockDownloadEventsSocket.CONNECTING
    listeners = new Map<string, Array<(event: Event | MessageEvent) => void>>()
    url: string

    constructor(url: string) {
      this.url = url
      sockets.add(this)
      queueMicrotask(() => {
        if (this.readyState === MockDownloadEventsSocket.CLOSED) {
          return
        }

        this.readyState = MockDownloadEventsSocket.OPEN
        this.dispatch('open', new Event('open'))
        this.emitSnapshot()
      })
    }

    addEventListener(type: string, listener: (event: Event | MessageEvent) => void) {
      const listeners = this.listeners.get(type) ?? []
      listeners.push(listener)
      this.listeners.set(type, listeners)
    }

    removeEventListener(type: string, listener: (event: Event | MessageEvent) => void) {
      const listeners = this.listeners.get(type) ?? []
      this.listeners.set(type, listeners.filter((candidate) => candidate !== listener))
    }

    close() {
      if (this.readyState === MockDownloadEventsSocket.CLOSED) {
        return
      }

      this.readyState = MockDownloadEventsSocket.CLOSED
      sockets.delete(this)
      this.dispatch('close', new Event('close'))
    }

    dispatch(type: string, event: Event | MessageEvent) {
      for (const listener of this.listeners.get(type) ?? []) {
        listener(event)
      }
    }

    emitSnapshot() {
      if (this.readyState === MockDownloadEventsSocket.CLOSED) {
        return
      }

      this.dispatch('message', new MessageEvent('message', {
        data: JSON.stringify({
          type: 'downloads:snapshot',
          payload: createSnapshot(),
        }),
      }))
    }
  }

  vi.stubGlobal('WebSocket', MockDownloadEventsSocket)

  return {
    broadcast() {
      for (const socket of sockets) {
        socket.emitSnapshot()
      }
    },
  }
}
