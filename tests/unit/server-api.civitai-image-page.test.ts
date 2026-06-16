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
                      nsfwLevel: 'Soft',
                      postId: 901,
                    },
                  },
                },
                {
                  queryHash: `[["image","getGenerationData"],{"input":{"id":${imageId}},"type":"query"}]`,
                  state: {
                    data: {
                      meta,
                    },
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

describe('companion Civitai image page API fallback', () => {
  it('hydrates single-image metadata from the public Civitai image page when the API omits it', async () => {
    const imageId = 114266630
    const server = await setupHarness({
      upstream: {
        civitaiImages: {
          items: [],
          metadata: { totalItems: 0, totalPages: 0 },
        },
        civitaiImagePages: {
          [String(imageId)]: civitaiImagePageHtml(imageId, {
            prompt: 'mature female, solo, red hair',
            negativePrompt: 'bad quality,worst quality',
            cfgScale: 7,
            steps: 30,
            sampler: 'Euler a',
            seed: 561061719,
            Model: 'WAI-Nsfw-Illustrious-16',
          }),
        },
      },
    })

    await expect(server.request(`/api/civitai/images?imageId=${imageId}&limit=1`)).resolves.toMatchObject({
      payload: {
        items: [
          expect.objectContaining({
            id: imageId,
            url: 'https://image.test/page-image.png',
            width: 1536,
            height: 2040,
            meta: expect.objectContaining({
              prompt: 'mature female, solo, red hair',
              negativePrompt: 'bad quality,worst quality',
              seed: 561061719,
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
