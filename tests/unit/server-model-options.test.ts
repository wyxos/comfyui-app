import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { useServerHarness } from './serverApiTestUtils'

const { downloadItem, setupHarness } = useServerHarness()

describe('server model option enrichment', () => {
  it('exposes completed checkpoint download preview paths for picker carousels', async () => {
    const server = await setupHarness()
    const firstPreviewPath = join(server.checkpointDir, 'picker-preview-one.png')
    const secondPreviewPath = join(server.checkpointDir, 'picker-preview-two.png')

    await writeFile(firstPreviewPath, 'first preview', 'utf8')
    await writeFile(secondPreviewPath, 'second preview', 'utf8')
    await server.writeDownloads([
      downloadItem('wai-illustrious', 'complete', {
        modelType: 'Checkpoint',
        fileName: 'waiIllustriousSDXL_v160.safetensors',
        targetPath: join(server.checkpointDir, 'waiIllustriousSDXL_v160.safetensors'),
        previewPaths: [
          { path: firstPreviewPath, url: '/api/civitai/downloads/wai-illustrious/previews/0', mediaType: 'image', nsfwLevel: 2 },
          { path: secondPreviewPath, url: '/api/civitai/downloads/wai-illustrious/previews/1', mediaType: 'image' },
        ],
      }),
    ])

    const checkpoints = await server.request('/api/checkpoints')

    expect(checkpoints.payload.checkpoints[0]).toMatchObject({
      name: 'waiIllustriousSDXL_v160.safetensors',
      previewPaths: [
        { url: '/api/civitai/downloads/wai-illustrious/previews/0', mediaType: 'image', nsfwLevel: 2 },
        { url: '/api/civitai/downloads/wai-illustrious/previews/1', mediaType: 'image' },
      ],
    })
    expect(checkpoints.payload.checkpoints[0].previewPaths[0].path).toBeUndefined()
  })

  it('keeps sidecar archive previews when completed download state has only the primary preview', async () => {
    const server = await setupHarness()
    const firstPreviewPath = join(server.checkpointDir, 'masked-preview-one.png')
    const secondPreviewPath = join(server.checkpointDir, 'masked-preview-two.png')
    const thirdPreviewPath = join(server.checkpointDir, 'masked-preview-three.png')

    await writeFile(firstPreviewPath, 'first preview', 'utf8')
    await writeFile(secondPreviewPath, 'second preview', 'utf8')
    await writeFile(thirdPreviewPath, 'third preview', 'utf8')
    await writeFile(
      join(server.checkpointDir, 'waiIllustriousSDXL_v160.safetensors.civitai.info'),
      JSON.stringify({
        source: 'civitai',
        modelId: 901,
        versionId: 902,
        modelType: 'Checkpoint',
        baseModel: 'Pony',
        archiveVersion: 1,
        previewPaths: [
          { id: 101, path: firstPreviewPath, mediaType: 'image' },
          { id: 102, path: secondPreviewPath, mediaType: 'image' },
          { id: 103, path: thirdPreviewPath, mediaType: 'image' },
        ],
      }),
      'utf8',
    )
    await server.writeDownloads([
      downloadItem('wai-illustrious', 'complete', {
        modelType: 'Checkpoint',
        fileName: 'waiIllustriousSDXL_v160.safetensors',
        targetPath: join(server.checkpointDir, 'waiIllustriousSDXL_v160.safetensors'),
        previewPaths: [
          {
            id: 101,
            path: firstPreviewPath,
            url: '/api/civitai/downloads/wai-illustrious/previews/0',
            mediaType: 'image',
          },
        ],
      }),
    ])

    const checkpoints = await server.request('/api/checkpoints')

    expect(checkpoints.payload.checkpoints[0].previewPaths).toEqual([
      { url: '/api/civitai/downloads/wai-illustrious/previews/0', mediaType: 'image' },
      {
        url: '/api/model-archive-media?type=checkpoint&name=waiIllustriousSDXL_v160.safetensors&index=1',
        mediaType: 'image',
      },
      {
        url: '/api/model-archive-media?type=checkpoint&name=waiIllustriousSDXL_v160.safetensors&index=2',
        mediaType: 'image',
      },
    ])
  })

  it('exposes ControlNet preview metadata for the shared asset picker', async () => {
    const server = await setupHarness()
    const previewPath = join(server.controlNetDir, 'mistoLine_rank256.preview.png')
    const archiveDir = join(server.controlNetDir, 'mistoLine_rank256.previews')
    const firstArchivePath = join(archiveDir, '0001.png')
    const secondArchivePath = join(archiveDir, '0002.png')

    await mkdir(archiveDir, { recursive: true })
    await writeFile(previewPath, 'primary controlnet preview', 'utf8')
    await writeFile(firstArchivePath, 'first archive preview', 'utf8')
    await writeFile(secondArchivePath, 'second archive preview', 'utf8')
    await writeFile(
      join(server.controlNetDir, 'mistoLine_rank256.safetensors.civitai.info'),
      JSON.stringify({
        source: 'civitai',
        modelType: 'ControlNet',
        baseModel: 'SDXL',
        compatibleBaseModels: ['SDXL'],
        controlType: 'lineart',
        archiveVersion: 1,
        previewPaths: [
          { path: firstArchivePath, mediaType: 'image' },
          { path: secondArchivePath, mediaType: 'image' },
        ],
      }),
      'utf8',
    )

    const controlNets = await server.request('/api/controlnets')
    const mistoLine = controlNets.payload.controlNets.find((entry) => entry.name === 'mistoLine_rank256.safetensors')

    expect(mistoLine).toMatchObject({
      previewUrl: '/api/model-preview?type=controlnet&name=mistoLine_rank256.safetensors',
      previewMediaType: 'image',
      previewPaths: [
        {
          url: '/api/model-archive-media?type=controlnet&name=mistoLine_rank256.safetensors&index=0',
          mediaType: 'image',
        },
        {
          url: '/api/model-archive-media?type=controlnet&name=mistoLine_rank256.safetensors&index=1',
          mediaType: 'image',
        },
      ],
      compatibility: {
        baseModel: 'SDXL',
        compatibleBaseModels: ['SDXL'],
        controlType: 'lineart',
      },
    })

    await expect(server.request('/api/model-preview?type=controlnet&name=mistoLine_rank256.safetensors'))
      .resolves.toMatchObject({ response: { status: 200 } })
  })
})
