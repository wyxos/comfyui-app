import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

const modelBytes = Uint8Array.from([11, 12, 13, 14, 21, 22, 23, 24])
let tempRoots: string[] = []

afterEach(async () => {
  vi.unstubAllGlobals()
  await Promise.all(tempRoots.map((root) => rm(root, { recursive: true, force: true })))
  tempRoots = []
})

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
})
