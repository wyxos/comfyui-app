import { setTimeout as delay } from 'node:timers/promises'
import { describe, expect, it } from 'vitest'
import { useServerHarness } from './serverApiTestUtils'

const { setupHarness } = useServerHarness()

async function waitFor<T>(callback: () => Promise<T | null>, timeoutMs = 1000) {
  const startedAt = Date.now()
  let latestResult: T | null = null

  while (Date.now() - startedAt < timeoutMs) {
    latestResult = await callback()
    if (latestResult) {
      return latestResult
    }

    await delay(20)
  }

  return latestResult
}

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

  it('keeps watched versions waiting while Civitai early access has not ended', async () => {
    const earlyAccessEndsAt = new Date(Date.now() + 86_400_000).toISOString()
    const server = await setupHarness({
      upstream: {
        civitaiVersion: {
          id: 201,
          name: 'Early v1',
          earlyAccessEndsAt,
          baseModel: 'Illustrious',
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
        },
      },
    })

    await server.json('POST', '/api/civitai/watched-downloads', {
      modelId: 101,
      modelName: 'Mock Detail LoRA',
      modelType: 'LORA',
      versionId: 201,
      versionName: 'Early v1',
      baseModel: 'Illustrious',
      file: {
        id: 301,
        name: 'futureDetail.safetensors',
        type: 'Model',
        primary: true,
      },
    })

    await expect(server.json('POST', '/api/civitai/watched-downloads/check', { force: true })).resolves.toMatchObject({
      payload: expect.objectContaining({
        ok: true,
        checked: 1,
        queued: 0,
        items: [expect.objectContaining({
          id: '101__201__301',
          state: 'watching',
          lastStatus: `Early access locked until ${earlyAccessEndsAt}.`,
        })],
      }),
    })

    await expect(server.request('/api/civitai/downloads')).resolves.toMatchObject({
      payload: expect.objectContaining({
        ok: true,
        items: [],
      }),
    })
  })

  it('moves Civitai login-style 401 downloads to watched when version metadata shows early access', async () => {
    const earlyAccessEndsAt = new Date(Date.now() + 86_400_000).toISOString()
    const server = await setupHarness({
      upstream: {
        failures: {
          'GET https://download.test/earlyDetail.safetensors': {
            status: 401,
            payload: {
              message: 'The creator of this asset requires you to be logged in to download it',
            },
          },
        },
        civitaiVersion: {
          id: 201,
          name: 'Early v1',
          earlyAccessEndsAt,
          baseModel: 'Illustrious',
          trainedWords: ['future detail'],
          model: { id: 101, name: 'Mock Detail LoRA', type: 'LORA', nsfw: false },
          files: [{
            id: 301,
            name: 'earlyDetail.safetensors',
            type: 'Model',
            primary: true,
            downloadUrl: 'https://download.test/earlyDetail.safetensors',
          }],
          images: [{ id: 401, url: 'https://image.test/detail.png' }],
        },
      },
    })

    await server.json('POST', '/api/civitai/downloads', {
      modelId: 101,
      modelName: 'Mock Detail LoRA',
      modelType: 'LORA',
      versionId: 201,
      versionName: 'Early v1',
      baseModel: 'Illustrious',
      file: {
        id: 301,
        name: 'earlyDetail.safetensors',
        type: 'Model',
        primary: true,
        downloadUrl: 'https://download.test/earlyDetail.safetensors',
      },
    })

    const watched = await waitFor(async () => {
      const watchedResponse = await server.request('/api/civitai/watched-downloads')
      const items = watchedResponse.payload?.items
      return Array.isArray(items) && items.some((item) => item.id === '101__201__301')
        ? watchedResponse
        : null
    })

    expect(watched).toMatchObject({
      payload: expect.objectContaining({
        ok: true,
        items: [expect.objectContaining({
          id: '101__201__301',
          state: 'watching',
          fileName: 'earlyDetail.safetensors',
          lastStatus: `Early access locked until ${earlyAccessEndsAt}.`,
        })],
      }),
    })

    await expect(server.request('/api/civitai/downloads')).resolves.toMatchObject({
      payload: expect.objectContaining({
        ok: true,
        items: [],
      }),
    })
  })
})
