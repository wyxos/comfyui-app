import { join } from 'node:path'
import { afterEach } from 'vitest'
import { createServerHarness } from '../fixtures/serverHarness'

export function useServerHarness() {
  let harness: Awaited<ReturnType<typeof createServerHarness>> | null = null

  async function setupHarness(options?: Parameters<typeof createServerHarness>[0]) {
    harness = await createServerHarness(options)
    return harness
  }

  afterEach(async () => {
    await harness?.close()
    harness = null
  })

  function downloadItem(id: string, state: string, overrides: Record<string, unknown> = {}) {
    const targetPath = overrides.targetPath ?? join(harness?.loraDir ?? '', `${id}.safetensors`)
    return {
      id,
      state,
      modelId: 101,
      modelName: 'Mock Detail LoRA',
      modelType: 'LORA',
      versionId: 201,
      versionName: 'v1',
      fileId: 301,
      fileName: `${id}.safetensors`,
      fileType: 'Model',
      downloadUrl: 'https://download.test/detail.safetensors',
      targetPath,
      partialPath: `${targetPath}.part`,
      sidecarPath: `${targetPath}.civitai.info`,
      previewImages: [],
      previewPaths: [],
      bytesDownloaded: 0,
      totalBytes: 2048,
      progressPercent: 0,
      createdAt: 1,
      updatedAt: 1,
      startedAt: null,
      finishedAt: null,
      dismissedAt: null,
      error: null,
      ...overrides,
    }
  }

  return { downloadItem, setupHarness }
}
