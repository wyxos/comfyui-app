import { describe, expect, it } from 'vitest'

import { ASSET_SEARCH_PRESETS } from '../../src/views/assets/assetViewTypes'

describe('asset search presets', () => {
  it('includes latest and keeps presets in authenticated primary-file mode without forcing NSFW', () => {
    expect(ASSET_SEARCH_PRESETS.map((preset) => preset.label)).toContain('Latest')

    for (const preset of ASSET_SEARCH_PRESETS) {
      expect(preset.nsfw).toBeUndefined()
      expect(preset.primaryFileOnly).toBe(true)
    }
  })
})
