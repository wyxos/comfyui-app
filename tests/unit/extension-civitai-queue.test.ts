// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildCompanionDownloadPayload,
  queueCompanionCivitaiDownload,
} from '../../extension/src/background/queue-runtime'
import {
  installCivitaiQueueCtas,
  parseModelReferenceFromUrl,
  resolveModelReferenceFromTexts,
} from '../../extension/src/content/civitai-queue-cta'

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  })
}

describe('ComfyUI Companion browser extension Civitai queue helpers', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    vi.unstubAllGlobals()
  })

  it('parses Civitai model references from URLs and AIR code rows', () => {
    expect(parseModelReferenceFromUrl('https://civitai.com/models/101/detail?modelVersionId=201')).toEqual({
      modelId: 101,
      modelVersionId: 201,
      key: '101@201',
    })
    expect(parseModelReferenceFromUrl('https://example.com/models/101?modelVersionId=201')).toBeNull()
    expect(resolveModelReferenceFromTexts(['civitai:', '101', '@', '201'])).toEqual({
      modelId: 101,
      modelVersionId: 201,
      key: '101@201',
    })
  })

  it('builds the companion download payload from Civitai model metadata', () => {
    const payload = buildCompanionDownloadPayload(
      {
        id: 101,
        name: 'Detail Boost',
        type: 'LORA',
        nsfw: false,
        creator: { username: 'creator' },
        stats: { downloadCount: 5 },
        tags: ['detail'],
      },
      {
        id: 201,
        name: 'v1',
        baseModel: 'Pony',
        trainedWords: ['detail boost'],
        images: [{ id: 1, url: 'https://image.test/preview.png' }],
      },
      {
        id: 301,
        name: 'detail.safetensors',
        type: 'Model',
        downloadUrl: 'https://download.test/detail.safetensors',
        sizeKB: 1024,
        hashes: { SHA256: 'abc' },
      },
    )

    expect(payload).toMatchObject({
      modelId: 101,
      modelName: 'Detail Boost',
      modelType: 'LORA',
      modelNsfw: false,
      versionId: 201,
      versionName: 'v1',
      baseModel: 'Pony',
      file: {
        id: 301,
        name: 'detail.safetensors',
        type: 'Model',
        downloadUrl: 'https://download.test/detail.safetensors',
        sizeKb: 1024,
        hashes: { SHA256: 'abc' },
      },
      trainedWords: ['detail boost'],
      previewImage: { id: 1, url: 'https://image.test/preview.png' },
    })
  })

  it('fetches Civitai metadata through the companion app and posts the queue payload', async () => {
    const fetchMock = vi.fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
      .mockResolvedValueOnce(jsonResponse({
        items: [
          {
            id: 101,
            name: 'Detail Boost',
            type: 'LORA',
            nsfw: false,
            modelVersions: [
              {
                id: 201,
                name: 'v1',
                availability: 'Public',
                files: [
                  {
                    id: 301,
                    name: 'detail.safetensors',
                    type: 'Model',
                    primary: true,
                    downloadUrl: 'https://download.test/detail.safetensors',
                  },
                ],
              },
            ],
          },
        ],
      }))
      .mockResolvedValueOnce(jsonResponse({ ok: true, item: { id: '101__201__301', state: 'queued' } }))

    const result = await queueCompanionCivitaiDownload(
      { type: 'COMFY_COMPANION_QUEUE_CIVITAI_MODEL', modelId: 101, modelVersionId: 201 },
      { fetchImpl: fetchMock, baseUrl: 'http://127.0.0.1:3210' },
    )

    expect(result).toMatchObject({ ok: true })
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      new URL('http://127.0.0.1:3210/api/civitai/models?modelVersionId=201'),
      expect.objectContaining({ headers: { Accept: 'application/json' } }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      new URL('http://127.0.0.1:3210/api/civitai/downloads'),
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"downloadUrl":"https://download.test/detail.safetensors"'),
      }),
    )
  })

  it('reports unavailable versions before posting a download', async () => {
    const fetchMock = vi.fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
      .mockResolvedValueOnce(jsonResponse({
        items: [
          {
            id: 101,
            name: 'Detail Boost',
            type: 'LORA',
            modelVersions: [
              {
                id: 201,
                availability: 'EarlyAccess',
                covered: false,
                files: [
                  {
                    id: 301,
                    name: 'detail.safetensors',
                    type: 'Model',
                    primary: true,
                    downloadUrl: 'https://download.test/detail.safetensors',
                  },
                ],
              },
            ],
          },
        ],
      }))

    const result = await queueCompanionCivitaiDownload(
      { type: 'COMFY_COMPANION_QUEUE_CIVITAI_MODEL', modelId: 101, modelVersionId: 201 },
      { fetchImpl: fetchMock, baseUrl: 'http://127.0.0.1:3210' },
    )

    expect(result).toMatchObject({
      ok: false,
      error: 'version-unavailable',
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('adds a queue CTA beside Civitai AIR rows and sends the model reference to the background worker', async () => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: new URL('https://civitai.com/models/101/detail') as unknown as Location,
    })
    const sendMessage = vi.fn((_: unknown, callback?: (response: unknown) => void) => {
      callback?.({ ok: true })
    })
    vi.stubGlobal('chrome', {
      runtime: {
        lastError: null,
        sendMessage,
      },
    })
    document.body.innerHTML = `
      <table>
        <tbody>
          <tr>
            <td>AIR</td>
            <td>
              <div>
                <div>
                  <code>civitai:</code>
                  <code>101</code>
                  <code>@</code>
                  <code>201</code>
                </div>
                <button type="button">Copy</button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    `

    const cleanup = installCivitaiQueueCtas()
    const button = Array.from(document.querySelectorAll('button'))
      .find((candidate) => candidate.textContent === 'Queue in Companion')

    expect(button).toBeInstanceOf(HTMLButtonElement)

    button?.click()
    await new Promise((resolve) => {
      setTimeout(resolve, 0)
    })

    expect(sendMessage).toHaveBeenCalledWith({
      type: 'COMFY_COMPANION_QUEUE_CIVITAI_MODEL',
      modelId: 101,
      modelVersionId: 201,
      sourceHostname: 'civitai.com',
      sourceUrl: 'https://civitai.com/models/101/detail',
    }, expect.any(Function))

    cleanup()
  })
})
