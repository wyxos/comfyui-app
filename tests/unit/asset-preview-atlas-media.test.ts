import { describe, expect, it } from 'vitest'

import { statusFromReactionPayload } from '../../src/components/asset-preview/assetPreviewAtlasMedia'
import type { AtlasMediaStatus } from '../../src/components/asset-preview/assetPreviewTypes'

describe('statusFromReactionPayload', () => {
  it('clears an existing positive reaction when blacklisting media', () => {
    const currentStatus: AtlasMediaStatus = {
      exists: true,
      file_id: 88,
      reaction: 'love',
      reacted_at: '2026-06-18T08:00:00Z',
      blacklisted: false,
      blacklisted_at: null,
    }

    const status = statusFromReactionPayload(currentStatus, {
      configured: true,
      file: { id: 88, url: 'https://example.test/image.jpg' },
      blacklisted_at: '2026-06-19T07:00:00Z',
    }, 'blacklist')

    expect(status.reaction).toBeNull()
    expect(status.reacted_at).toBeNull()
    expect(status.blacklisted).toBe(true)
    expect(status.blacklisted_at).toBe('2026-06-19T07:00:00Z')
  })

  it('clears existing blacklist state when applying a positive reaction', () => {
    const currentStatus: AtlasMediaStatus = {
      exists: true,
      file_id: 88,
      reaction: null,
      reacted_at: null,
      blacklisted: true,
      blacklisted_at: '2026-06-18T08:00:00Z',
    }

    const status = statusFromReactionPayload(currentStatus, {
      configured: true,
      file: { id: 88, url: 'https://example.test/image.jpg' },
      reaction: { type: 'love' },
      reacted_at: '2026-06-19T07:00:00Z',
    }, 'love')

    expect(status.reaction).toBe('love')
    expect(status.reacted_at).toBe('2026-06-19T07:00:00Z')
    expect(status.blacklisted).toBe(false)
    expect(status.blacklisted_at).toBeNull()
  })
})
