import { describe, expect, it } from 'vitest'
import { useServerHarness } from './serverApiTestUtils'

const { setupHarness } = useServerHarness()

describe('Civitai model preview proxy', () => {
  it('returns only stripped model-version preview fields', async () => {
    const server = await setupHarness()
    await server.json('PUT', '/api/settings/civitai', { apiKey: 'abcdef1234' })

    const result = await server.request('/api/civitai/model-previews?modelIds=101&versionIds=201')
    expect(result.payload).toEqual({
      ok: true,
      items: [
        {
          modelId: 101,
          versionId: 201,
          previews: [
            {
              id: 401,
              url: 'https://image.test/detail-preview.png',
              type: 'image',
              mediaType: 'image',
              nsfwLevel: 1,
              width: 512,
              height: 768,
              hash: 'preview-hash',
            },
          ],
        },
      ],
    })

    const upstreamCall = server.calls.find((call) =>
      call.url.origin === 'https://civitai.com' &&
      call.url.pathname === '/api/v1/models' &&
      call.url.searchParams.get('ids') === '101'
    )
    expect(upstreamCall?.headers.get('authorization')).toBe('Bearer abcdef1234')
    expect(upstreamCall?.url.searchParams.get('nsfw')).toBe('true')
    expect(upstreamCall?.url.searchParams.get('limit')).toBe('1')
    expect(JSON.stringify(result.payload)).not.toContain('sample prompt')
    expect(JSON.stringify(result.payload)).not.toContain('Mock Detail LoRA')
  })
})
