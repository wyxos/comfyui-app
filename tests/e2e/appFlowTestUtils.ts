import { page, type Locator } from 'vitest/browser'
import { createApp, type App as VueApp } from 'vue'
import { createMemoryHistory } from 'vue-router'
import { afterEach, beforeEach, vi } from 'vitest'

import App from '../../src/App.vue'
import { createAppRouter } from '../../src/router'
import { installMockApi } from '../fixtures/mockApi'

const renderedApps: Array<{ app: VueApp<Element>; host: HTMLElement }> = []
const onePixelPng =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lp2wngAAAABJRU5ErkJggg=='

type RenderCompanionAppOptions = {
  preserveLocalStorage?: boolean
}

export async function renderCompanionApp(
  path = '/',
  apiOptions: Parameters<typeof installMockApi>[0] = {},
  options: RenderCompanionAppOptions = {},
) {
  const api = installMockApi(apiOptions)
  const router = createAppRouter(createMemoryHistory())
  await router.push(path)
  if (!options.preserveLocalStorage) {
    window.localStorage.clear()
  }

  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: {
      writeText: vi.fn().mockResolvedValue(undefined),
      write: vi.fn().mockResolvedValue(undefined),
    },
  })
  vi.stubGlobal(
    'ClipboardItem',
    class MockClipboardItem {
      items: Record<string, Blob>

      constructor(items: Record<string, Blob>) {
        this.items = items
      }
    },
  )

  const host = document.body.appendChild(document.createElement('section'))
  const app = createApp(App)
  app.use(router)
  app.mount(host)
  await router.isReady()

  const screen = page.elementLocator(host) as Locator
  renderedApps.push({ app, host })

  return { api, router, screen, host, cleanup: () => cleanupRenderedApp(host) }
}

export async function cleanupRenderedApp(host: HTMLElement) {
  const renderedIndex = renderedApps.findIndex((entry) => entry.host === host)
  const renderedApp = renderedIndex >= 0 ? renderedApps.splice(renderedIndex, 1)[0] : null
  renderedApp?.app.unmount()
  renderedApp?.host.remove()
}

export function createImageFile(name: string) {
  const bytes = Uint8Array.from(atob(onePixelPng), (char) => char.charCodeAt(0))
  return new File([bytes], name, { type: 'image/png' })
}

export async function createSizedImageFile(name: string, width: number, height: number) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((nextBlob) => {
      if (nextBlob) {
        resolve(nextBlob)
      } else {
        reject(new Error('Could not create test image.'))
      }
    }, 'image/png')
  })

  return new File([blob], name, { type: 'image/png' })
}

export async function createTransparentImageFile(name: string) {
  const canvas = document.createElement('canvas')
  canvas.width = 1
  canvas.height = 1

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((nextBlob) => {
      if (nextBlob) {
        resolve(nextBlob)
      } else {
        reject(new Error('Could not create transparent test image.'))
      }
    }, 'image/png')
  })

  return new File([blob], name, { type: 'image/png' })
}

export function uploadFile(input: HTMLInputElement, file: File) {
  const dataTransfer = new DataTransfer()
  dataTransfer.items.add(file)
  Object.defineProperty(input, 'files', {
    configurable: true,
    value: dataTransfer.files,
  })
  input.dispatchEvent(new Event('change', { bubbles: true }))
}

export function pasteFile(target: EventTarget, file: File) {
  const dataTransfer = new DataTransfer()
  dataTransfer.items.add(file)
  const event = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent

  Object.defineProperty(event, 'clipboardData', {
    configurable: true,
    value: dataTransfer,
  })

  target.dispatchEvent(event)
}

export function dropFile(target: EventTarget, file: File) {
  const dataTransfer = new DataTransfer()
  dataTransfer.items.add(file)

  target.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer }))
  target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer }))
  target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }))
}

export function mockClipboardReadImages(files: File[]) {
  const read = vi.fn().mockResolvedValue(
    files.map((file) => ({
      types: [file.type],
      getType: vi.fn().mockResolvedValue(file),
    })),
  )

  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: {
      ...navigator.clipboard,
      read,
    },
  })

  return read
}

export function createJobOutput(filename: string, index: number) {
  return {
    filename,
    subfolder: '',
    type: 'output',
    variantId: `variant-${index}`,
    variantLabel: `Variant ${index}`,
    promptText: `prompt ${index}`,
    url: `/api/view?filename=${filename}&subfolder=&type=output`,
    fullPath: `C:\\mock\\${filename}`,
    parentDirectory: 'C:\\mock',
  }
}

export function createHistoryJob(outputs: unknown[]) {
  return {
    ok: true,
    promptId: 'history-prompt-1',
    batchId: null,
    batchIndex: null,
    state: 'complete',
    promptText: 'history prompt',
    negativePrompt: '',
    promptVariants: [
      {
        id: 'variant-1',
        label: 'Prompt',
        promptText: 'history prompt',
      },
    ],
    checkpoint: 'historyCheckpoint.safetensors',
    seed: 42,
    createdAt: Date.now() - 5000,
    updatedAt: Date.now() - 1000,
    queuePosition: null,
    queueNumber: null,
    cancelRequested: false,
    elapsedMs: 4000,
    currentNode: null,
    currentNodeLabel: 'Saved image',
    progressValue: null,
    progressMax: null,
    progressPercent: null,
    outputs,
    error: null,
    websocketConnected: true,
  }
}


beforeEach(() => {
  vi.restoreAllMocks()
})

afterEach(async () => {
  while (renderedApps.length) {
    const renderedApp = renderedApps.pop()
    renderedApp?.app.unmount()
    renderedApp?.host.remove()
  }
})
