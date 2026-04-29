import { enableAutoUnmount } from '@vue/test-utils'
import { afterEach, vi } from 'vitest'

enableAutoUnmount(afterEach)

class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = MockResizeObserver as typeof ResizeObserver
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})
