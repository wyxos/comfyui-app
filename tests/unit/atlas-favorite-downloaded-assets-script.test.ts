import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { runAtlasFavoriteDownloadedAssets } from '../../scripts/atlas-favorite-downloaded-assets.mjs'
import { useServerHarness } from './serverApiTestUtils'

const { setupHarness, downloadItem } = useServerHarness()

function logger() {
  const lines: string[] = []
  return {
    lines,
    log: (message: unknown) => lines.push(String(message)),
    error: (message: unknown) => lines.push(String(message)),
  }
}

async function writeSettings(configDir: string) {
  await mkdir(configDir, { recursive: true })
  await writeFile(
    join(configDir, 'settings.json'),
    JSON.stringify({
      atlas: {
        baseUrl: 'https://atlas.test',
        apiKey: 'atlas-secret-1234',
      },
    }),
    'utf8',
  )
}

async function writeDownloadedVersion(server: Awaited<ReturnType<typeof setupHarness>>, options: {
  id: string
  versionId: number
  previews: Array<{ id: number; url: string }>
}) {
  const targetPath = join(server.loraDir, `${options.id}.safetensors`)
  const sidecarPath = `${targetPath}.civitai.info`
  await writeFile(targetPath, 'model file', 'utf8')
  await writeFile(
    sidecarPath,
    JSON.stringify({
      archiveVersion: 1,
      source: 'civitai',
      modelId: 101,
      modelName: 'Mock Detail LoRA',
      modelType: 'LORA',
      versionId: options.versionId,
      versionName: `v${options.versionId}`,
      previewImages: options.previews.map((preview) => ({
        id: preview.id,
        url: preview.url,
        remoteUrl: preview.url,
        mediaType: 'image',
        width: 512,
        height: 768,
      })),
    }),
    'utf8',
  )
  return downloadItem(options.id, 'complete', {
    targetPath,
    sidecarPath,
    versionId: options.versionId,
    versionName: `v${options.versionId}`,
    fileName: `${options.id}.safetensors`,
    finishedAt: 10,
    progressPercent: 100,
  })
}

describe('Atlas favorite downloaded assets script', () => {
  it('dry-runs downloaded assets and versions without calling Atlas', async () => {
    const server = await setupHarness()
    const first = await writeDownloadedVersion(server, {
      id: 'detail-v1',
      versionId: 201,
      previews: [
        { id: 601, url: 'https://image.test/601.png' },
        { id: 602, url: 'https://image.test/602.png' },
      ],
    })
    const second = await writeDownloadedVersion(server, {
      id: 'detail-v2',
      versionId: 202,
      previews: [{ id: 701, url: 'https://image.test/701.png' }],
    })
    await server.writeDownloads([first, second])

    const output = logger()
    const summary = await runAtlasFavoriteDownloadedAssets({
      delayMs: 0,
      dryRun: true,
      logger: output,
    })

    expect(summary).toMatchObject({
      dryRun: true,
      assetCount: 1,
      versionCount: 2,
      previewCount: 3,
      reaction: { planned: 3, completed: 0, failed: 0 },
      tab: { planned: 2, completed: 0, failed: 0 },
    })
    expect(output.lines.some((line) => line.includes('[dry-run reaction 3/3]'))).toBe(true)
    expect(server.calls.some((call) => call.url.origin === 'https://atlas.test')).toBe(false)
  })

  it('favorites every downloaded preview and opens one Atlas tab per downloaded version', async () => {
    const server = await setupHarness()
    await writeSettings(server.configDir)
    const download = await writeDownloadedVersion(server, {
      id: 'detail-v1',
      versionId: 201,
      previews: [
        { id: 601, url: 'https://image.test/601.png' },
        { id: 602, url: 'https://image.test/602.png' },
      ],
    })
    await server.writeDownloads([download])

    const summary = await runAtlasFavoriteDownloadedAssets({
      delayMs: 0,
      dryRun: false,
      logger: logger(),
    })

    expect(summary).toMatchObject({
      dryRun: false,
      assetCount: 1,
      versionCount: 1,
      previewCount: 2,
      reaction: { planned: 2, completed: 2, failed: 0 },
      tab: { planned: 1, completed: 1, failed: 0 },
    })

    const reactionCalls = server.calls.filter((call) => call.url.pathname === '/api/extension/civitai/reactions')
    expect(reactionCalls).toHaveLength(2)
    expect(reactionCalls.map((call) => call.body)).toEqual([
      expect.objectContaining({
        type: 'love',
        download_behavior: 'queue',
        item: expect.objectContaining({ id: 601, modelId: 101, modelVersionId: 201 }),
      }),
      expect.objectContaining({
        type: 'love',
        download_behavior: 'queue',
        item: expect.objectContaining({ id: 602, modelId: 101, modelVersionId: 201 }),
      }),
    ])
    expect(reactionCalls[0]?.headers.get('x-atlas-api-key')).toBe('atlas-secret-1234')

    const tabCall = server.calls.find((call) => call.url.pathname === '/api/extension/browse-tabs/civitai-model')
    expect(tabCall?.body).toMatchObject({
      model_id: 101,
      model_version_id: 201,
      type: 'all',
      sort: 'Newest',
      period: 'AllTime',
      nsfw: true,
    })
  })
})
