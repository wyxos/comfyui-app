import { describe, expect, it } from 'vitest'
import { useServerHarness } from './serverApiTestUtils'

const { setupHarness } = useServerHarness()

describe('Civitai model lookup proxy', () => {
  it('hydrates creator metadata when a model-version lookup only returns the model id', async () => {
    const server = await setupHarness({
      upstream: {
        civitaiModels: {
          items: [
            {
              id: 101,
              name: 'Mock Detail LoRA',
              type: 'LORA',
              creator: { username: 'detail-maker' },
              modelVersions: [{ id: 201, name: 'v1', files: [] }],
            },
          ],
          metadata: { totalItems: 1, totalPages: 1 },
        },
        civitaiVersion: {
          id: 201,
          name: 'v1',
          baseModel: 'Pony',
          modelId: 101,
          model: { id: 101, name: 'Mock Detail LoRA', type: 'LORA', nsfw: false },
          files: [{ id: 301, name: 'detailBoost.safetensors', primary: true }],
        },
      },
    })

    await expect(server.request('/api/civitai/models?modelVersionId=201')).resolves.toMatchObject({
      payload: {
        items: [
          expect.objectContaining({
            id: 101,
            creator: { username: 'detail-maker' },
            modelVersions: [expect.objectContaining({ id: 201 })],
          }),
        ],
      },
    })
    expect(server.calls.some((call) => call.url.pathname === '/api/v1/model-versions/201')).toBe(true)
    expect(server.calls.some((call) => call.url.pathname === '/api/v1/models/101')).toBe(true)
  })
})
