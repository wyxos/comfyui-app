import { describe, expect, it } from 'vitest'
import { useServerHarness } from './serverApiTestUtils'

const { setupHarness, downloadItem } = useServerHarness()

async function waitForVersionCall(server: Awaited<ReturnType<typeof setupHarness>>) {
  const deadline = Date.now() + 500
  while (Date.now() < deadline) {
    const count = server.calls.filter((call) => call.url.pathname === '/api/v1/model-versions/201').length
    if (count > 0) {
      return count
    }
    await new Promise((resolve) => {
      setTimeout(resolve, 10)
    })
  }
  return server.calls.filter((call) => call.url.pathname === '/api/v1/model-versions/201').length
}

describe('Civitai metadata safety refresh', () => {
  it('refreshes legacy model safety and overwrites it with current nsfwLevel metadata', async () => {
    const server = await setupHarness({
      upstream: {
        civitaiVersion: {
          id: 201,
          name: 'v1',
          baseModel: 'Pony',
          model: { id: 101, name: 'Safe Current Metadata', type: 'LORA', nsfw: true },
          files: [{ id: 301, name: 'detail.safetensors', primary: true, hashes: { SHA256: 'abc' } }],
          images: [{ id: 401, url: 'https://image.test/current-safe.png', nsfw: true, nsfwLevel: 1 }],
        },
      },
    })
    await server.writeDownloads([
      downloadItem('legacy-safety', 'complete', {
        modelNsfw: true,
        modelMetadata: { nsfw: true },
        previewImages: [{ id: 401, url: 'https://image.test/current-safe.png', nsfw: true }],
      }),
    ])

    await server.request('/api/civitai/downloads')
    expect(await waitForVersionCall(server)).toBe(1)
    await new Promise((resolve) => {
      setTimeout(resolve, 25)
    })

    const refreshed = await server.request('/api/civitai/downloads')
    expect(refreshed.payload.items[0]).toMatchObject({
      id: 'legacy-safety',
      modelNsfw: false,
      modelMetadata: expect.objectContaining({ nsfw: false }),
      previewImage: expect.objectContaining({ nsfwLevel: 1 }),
      previewImages: [],
    })
  })
})
