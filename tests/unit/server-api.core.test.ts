import { describe, expect, it } from 'vitest'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { useServerHarness } from './serverApiTestUtils'

const { downloadItem, setupHarness } = useServerHarness()

describe('companion server API routes', () => {
  it('serves health, model lists, settings, Ollama models, and Civitai proxies', async () => {
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

      await expect(server.request('/api/ollama/models')).resolves.toMatchObject({
        payload: expect.objectContaining({
          ok: true,
          models: ['gpt-oss:20b', 'llama3.2'],
          defaultModel: 'gpt-oss:20b',
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
        }),
      })
      await expect(server.json('PUT', '/api/settings/app', { includeNsfw: true })).resolves.toMatchObject({
        payload: expect.objectContaining({
          ok: true,
          includeNsfw: true,
        }),
      })
      expect(JSON.parse(await server.readConfigFile('settings.json')).preferences.includeNsfw).toBe(true)

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
            'GET /api/tags': new Error('Ollama offline'),
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
      await expect(server.request('/api/ollama/models')).resolves.toMatchObject({
        response: expect.objectContaining({ status: 502 }),
        payload: expect.objectContaining({ ok: false, error: 'ollama-unreachable' }),
      })
      await expect(server.request('/api/civitai/models?query=detail')).resolves.toMatchObject({
        response: expect.objectContaining({ status: 502 }),
        payload: expect.objectContaining({ ok: false, error: 'civitai-request-failed' }),
      })
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
      await expect(server.json('POST', '/api/improve-prompt', { prompt: '', checkpoint: '' })).resolves.toMatchObject({
        response: expect.objectContaining({ status: 400 }),
        payload: expect.objectContaining({ error: 'missing-prompt' }),
      })
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
