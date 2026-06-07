import { describe, expect, it } from 'vitest'
import { useServerHarness } from './serverApiTestUtils'

const { setupHarness } = useServerHarness()

describe('companion watched downloads API routes', () => {
  it('persists watched Civitai versions and queues them once Civitai exposes a download URL', async () => {
      const server = await setupHarness({
        upstream: {
          civitaiVersion: {
            id: 201,
            name: 'Early v1',
            availability: 'EarlyAccess',
            covered: false,
            baseModel: 'Pony',
            trainedWords: ['future detail'],
            model: { id: 101, name: 'Mock Detail LoRA', type: 'LORA', nsfw: false },
            files: [{
              id: 301,
              name: 'futureDetail.safetensors',
              type: 'Model',
              primary: true,
            }],
            images: [{ id: 401, url: 'https://image.test/detail.png' }],
          },
        },
      })

      const watch = await server.json('POST', '/api/civitai/watched-downloads', {
        modelId: 101,
        modelName: 'Mock Detail LoRA',
        modelType: 'LORA',
        modelNsfw: false,
        modelMetadata: {
          id: 101,
          name: 'Mock Detail LoRA',
          type: 'LORA',
          nsfw: false,
        },
        versionId: 201,
        versionName: 'Early v1',
        baseModel: 'Pony',
        file: {
          id: 301,
          name: 'futureDetail.safetensors',
          type: 'Model',
          primary: true,
        },
        trainedWords: ['future detail'],
        previewImage: { id: 401, url: 'https://image.test/detail.png' },
        previewImages: [{ id: 401, url: 'https://image.test/detail.png' }],
      })

      expect(watch.payload).toMatchObject({
        ok: true,
        item: expect.objectContaining({
          id: '101__201__301',
          state: 'watching',
          modelId: 101,
          versionId: 201,
          fileName: 'futureDetail.safetensors',
        }),
      })

      await expect(server.request('/api/civitai/watched-downloads')).resolves.toMatchObject({
        payload: expect.objectContaining({
          ok: true,
          items: [expect.objectContaining({ id: '101__201__301', state: 'watching' })],
        }),
      })

      server.upstream.civitaiVersion = {
        id: 201,
        name: 'Early v1',
        availability: 'Public',
        covered: false,
        baseModel: 'Pony',
        trainedWords: ['future detail'],
        model: { id: 101, name: 'Mock Detail LoRA', type: 'LORA', nsfw: false },
        files: [{
          id: 301,
          name: 'futureDetail.safetensors',
          type: 'Model',
          primary: true,
          downloadUrl: 'https://download.test/futureDetail.safetensors',
        }],
        images: [{ id: 401, url: 'https://image.test/detail.png' }],
      }

      await expect(server.json('POST', '/api/civitai/watched-downloads/check', { force: true })).resolves.toMatchObject({
        payload: expect.objectContaining({
          ok: true,
          checked: 1,
          queued: 1,
          items: [expect.objectContaining({
            id: '101__201__301',
            state: 'queued',
            queuedDownloadId: '101__201__301',
          })],
        }),
      })

      await expect(server.request('/api/civitai/downloads')).resolves.toMatchObject({
        payload: expect.objectContaining({
          ok: true,
          items: expect.arrayContaining([
            expect.objectContaining({
              id: '101__201__301',
              modelName: 'Mock Detail LoRA',
              fileName: 'futureDetail.safetensors',
              state: expect.stringMatching(/queued|downloading|complete/),
            }),
          ]),
        }),
      })

      const persisted = JSON.parse(await server.readConfigFile('watched-downloads.json'))
      expect(persisted.items).toEqual([
        expect.objectContaining({
          id: '101__201__301',
          state: 'queued',
          queuedDownloadId: '101__201__301',
        }),
      ])
    })
})
