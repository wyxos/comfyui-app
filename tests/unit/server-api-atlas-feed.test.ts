import { describe, expect, it } from 'vitest'
import { useServerHarness } from './serverApiTestUtils'

const { setupHarness } = useServerHarness()

describe('companion server Atlas feed proxy', () => {
  it('forwards Civitai feed requests through Atlas when configured', async () => {
    const server = await setupHarness()
    await server.json('PUT', '/api/settings/app', {
      includeNsfw: true,
      blurNsfwContent: false,
      atlasUrl: 'atlas.test',
      atlasApiKey: 'atlas-secret-1234',
    })

    await expect(server.json('POST', '/api/atlas/civitai/feed', {
      limit: 20,
      modelId: 101,
      modelVersionId: 201,
      sort: 'Newest',
      nsfw: true,
    })).resolves.toMatchObject({
      payload: expect.objectContaining({
        configured: true,
        items: [expect.objectContaining({ id: 401 })],
      }),
    })

    const atlasFeedCall = server.calls.find((call) =>
      call.url.origin === 'https://atlas.test' && call.url.pathname === '/api/extension/civitai/feed',
    )
    expect(atlasFeedCall?.headers.get('x-atlas-api-key')).toBe('atlas-secret-1234')
    expect(atlasFeedCall?.body).toMatchObject({
      limit: 20,
      model_id: 101,
      model_version_id: 201,
      nsfw: true,
      sort: 'Newest',
    })
  })

  it('returns not configured without calling Atlas', async () => {
    const server = await setupHarness()

    await expect(server.json('POST', '/api/atlas/civitai/feed', {
      modelId: 101,
      modelVersionId: 201,
    })).resolves.toMatchObject({
      response: expect.objectContaining({ status: 409 }),
      payload: expect.objectContaining({
        error: 'atlas-not-configured',
      }),
    })
    expect(server.calls.some((call) => call.url.origin === 'https://atlas.test')).toBe(false)
  })
})
