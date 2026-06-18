import { describe, expect, it } from 'vitest'
import { useServerHarness } from './serverApiTestUtils'

const { setupHarness } = useServerHarness()

describe('companion server Atlas feed proxy', () => {
  it('forwards Civitai feed requests through Atlas when configured', async () => {
    const server = await setupHarness()
    await server.json('PUT', '/api/settings/app', {
      includeNsfw: true,
      blurNsfwModels: false,
      blurNsfwMediaLevel: null,
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

  it('forwards private Reverb channel auth through Atlas', async () => {
    const server = await setupHarness()
    await server.json('PUT', '/api/settings/app', {
      includeNsfw: true,
      blurNsfwModels: false,
      blurNsfwMediaLevel: null,
      atlasUrl: 'atlas.test',
      atlasApiKey: 'atlas-secret-1234',
    })

    await expect(server.json('POST', '/api/atlas/broadcasting/auth', {
      socket_id: '123.456',
      channel_name: 'private-extension-downloads.test',
    })).resolves.toMatchObject({
      payload: expect.objectContaining({
        configured: true,
        auth: 'atlas-key:signature',
      }),
    })

    const authCall = server.calls.find((call) =>
      call.url.origin === 'https://atlas.test' && call.url.pathname === '/api/extension/broadcasting/auth',
    )
    expect(authCall?.headers.get('x-atlas-api-key')).toBe('atlas-secret-1234')
    expect(authCall?.body).toMatchObject({
      socket_id: '123.456',
      channel_name: 'private-extension-downloads.test',
    })
  })

  it('opens Atlas model tabs with the Companion browse defaults', async () => {
    const server = await setupHarness()
    await server.json('PUT', '/api/settings/app', {
      includeNsfw: true,
      blurNsfwModels: false,
      blurNsfwMediaLevel: null,
      atlasUrl: 'atlas.test',
      atlasApiKey: 'atlas-secret-1234',
    })

    await expect(server.json('POST', '/api/atlas/civitai/open-model', {
      modelId: 101,
      modelVersionId: 201,
      nsfw: true,
    })).resolves.toMatchObject({
      payload: expect.objectContaining({
        configured: true,
        tab: expect.objectContaining({ id: 601 }),
      }),
    })

    const openModelCall = server.calls.find((call) =>
      call.url.origin === 'https://atlas.test' && call.url.pathname === '/api/extension/browse-tabs/civitai-model',
    )
    expect(openModelCall?.body).toMatchObject({
      model_id: 101,
      model_version_id: 201,
      nsfw: true,
      type: 'all',
      sort: 'Newest',
      period: 'AllTime',
    })
  })
})
