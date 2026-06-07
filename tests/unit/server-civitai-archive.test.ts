import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { refreshCivitaiArchiveForDownload } from '../../server/civitai-archive.mjs'
import { runCivitaiArchiveBackfill } from '../../scripts/backfill-civitai-archives.mjs'
import { describe, expect, it } from 'vitest'
import { serializeDownload } from '../../server/downloads/state.mjs'
import { useServerHarness } from './serverApiTestUtils'

const { setupHarness, downloadItem } = useServerHarness()

async function fileExists(filePath: string) {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

describe('local Civitai archives', () => {
  it('serves archived model metadata and media without arbitrary filesystem access', async () => {
    const server = await setupHarness()
    const archiveDir = join(server.loraDir, 'detailBoost.previews')
    const mediaPath = join(archiveDir, '0001-601.png')
    await mkdir(archiveDir, { recursive: true })
    await writeFile(mediaPath, 'archived preview', 'utf8')
    await writeFile(
      join(server.loraDir, 'detailBoost.safetensors.civitai.info'),
      JSON.stringify({
        archiveVersion: 1,
        source: 'civitai',
        modelId: 101,
        modelName: 'Mock Detail LoRA',
        modelType: 'LORA',
        model: {
          id: 101,
          name: 'Mock Detail LoRA',
          type: 'LORA',
          creator: { username: 'offline-creator' },
          stats: { downloadCount: 77 },
          tags: ['detail'],
        },
        versionId: 201,
        versionName: 'v1',
        baseModel: 'Pony',
        trainedWords: ['detail boost'],
        files: [
          {
            id: 301,
            name: 'detailBoost.safetensors',
            type: 'Model',
            primary: true,
            hashes: { SHA256: 'MOCKHASH' },
          },
        ],
        previewImages: [
          {
            id: 601,
            url: 'https://image.test/detail.png',
            remoteUrl: 'https://image.test/detail.png',
            path: mediaPath,
            mediaType: 'image',
            width: 640,
            height: 960,
            meta: {
              prompt: 'offline detail prompt',
              negativePrompt: 'offline negative',
              seed: 12345,
              sampler: 'Euler a',
            },
          },
        ],
        archiveStatus: {
          state: 'ready',
          mediaTotal: 1,
          mediaDownloaded: 1,
          mediaFailed: 0,
        },
      }),
      'utf8',
    )

    const archive = await server.request('/api/model-archive?type=lora&name=detailBoost.safetensors')

    expect(archive.response.status).toBe(200)
    expect(archive.payload).toMatchObject({
      ok: true,
      source: 'local-archive',
      item: {
        id: 101,
        name: 'Mock Detail LoRA',
        type: 'LORA',
        creator: { username: 'offline-creator' },
        modelVersions: [
          {
            id: 201,
            name: 'v1',
            baseModel: 'Pony',
            trainedWords: ['detail boost'],
            images: [
              {
                id: 601,
                remoteUrl: 'https://image.test/detail.png',
                mediaType: 'image',
                meta: expect.objectContaining({ prompt: 'offline detail prompt' }),
              },
            ],
          },
        ],
      },
      archiveStatus: expect.objectContaining({
        state: 'ready',
        mediaDownloaded: 1,
      }),
    })
    const localUrl = archive.payload.item.modelVersions[0].images[0].url
    expect(localUrl).toMatch(/^\/api\/model-archive-media\?/)

    await expect(server.request(localUrl)).resolves.toMatchObject({
      response: expect.objectContaining({ status: 200 }),
      payload: 'archived preview',
    })
    await expect(server.request('/api/model-archive?type=lora&name=..%2Fescape.safetensors')).resolves.toMatchObject({
      response: expect.objectContaining({ status: 400 }),
      payload: expect.objectContaining({ error: 'invalid-model-name' }),
    })
    await expect(server.request('/api/model-archive-media?type=lora&name=..%2Fescape.safetensors&index=0')).resolves.toMatchObject({
      response: expect.objectContaining({ status: 400 }),
      payload: expect.objectContaining({ error: 'invalid-model-name' }),
    })
  })

  it('repairs completed downloads into archive sidecars with fetched media and metadata', async () => {
    const server = await setupHarness({
      upstream: {
        civitaiVersion: {
          id: 201,
          name: 'v1',
          baseModel: 'Pony',
          trainedWords: ['detail boost'],
          model: { id: 101, name: 'Mock Detail LoRA', type: 'LORA', nsfw: false },
          files: [{ id: 301, name: 'detailBoost.safetensors', primary: true, hashes: { SHA256: 'MOCKHASH' } }],
          images: [
            {
              url: 'https://image.test/601.png',
              type: 'image',
              width: 640,
              height: 960,
            },
          ],
        },
        civitaiImages: {
          items: [
            {
              id: 601,
              url: 'https://image.test/601.png',
              meta: {
                prompt: 'hydrated archive prompt',
                negativePrompt: 'hydrated archive negative',
                seed: 456,
                sampler: 'DPM++ 2M',
              },
            },
          ],
          metadata: { totalItems: 1 },
        },
      },
    })
    const targetPath = join(server.loraDir, 'complete.safetensors')
    await writeFile(targetPath, 'complete target', 'utf8')
    await server.writeDownloads([
      downloadItem('complete', 'complete', {
        targetPath,
        sidecarPath: `${targetPath}.civitai.info`,
        previewImages: [{ id: 500, url: 'https://image.test/old.png' }],
        finishedAt: 10,
        progressPercent: 100,
      }),
    ])

    await expect(server.json('POST', '/api/civitai/downloads/repair-previews')).resolves.toMatchObject({
      payload: expect.objectContaining({
        ok: true,
        repaired: 1,
        items: [
          expect.objectContaining({
            id: 'complete',
            previewUrl: expect.stringMatching(/^\/api\/civitai\/downloads\/complete\/preview$/),
          }),
        ],
      }),
    })

    const sidecar = JSON.parse(await readFile(`${targetPath}.civitai.info`, 'utf8'))
    expect(sidecar).toMatchObject({
      archiveVersion: 1,
      source: 'civitai',
      modelId: 101,
      versionId: 201,
      model: expect.objectContaining({
        id: 101,
        name: 'Mock Detail LoRA',
        type: 'LORA',
      }),
      files: [
        expect.objectContaining({
          id: 301,
          name: 'detailBoost.safetensors',
          hashes: { SHA256: 'MOCKHASH' },
        }),
      ],
      previewImages: [
        expect.objectContaining({
          id: 601,
          remoteUrl: 'https://image.test/601.png',
          path: expect.stringContaining('complete.previews'),
          mediaType: 'image',
          meta: expect.objectContaining({ prompt: 'hydrated archive prompt' }),
        }),
      ],
      archiveStatus: expect.objectContaining({
        mediaTotal: 1,
        mediaDownloaded: 1,
        mediaFailed: 0,
      }),
    })
    expect(sidecar.previewImages).toHaveLength(1)
    expect(sidecar.previewImages.some((image: { id?: number }) => image.id === 500)).toBe(false)

    const imageLookups = server.fetchMock.mock.calls
      .map(([input]) => new URL(String(input)))
      .filter((url) => url.pathname === '/api/v1/images')
    expect(imageLookups).toHaveLength(1)
    expect(imageLookups[0].searchParams.get('imageId')).toBe('601')
    expect(imageLookups[0].searchParams.has('modelVersionId')).toBe(false)
  })

  it('falls back to old download preview records only when version previews are unavailable', async () => {
    const server = await setupHarness({
      upstream: {
        civitaiVersion: {
          id: 201,
          name: 'v1',
          baseModel: 'Pony',
          trainedWords: ['detail boost'],
          model: { id: 101, name: 'Mock Detail LoRA', type: 'LORA', nsfw: false },
          files: [{ id: 301, name: 'detailBoost.safetensors', primary: true, hashes: { SHA256: 'MOCKHASH' } }],
          images: [],
        },
      },
    })
    const targetPath = join(server.loraDir, 'legacy.safetensors')
    await writeFile(targetPath, 'legacy target', 'utf8')
    await server.writeDownloads([
      downloadItem('legacy', 'complete', {
        targetPath,
        sidecarPath: `${targetPath}.civitai.info`,
        previewImages: [{ id: 500, url: 'https://image.test/old.png', meta: { prompt: 'legacy prompt' } }],
        finishedAt: 10,
        progressPercent: 100,
      }),
    ])

    await expect(server.json('POST', '/api/civitai/downloads/repair-previews')).resolves.toMatchObject({
      payload: expect.objectContaining({
        ok: true,
        repaired: 1,
      }),
    })

    const sidecar = JSON.parse(await readFile(`${targetPath}.civitai.info`, 'utf8'))
    expect(sidecar).toMatchObject({
      archiveVersion: 1,
      previewImages: [
        expect.objectContaining({
          id: 500,
          remoteUrl: 'https://image.test/old.png',
          path: expect.stringContaining('legacy.previews'),
          meta: expect.objectContaining({ prompt: 'legacy prompt' }),
        }),
      ],
      archiveStatus: expect.objectContaining({
        mediaTotal: 1,
        mediaDownloaded: 1,
      }),
    })
    expect(sidecar.previewImages).toHaveLength(1)
  })

  it('dry-runs backfill by counting current version previews without writes or media fetches', async () => {
    const server = await setupHarness({
      upstream: {
        civitaiVersion: {
          id: 201,
          name: 'v1',
          model: { id: 101, name: 'Mock Detail LoRA', type: 'LORA', nsfw: false },
          files: [{ id: 301, name: 'detailBoost.safetensors', primary: true, hashes: { SHA256: 'MOCKHASH' } }],
          images: [
            { url: 'https://image.test/601.png', type: 'image' },
            { url: 'https://image.test/602.png', type: 'image' },
          ],
        },
      },
    })
    const targetPath = join(server.loraDir, 'dry-run.safetensors')
    await writeFile(targetPath, 'dry run target', 'utf8')
    await server.writeDownloads([
      downloadItem('dry-run', 'complete', {
        targetPath,
        sidecarPath: `${targetPath}.civitai.info`,
        previewImages: [{ id: 500, url: 'https://image.test/old.png' }],
        previewPaths: [{ id: 500, url: 'https://image.test/old.png', path: join(server.loraDir, 'old.png') }],
        finishedAt: 10,
        progressPercent: 100,
      }),
    ])

    const logs: string[] = []
    const summary = await runCivitaiArchiveBackfill({
      dryRun: true,
      logger: {
        log: (message: unknown) => logs.push(String(message)),
        error: (message: unknown) => logs.push(String(message)),
      },
    })

    expect(summary).toMatchObject({
      dryRun: true,
      completed: 1,
      mediaDownloaded: 0,
      mediaReused: 0,
      items: [
        expect.objectContaining({
          fileName: 'dry-run.safetensors',
          source: 'civitai-version',
          versionPreviewCount: 2,
          legacyPreviewCount: 1,
          archivePreviewCount: 2,
        }),
      ],
    })
    expect(logs.some((line) => line.includes('[dry-run] dry-run.safetensors: source=civitai-version previews=2'))).toBe(true)
    expect(await fileExists(`${targetPath}.civitai.info`)).toBe(false)
    expect(await fileExists(join(server.loraDir, 'dry-run.previews'))).toBe(false)

    const upstreamUrls = server.fetchMock.mock.calls.map(([input]) => new URL(String(input)))
    expect(upstreamUrls.some((url) => url.origin === 'https://image.test')).toBe(false)
    expect(upstreamUrls.some((url) => url.pathname === '/api/v1/images')).toBe(false)
  })

  it('can dry-run backfill only completed archives with missing media files', async () => {
    const server = await setupHarness()
    const missingTargetPath = join(server.loraDir, 'missing-media.safetensors')
    const readyTargetPath = join(server.loraDir, 'ready-media.safetensors')
    const readyPreviewDir = join(server.loraDir, 'ready-media.previews')
    const readyPreviewPath = join(readyPreviewDir, '0001-601.png')
    const missingPreviewPath = join(server.loraDir, 'missing-media.previews', '0001-601.png')
    await mkdir(readyPreviewDir, { recursive: true })
    await writeFile(missingTargetPath, 'missing media target', 'utf8')
    await writeFile(readyTargetPath, 'ready media target', 'utf8')
    await writeFile(readyPreviewPath, 'ready preview', 'utf8')
    await writeFile(
      `${missingTargetPath}.civitai.info`,
      JSON.stringify({
        archiveVersion: 1,
        previewImages: [{ id: 601, url: 'https://image.test/601.png', path: missingPreviewPath }],
      }),
      'utf8',
    )
    await writeFile(
      `${readyTargetPath}.civitai.info`,
      JSON.stringify({
        archiveVersion: 1,
        previewImages: [{ id: 601, url: 'https://image.test/601.png', path: readyPreviewPath }],
      }),
      'utf8',
    )
    await server.writeDownloads([
      downloadItem('missing-media', 'complete', {
        targetPath: missingTargetPath,
        sidecarPath: `${missingTargetPath}.civitai.info`,
        fileName: 'missing-media.safetensors',
      }),
      downloadItem('ready-media', 'complete', {
        targetPath: readyTargetPath,
        sidecarPath: `${readyTargetPath}.civitai.info`,
        fileName: 'ready-media.safetensors',
      }),
    ])

    const summary = await runCivitaiArchiveBackfill({
      dryRun: true,
      missingMediaOnly: true,
      logger: { log() {}, error() {} },
    })

    expect(summary).toMatchObject({
      dryRun: true,
      missingMediaOnly: true,
      completed: 1,
      candidateCount: 1,
      items: [
        expect.objectContaining({
          fileName: 'missing-media.safetensors',
        }),
      ],
    })
    expect(summary.items.some((item: { fileName?: string }) => item.fileName === 'ready-media.safetensors')).toBe(false)
  })

  it('keeps persisted download records lightweight while retaining primary preview references', () => {
    const serialized = serializeDownload({
      id: 'download-1',
      state: 'complete',
      previewUrl: '/api/civitai/downloads/download-1/preview',
      previewPath: 'C:/models/detail.preview.png',
      previewImages: Array.from({ length: 50 }, (_, index) => ({
        id: index + 1,
        url: `https://image.test/${index + 1}.png`,
        meta: { prompt: `prompt ${index + 1}` },
      })),
      previewPaths: [
        { id: 1, url: '/api/civitai/downloads/download-1/previews/0', path: 'C:/models/detail.previews/0001.png' },
        { id: 2, url: '/api/civitai/downloads/download-1/previews/1', path: 'C:/models/detail.previews/0002.png' },
      ],
    })

    expect(serialized.previewUrl).toBe('/api/civitai/downloads/download-1/preview')
    expect(serialized.previewPath).toBe('C:/models/detail.preview.png')
    expect(serialized.previewImages).toEqual([])
    expect(serialized.previewPaths).toEqual([
      expect.objectContaining({
        id: 1,
        url: '/api/civitai/downloads/download-1/previews/0',
        path: 'C:/models/detail.previews/0001.png',
      }),
    ])
  })

  it('skips completed downloads whose local model file is missing', async () => {
    const server = await setupHarness()
    const missingTargetPath = join(server.loraDir, 'missing.safetensors')

    await expect(refreshCivitaiArchiveForDownload(downloadItem('missing', 'complete', {
      targetPath: missingTargetPath,
      fileName: 'missing.safetensors',
    }))).resolves.toMatchObject({
      changed: false,
      skipped: true,
      reason: 'missing-model-file',
    })
  })
})
