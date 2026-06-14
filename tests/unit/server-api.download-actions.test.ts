import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { describe, expect, it, vi } from 'vitest'
import { useServerHarness } from './serverApiTestUtils'

const { downloadItem, setupHarness } = useServerHarness()

function sha256(bytes: Uint8Array) {
  return createHash('sha256').update(bytes).digest('hex').toUpperCase()
}

describe('companion download action API routes', () => {
  it('retries a classified Civitai hash mismatch when keep-anyway is explicitly requested', async () => {
    const expectedBytes = new TextEncoder().encode('expected model bytes')
    const servedBytes = new TextEncoder().encode('served upstream bytes')
    const expectedHash = sha256(expectedBytes)
    const actualHash = sha256(servedBytes)
    const server = await setupHarness({
      upstream: {
        downloadBody: servedBytes,
      },
    })
    await server.writeDownloads([
      downloadItem('hash-mismatch-download', 'error', {
        fileName: 'hash-mismatch-download.safetensors',
        hashes: { SHA256: expectedHash },
        error: `Downloaded file hash mismatch. Expected ${expectedHash}, got ${actualHash}.`,
      }),
    ])

    const response = await server.json('POST', '/api/civitai/downloads/hash-mismatch-download/keep-anyway')

    expect(response.payload).toMatchObject({
      ok: true,
      item: expect.objectContaining({
        id: 'hash-mismatch-download',
        state: 'queued',
        allowHashMismatch: true,
        error: null,
        hashMismatch: expect.objectContaining({
          expectedSha256: expectedHash,
          actualSha256: actualHash,
        }),
      }),
    })

    await vi.waitFor(async () => {
      const downloads = await server.request('/api/civitai/downloads')
      expect(downloads.payload.items).toEqual([
        expect.objectContaining({
          id: 'hash-mismatch-download',
          state: 'complete',
          error: null,
          hashMismatch: expect.objectContaining({
            expectedSha256: expectedHash,
            actualSha256: actualHash,
            accepted: true,
          }),
        }),
      ])
    })

    await expect(readFile(response.payload.item.targetPath)).resolves.toEqual(Buffer.from(servedBytes))
  })
})
