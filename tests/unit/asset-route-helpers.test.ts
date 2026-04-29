import { describe, expect, it } from 'vitest'

import { buildAssetSearchRouteQuery } from '../../src/views/assets/assetRouteHelpers'

describe('asset route helpers', () => {
  it('persists manual NSFW overrides relative to the saved default', () => {
    expect(
      buildAssetSearchRouteQuery({}, {
        searchTerm: '',
        nsfw: false,
        defaultNsfw: true,
      }),
    ).toMatchObject({ nsfw: '0' })

    expect(
      buildAssetSearchRouteQuery({}, {
        searchTerm: '',
        nsfw: true,
        defaultNsfw: true,
      }),
    ).not.toHaveProperty('nsfw')
  })
})
