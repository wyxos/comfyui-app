import { describe, expect, it } from 'vitest'
import { createServerHarness } from '../fixtures/serverHarness'

describe('model metadata writes', () => {
  it('stores image safety overrides and preserves them when model safety changes', async () => {
    const server = await createServerHarness()

    await server.json('PUT', '/api/model-metadata?type=checkpoint&name=waiIllustriousSDXL_v160.safetensors', {
      metadata: {
        imageSafetyOverrides: {
          'id:901': { imageNsfw: true, imageNsfwOverride: true },
        },
      },
    })
    await server.json('PUT', '/api/model-metadata?type=checkpoint&name=waiIllustriousSDXL_v160.safetensors', {
      metadata: {
        modelNsfw: false,
        modelNsfwOverride: false,
      },
    })

    const checkpoints = await server.request('/api/checkpoints')
    expect(checkpoints.payload.checkpoints[0].compatibility.imageSafetyOverrides).toEqual({
      'id:901': { imageNsfw: true, imageNsfwOverride: true },
    })
  })
})
