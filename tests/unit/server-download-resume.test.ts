import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

const modelBytes = Uint8Array.from([11, 12, 13, 14, 21, 22, 23, 24])
const originalConfigDir = process.env.COMFY_COMPANION_CONFIG_DIR
const originalDownloadSegments = process.env.CIVITAI_DOWNLOAD_SEGMENTS
let tempRoots: string[] = []

afterEach(async () => {
  vi.unstubAllGlobals()
  vi.resetModules()
  if (originalConfigDir === undefined) {
    delete process.env.COMFY_COMPANION_CONFIG_DIR
  } else {
    process.env.COMFY_COMPANION_CONFIG_DIR = originalConfigDir
  }

  if (originalDownloadSegments === undefined) {
    delete process.env.CIVITAI_DOWNLOAD_SEGMENTS
  } else {
    process.env.CIVITAI_DOWNLOAD_SEGMENTS = originalDownloadSegments
  }

  for (const root of tempRoots) {
    await rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 25 })
  }
  tempRoots = []
})

function sha256(bytes: Uint8Array) {
  return createHash('sha256').update(bytes).digest('hex').toUpperCase()
}

async function makeDownload(overrides: Record<string, unknown> = {}) {
  const root = await mkdtemp(join(tmpdir(), 'comfy-companion-download-resume-'))
  tempRoots.push(root)
  const targetPath = join(root, 'model.safetensors')

  return {
    id: 'download-1',
    state: 'queued',
    fileName: 'model.safetensors',
    downloadUrl: 'https://download.test/model.safetensors',
    targetPath,
    partialPath: `${targetPath}.part`,
    sidecarPath: `${targetPath}.civitai.info`,
    previewPaths: [],
    bytesDownloaded: 0,
    totalBytes: modelBytes.byteLength,
    progressPercent: 0,
    createdAt: 1,
    updatedAt: 1,
    abortController: null,
    ...overrides,
  }
}

function mockRangeFetch() {
  const ranges: string[] = []
  vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers)
    const range = headers.get('Range') ?? ''
    ranges.push(range)

    const match = /^bytes=(\d+)-(\d*)$/.exec(range)
    const start = match ? Number.parseInt(match[1], 10) : 0
    const end = match?.[2] ? Number.parseInt(match[2], 10) : modelBytes.byteLength - 1
    const body = modelBytes.slice(start, end + 1)

    return new Response(body, {
      status: range ? 206 : 200,
      headers: {
        'Content-Length': String(body.byteLength),
        'Content-Range': `bytes ${start}-${end}/${modelBytes.byteLength}`,
      },
    })
  }))

  return ranges
}

describe('Civitai download resume', () => {
  it('sends the stored Civitai API key as a bearer header and download token query', async () => {
    vi.resetModules()
    process.env.CIVITAI_DOWNLOAD_SEGMENTS = '1'
    const root = await mkdtemp(join(tmpdir(), 'comfy-companion-civitai-auth-'))
    tempRoots.push(root)
    process.env.COMFY_COMPANION_CONFIG_DIR = root
    await mkdir(root, { recursive: true })
    await writeFile(join(root, 'settings.json'), JSON.stringify({ civitai: { apiKey: 'test-api-key' } }))

    const requests: Array<{ url: string, authorization: string | null }> = []
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers)
      requests.push({
        url: String(input),
        authorization: headers.get('Authorization'),
      })

      return new Response(modelBytes, {
        status: 200,
        headers: {
          'Content-Length': String(modelBytes.byteLength),
        },
      })
    }))

    const download = await makeDownload({
      downloadUrl: 'https://civitai.com/api/download/models/123?type=Model',
    })
    const { downloadCivitaiFile } = await import('../../server/downloads/transfer.mjs')

    await downloadCivitaiFile(download)

    expect(requests).toHaveLength(1)
    expect(requests[0]?.authorization).toBe('Bearer test-api-key')
    expect(requests[0]?.url).toBe('https://civitai.com/api/download/models/123?type=Model&token=test-api-key')
  })

  it('resumes segmented downloads from the recorded segment offsets instead of restarting', async () => {
    const ranges = mockRangeFetch()
    const download = await makeDownload({
      transferMode: 'segmented-2',
      segmentProgress: [2, 0],
      bytesDownloaded: 2,
      progressPercent: 25,
    })
    await writeFile(download.partialPath, Buffer.from([11, 12, 0, 0, 0, 0, 0, 0]))

    const { downloadCivitaiFile } = await import('../../server/downloads/transfer.mjs')
    await downloadCivitaiFile(download)

    expect([...ranges].sort()).toEqual(['bytes=2-3', 'bytes=4-7'])
    await expect(readFile(download.targetPath)).resolves.toEqual(Buffer.from(modelBytes))
    await expect(stat(download.partialPath)).rejects.toMatchObject({ code: 'ENOENT' })
    expect(download.state).toBe('complete')
  })

  it('rejects segmented responses that return a different content range than requested', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers)
      const range = headers.get('Range')
      const body = range === 'bytes=4-7' ? modelBytes.slice(0, 4) : modelBytes.slice(0, 4)

      return new Response(body, {
        status: 206,
        headers: {
          'Content-Length': String(body.byteLength),
          'Content-Range': range === 'bytes=4-7' ? 'bytes 0-3/8' : 'bytes 0-3/8',
        },
      })
    }))

    const download = await makeDownload({ abortController: new AbortController() })
    const { downloadCivitaiFileSegmented } = await import('../../server/downloads/transfer.mjs')

    await expect(downloadCivitaiFileSegmented(download, modelBytes.byteLength))
      .rejects
      .toThrow('Civitai segment 2 did not return the requested byte range.')
  })

  it('does not leave a corrupt hash-mismatched download installed as the final file', async () => {
    vi.resetModules()
    process.env.CIVITAI_DOWNLOAD_SEGMENTS = '1'
    const corruptBytes = Uint8Array.from([99, ...modelBytes.slice(1)])
    vi.stubGlobal('fetch', vi.fn(async () => new Response(corruptBytes, {
      status: 200,
      headers: {
        'Content-Length': String(corruptBytes.byteLength),
      },
    })))

    const download = await makeDownload({
      hashes: { SHA256: sha256(modelBytes) },
    })
    const { downloadCivitaiFile } = await import('../../server/downloads/transfer.mjs')

    await expect(downloadCivitaiFile(download)).rejects.toThrow('Downloaded file hash mismatch.')
    await expect(stat(download.targetPath)).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(stat(download.partialPath)).rejects.toMatchObject({ code: 'ENOENT' })
  })
})
