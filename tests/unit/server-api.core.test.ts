import { describe, expect, it } from 'vitest'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { useServerHarness } from './serverApiTestUtils'

const { downloadItem, setupHarness } = useServerHarness()

describe('companion server API routes', () => {
  it('serves health, model lists, settings, and Civitai proxies', async () => {
      const server = await setupHarness()

      await expect(server.request('/health')).resolves.toMatchObject({
        response: expect.objectContaining({ status: 200 }),
        payload: expect.objectContaining({
          ok: true,
          app: 'comfyui-companion-app',
          comfyUrl: 'http://comfy.test/',
        }),
      })

      const checkpoints = await server.request('/api/checkpoints')
      expect(checkpoints.payload).toMatchObject({
        ok: true,
        defaultCheckpoint: 'waiIllustriousSDXL_v160.safetensors',
      })
      expect(checkpoints.payload.checkpoints[0]).toMatchObject({
        name: 'waiIllustriousSDXL_v160.safetensors',
        family: 'sdxl',
        downloaded: true,
        previewMediaType: 'image',
        compatibility: expect.objectContaining({
          baseModel: 'Pony',
          modelType: 'Checkpoint',
          status: 'ready',
        }),
      })

      const loras = await server.request('/api/loras')
      expect(loras.payload).toMatchObject({
        ok: true,
        defaultStrength: 0.65,
      })
      expect(loras.payload.loras[0]).toMatchObject({
        name: 'detailBoost.safetensors',
        downloaded: true,
        previewMediaType: 'image',
        compatibility: expect.objectContaining({
          baseModel: 'Pony',
          trainedWords: ['detail boost'],
          modelType: 'LORA',
        }),
      })

      await expect(server.request('/api/controlnets')).resolves.toMatchObject({
        payload: expect.objectContaining({
          ok: true,
          controlNets: expect.arrayContaining([
            expect.objectContaining({
              name: 'mistoLine_rank256.safetensors',
              compatibility: expect.objectContaining({
                baseModel: 'SDXL',
                compatibleBaseModels: ['SDXL'],
                controlType: 'lineart',
              }),
            }),
            expect.objectContaining({
              name: 'controlnetxlCNXL_windsingaiPose.safetensors',
              compatibility: expect.objectContaining({
                controlType: 'pose',
              }),
            }),
          ]),
          preprocessors: expect.arrayContaining([
            expect.objectContaining({ id: 'lineart', label: 'Line art' }),
          ]),
        }),
      })

      await expect(server.json('PUT', '/api/settings/civitai', { apiKey: 'abcdef1234' })).resolves.toMatchObject({
        payload: expect.objectContaining({
          ok: true,
          configured: true,
          keyPreview: 'Saved, ending in 1234',
        }),
      })
      expect(await server.readConfigFile('settings.json')).toContain('abcdef1234')

      await expect(server.request('/api/settings/civitai')).resolves.toMatchObject({
        payload: expect.objectContaining({
          configured: true,
          keyPreview: 'Saved, ending in 1234',
        }),
      })

      await expect(server.request('/api/settings/app')).resolves.toMatchObject({
        payload: expect.objectContaining({
          ok: true,
          includeNsfw: false,
          blurNsfwContent: true,
          atlasConfigured: false,
          atlasUrl: '',
        }),
      })
      const savedAppSettings = await server.json('PUT', '/api/settings/app', {
        includeNsfw: true,
        blurNsfwContent: false,
        atlasUrl: 'atlas.test',
        atlasApiKey: 'atlas-secret-1234',
      })
      expect(savedAppSettings).toMatchObject({
        payload: expect.objectContaining({
          ok: true,
          includeNsfw: true,
          blurNsfwContent: false,
          atlasConfigured: true,
          atlasUrl: 'https://atlas.test',
          atlasKeyConfigured: true,
          atlasKeyPreview: 'Saved, ending in 1234',
        }),
      })
      expect(savedAppSettings.payload.atlasApiKey).toBeUndefined()
      expect(JSON.parse(await server.readConfigFile('settings.json')).preferences.includeNsfw).toBe(true)
      expect(JSON.parse(await server.readConfigFile('settings.json')).preferences.blurNsfwContent).toBe(false)
      expect(JSON.parse(await server.readConfigFile('settings.json')).atlas.apiKey).toBe('atlas-secret-1234')

      const civitaiModels = await server.request('/api/civitai/models?query=detail&limit=999&ignored=1')
      expect(civitaiModels.payload).toMatchObject({ items: [expect.objectContaining({ id: 101 })] })
      const civitaiCall = server.calls.find((call) => call.url.origin === 'https://civitai.com')
      expect(civitaiCall?.headers.get('authorization')).toBe('Bearer abcdef1234')
      expect(civitaiCall?.url.searchParams.get('limit')).toBe('100')
      expect(civitaiCall?.url.searchParams.has('ignored')).toBe(false)

      const civitaiModelById = await server.request('/api/civitai/models?modelId=101&query=ignored')
      expect(civitaiModelById.payload).toMatchObject({
        items: [expect.objectContaining({ id: 101 })],
        metadata: expect.objectContaining({ totalItems: 1, totalPages: 1 }),
      })
      expect(server.calls.some((call) => call.url.pathname === '/api/v1/models/101')).toBe(true)

      const civitaiModelByVersionId = await server.request('/api/civitai/models?modelVersionId=201')
      expect(civitaiModelByVersionId.payload).toMatchObject({
        items: [
          expect.objectContaining({
            id: 101,
            modelVersions: [expect.objectContaining({ id: 201 })],
          }),
        ],
      })
      expect(server.calls.some((call) => call.url.pathname === '/api/v1/model-versions/201')).toBe(true)

      await expect(server.request('/api/civitai/images?modelId=101&page=2')).resolves.toMatchObject({
        payload: expect.objectContaining({
          items: [expect.objectContaining({ id: 401 })],
        }),
      })

      await expect(server.json('POST', '/api/atlas/civitai/status', {
        items: [{ request_id: 'image-401', id: 401, url: 'https://image.test/detail.png' }],
      })).resolves.toMatchObject({
        payload: expect.objectContaining({
          configured: true,
          ok: true,
        }),
      })
      const atlasStatusCall = server.calls.find((call) => call.url.origin === 'https://atlas.test' && call.url.pathname === '/api/extension/civitai/status')
      expect(atlasStatusCall?.headers.get('x-atlas-api-key')).toBe('atlas-secret-1234')
      expect(atlasStatusCall?.body).toMatchObject({
        items: [expect.objectContaining({ request_id: 'image-401' })],
      })

      await expect(server.json('POST', '/api/atlas/civitai/open-model', {
        modelId: 101,
        modelVersionId: 201,
      })).resolves.toMatchObject({
        payload: expect.objectContaining({
          configured: true,
          browse_url: 'https://atlas.test/browse',
        }),
      })
      const atlasOpenCall = server.calls.find((call) => call.url.origin === 'https://atlas.test' && call.url.pathname === '/api/extension/browse-tabs/civitai-model')
      expect(atlasOpenCall?.body).toMatchObject({
        model_id: 101,
        model_version_id: 201,
      })

      await expect(server.json('DELETE', '/api/atlas/files/88', {
        also_from_disk: true,
        also_delete_record: true,
      })).resolves.toMatchObject({
        payload: expect.objectContaining({
          configured: true,
          deleted: true,
          file_id: 88,
        }),
      })
      const atlasDeleteCall = server.calls.find((call) => call.url.origin === 'https://atlas.test' && call.url.pathname === '/api/extension/files/88')
      expect(atlasDeleteCall?.method).toBe('DELETE')
      expect(atlasDeleteCall?.body).toMatchObject({
        also_from_disk: true,
        also_delete_record: true,
      })

      await expect(server.json('DELETE', '/api/settings/civitai')).resolves.toMatchObject({
        payload: expect.objectContaining({
          ok: true,
          configured: false,
        }),
      })
    })

  it('returns route-level failures for invalid bodies and upstream service errors', async () => {
      const server = await setupHarness({
        upstream: {
          failures: {
            'GET /object_info/CheckpointLoaderSimple': {
              status: 500,
              payload: { error: { message: 'Comfy exploded' } },
            },
            'GET https://civitai.com/api/v1/models': {
              status: 503,
              payload: { message: 'Civitai maintenance' },
            },
          },
        },
      })

      await expect(server.request('/api/checkpoints')).resolves.toMatchObject({
        response: expect.objectContaining({ status: 400 }),
        payload: expect.objectContaining({ ok: false, error: 'comfyui-rejected' }),
      })
      await expect(server.request('/api/civitai/models?query=detail')).resolves.toMatchObject({
        response: expect.objectContaining({ status: 502 }),
        payload: expect.objectContaining({ ok: false, error: 'civitai-request-failed' }),
      })
      await expect(server.json('POST', '/api/atlas/civitai/status', {
        items: [{ request_id: 'image-401', id: 401, url: 'https://image.test/detail.png' }],
      })).resolves.toMatchObject({
        response: expect.objectContaining({ status: 200 }),
        payload: {
          ok: true,
          configured: false,
          items: [],
        },
      })
      expect(server.calls.some((call) => call.url.origin === 'https://atlas.test')).toBe(false)
      await expect(
        server.request('/api/settings/civitai', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json; charset=utf-8' },
          body: '{',
        }),
      ).resolves.toMatchObject({
        response: expect.objectContaining({ status: 400 }),
        payload: expect.objectContaining({ error: 'invalid-json' }),
      })
      await expect(server.json('PUT', '/api/settings/app', { includeNsfw: 'yes' })).resolves.toMatchObject({
        response: expect.objectContaining({ status: 400 }),
        payload: expect.objectContaining({ error: 'invalid-include-nsfw' }),
      })

      const logContents = await readFile(join(server.configDir, 'server.log'), 'utf8')
      expect(logContents).toContain('"type":"api-error"')
      expect(logContents).toContain('"code":"comfyui-rejected"')
      expect(logContents).toContain('"code":"civitai-request-failed"')
      expect(logContents).toContain('"code":"invalid-json"')
      expect(logContents).toContain('"code":"invalid-include-nsfw"')
    })

  it('returns download summary counts without serializing the full history', async () => {
      const server = await setupHarness()

      await server.writeDownloads([
        downloadItem('active-model', 'queued'),
        downloadItem('complete-model', 'complete', { previewImages: Array.from({ length: 50 }, (_, index) => ({ url: `https://image.test/${index}.png` })) }),
        downloadItem('dismissed-model', 'complete', { dismissedAt: Date.now() }),
        downloadItem('failed-model', 'error'),
      ])

      await expect(server.request('/api/civitai/downloads/summary')).resolves.toMatchObject({
        payload: {
          ok: true,
          counts: expect.objectContaining({
            active: 1,
            attention: 1,
            visibleComplete: 1,
            complete: 2,
            error: 1,
          }),
        },
      })
      const summary = await server.request('/api/civitai/downloads/summary')
      expect(summary.payload.items).toBeUndefined()
    })

  it('returns a paged job history list while keeping live jobs visible', async () => {
      const server = await setupHarness()
      const { ensureJob } = await import('../../server/job-state.mjs')
      const now = Date.now()

      ensureJob('running-1', {
        state: 'running',
        checkpoint: 'running.safetensors',
        promptText: 'running prompt',
        createdAt: now,
        updatedAt: now,
      })
      ensureJob('queued-1', {
        state: 'queued',
        checkpoint: 'queued.safetensors',
        promptText: 'queued prompt',
        createdAt: now,
        updatedAt: now,
      })

      for (let index = 1; index <= 12; index += 1) {
        const timestamp = now - index * 1000
        ensureJob(`history-${index}`, {
          state: 'complete',
          checkpoint: `history-${index}.safetensors`,
          promptText: `history prompt ${index}`,
          outputs: [{ filename: 'mock-output.png', subfolder: '', type: 'output' }],
          createdAt: timestamp - 100,
          updatedAt: timestamp,
          finishedAt: timestamp,
        })
      }

      const result = await server.request('/api/jobs?historyPage=2&historyLimit=5')
      const promptIds = result.payload.jobs.map((job: { promptId: string }) => job.promptId)

      expect(result.payload.counts).toEqual({
        running: 1,
        queued: 1,
        history: 12,
      })
      expect(result.payload.history).toEqual({
        page: 2,
        pageSize: 5,
        totalItems: 12,
        totalPages: 3,
      })
      expect(promptIds).toContain('running-1')
      expect(promptIds).toContain('queued-1')
      expect(promptIds.filter((promptId: string) => promptId.startsWith('history-'))).toEqual([
        'history-6',
        'history-7',
        'history-8',
        'history-9',
        'history-10',
      ])
    })

  it('merges completed-download model metadata into checkpoint and LoRA picker options', async () => {
      const server = await setupHarness()

      await server.writeDownloads([
        downloadItem('detailBoost', 'complete', {
          modelNsfw: true,
          modelMetadata: { nsfw: true, type: 'LORA' },
          targetPath: join(server.loraDir, 'detailBoost.safetensors'),
        }),
        downloadItem('waiIllustriousSDXL_v160', 'complete', {
          modelId: 901,
          modelName: 'WAI Illustrious SDXL',
          modelType: 'Checkpoint',
          modelNsfw: true,
          modelMetadata: { nsfw: true, type: 'Checkpoint' },
          fileName: 'waiIllustriousSDXL_v160.safetensors',
          targetPath: join(server.checkpointDir, 'waiIllustriousSDXL_v160.safetensors'),
        }),
      ])

      const loras = await server.request('/api/loras')
      expect(loras.payload.loras[0]).toMatchObject({
        name: 'detailBoost.safetensors',
        modelNsfw: true,
        compatibility: expect.objectContaining({ modelNsfw: true }),
      })

      const checkpoints = await server.request('/api/checkpoints')
      expect(checkpoints.payload.checkpoints[0]).toMatchObject({
        name: 'waiIllustriousSDXL_v160.safetensors',
        modelNsfw: true,
        compatibility: expect.objectContaining({ modelNsfw: true }),
      })

      await expect(
        server.json('PUT', '/api/model-metadata?type=controlnet&name=mistoLine_rank256.safetensors', {
          compatibleBaseModels: ['Pony', 'Illustrious'],
          controlType: 'lineart',
          loaderType: 'controlnet',
        }),
      ).resolves.toMatchObject({
        payload: expect.objectContaining({
          ok: true,
          metadata: expect.objectContaining({
            compatibleBaseModelKeys: ['pony', 'illustrious'],
            controlType: 'lineart',
          }),
        }),
      })
    })

  it('keeps provider compatibility metadata when a manual sidecar only overrides model safety', async () => {
      const server = await setupHarness()
      await writeFile(
        join(server.checkpointDir, 'waiIllustriousSDXL_v160.safetensors.companion.info'),
        `${JSON.stringify({
          source: 'manual',
          modelNsfw: true,
          modelNsfwOverride: true,
        })}\n`,
        'utf8',
      )

      const checkpoints = await server.request('/api/checkpoints')

      expect(checkpoints.payload.checkpoints[0]).toMatchObject({
        name: 'waiIllustriousSDXL_v160.safetensors',
        modelNsfw: true,
        compatibility: expect.objectContaining({
          modelId: 901,
          versionId: 902,
          modelNsfw: true,
          modelNsfwOverride: true,
          baseModel: 'Pony',
        }),
      })
    })

  it('uses completed-download compatibility while sidecar metadata is still missing', async () => {
      const server = await setupHarness({
        upstream: {
          loraInfo: {
            LoraLoader: {
              input: {
                required: {
                  lora_name: [['Dark_aura.safetensors']],
                  strength_model: ['FLOAT', { default: 0.65 }],
                },
              },
            },
          },
        },
      })

      await writeFile(join(server.loraDir, 'Dark_aura.safetensors'), 'lora', 'utf8')
      await server.writeDownloads([
        downloadItem('Dark_aura', 'complete', {
          modelId: 433097,
          modelName: 'Dark Aura for Pony',
          modelType: 'LORA',
          versionId: 1109669,
          versionName: 'Illustrious',
          baseModel: 'Illustrious',
          trainedWords: ['dark aura'],
          hashes: {
            SHA256: '96D811C4383E4FE1D8BCA611C1C2D6D3763EF4674E37679B16EF7090B87FF616',
          },
          fileName: 'Dark_aura.safetensors',
          targetPath: join(server.loraDir, 'Dark_aura.safetensors'),
        }),
      ])

      const loras = await server.request('/api/loras')
      expect(loras.payload.loras[0]).toMatchObject({
        name: 'Dark_aura.safetensors',
        compatibility: expect.objectContaining({
          modelId: 433097,
          versionId: 1109669,
          modelName: 'Dark Aura for Pony',
          versionName: 'Illustrious',
          baseModel: 'Illustrious',
          baseModelKey: 'illustrious',
          trainedWords: ['dark aura'],
          hashes: {
            SHA256: '96D811C4383E4FE1D8BCA611C1C2D6D3763EF4674E37679B16EF7090B87FF616',
          },
          status: 'ready',
        }),
      })
    })
})
