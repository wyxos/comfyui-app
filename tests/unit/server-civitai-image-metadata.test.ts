import { describe, expect, it } from 'vitest'
import { useServerHarness } from './serverApiTestUtils'

const { setupHarness } = useServerHarness()

function civitaiImagePageHtml(imageId: number, meta: Record<string, unknown>) {
  return `<!doctype html><html><body><script id="__NEXT_DATA__" type="application/json">${
    JSON.stringify({
      props: {
        pageProps: {
          trpcState: {
            json: {
              queries: [
                {
                  queryHash: `[["image","get"],{"input":{"id":${imageId}},"type":"query"}]`,
                  state: {
                    data: {
                      id: imageId,
                      url: 'https://image.test/page-image.png',
                      width: 1536,
                      height: 2040,
                      hash: 'PAGEHASH',
                      type: 'image',
                    },
                  },
                },
                {
                  queryHash: `[["image","getGenerationData"],{"input":{"id":${imageId}},"type":"query"}]`,
                  state: {
                    data: { meta },
                  },
                },
              ],
            },
          },
        },
      },
    })
  }</script></body></html>`
}

describe('Civitai image metadata proxy', () => {
  it('hydrates single-image metadata from the public image page when the API item has null metadata', async () => {
    const imageId = 114266623
    const server = await setupHarness({
      upstream: {
        civitaiImages: {
          items: [
            {
              id: imageId,
              url: 'https://image.test/api-image.png',
              width: 1536,
              height: 2040,
              hash: 'APIHASH',
              meta: null,
            },
          ],
          metadata: { totalItems: 1, totalPages: 1 },
        },
        civitaiImagePages: {
          [String(imageId)]: civitaiImagePageHtml(imageId, {
            prompt: 'blue dress, underwater lighting',
            negativePrompt: 'bad quality',
            cfgScale: 7,
            steps: 32,
            sampler: 'Euler a',
            seed: 114266623,
          }),
        },
      },
    })

    await expect(server.request(`/api/civitai/images?imageId=${imageId}&limit=1`)).resolves.toMatchObject({
      payload: {
        items: [
          expect.objectContaining({
            id: imageId,
            url: 'https://image.test/api-image.png',
            hash: 'APIHASH',
            meta: expect.objectContaining({
              prompt: 'blue dress, underwater lighting',
              negativePrompt: 'bad quality',
              seed: 114266623,
            }),
          }),
        ],
        metadata: expect.objectContaining({
          totalItems: 1,
          totalPages: 1,
        }),
      },
    })
    expect(server.calls.some((call) => call.url.pathname === '/api/v1/images')).toBe(true)
    expect(server.calls.some((call) => call.url.pathname === `/images/${imageId}`)).toBe(true)
  })
})
