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

export async function renderCompanionApp(path = '/', apiOptions: Parameters<typeof installMockApi>[0] = {}) {
  const api = installMockApi(apiOptions)
  const router = createAppRouter(createMemoryHistory())
  await router.push(path)
  window.localStorage.clear()

  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: {
      writeText: vi.fn().mockResolvedValue(undefined),
    },
  })

  const host = document.body.appendChild(document.createElement('section'))
  const app = createApp(App)
  app.use(router)
  app.mount(host)
  await router.isReady()

  const screen = page.elementLocator(host) as Locator
  renderedApps.push({ app, host })

  return { api, router, screen, host }
}

export function createImageFile(name: string) {
  const bytes = Uint8Array.from(atob(onePixelPng), (char) => char.charCodeAt(0))
  return new File([bytes], name, { type: 'image/png' })
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

export function createJobOutput(filename: string, index: number) {
  return {
    filename,
    subfolder: '',
    type: 'output',
    variantId: `variant-${index}`,
    variantLabel: `Variant ${index}`,
    promptText: `prompt ${index}`,
    isImproved: false,
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
        label: 'Original prompt',
        promptText: 'history prompt',
        isImproved: false,
      },
    ],
    improvedPrompt: null,
    promptImprovementError: null,
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
