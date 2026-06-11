import { describe, expect, it } from 'vitest'

import { getExpectedCivitaiSha256 } from '../../server/downloads/transfer.mjs'

describe('Civitai download hash verification', () => {
  it('ignores non-SHA256 hash values even when they are stored under SHA256', () => {
    expect(getExpectedCivitaiSha256({
      hashes: {
        SHA256: '137749DE4AC9ADF023BD5A2206A4E67',
      },
    })).toBe('')
  })

  it('accepts a real SHA-256 hash from normalized Civitai hash metadata', () => {
    expect(getExpectedCivitaiSha256({
      hashes: {
        'sha-256': 'f'.repeat(64),
        AutoV1: '137749DE4AC9ADF023BD5A2206A4E67',
      },
    })).toBe('F'.repeat(64))
  })
})
