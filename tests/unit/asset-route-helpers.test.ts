import { describe, expect, it } from 'vitest'

import { buildAssetSearchRouteQuery } from '../../src/views/assets/assetRouteHelpers'
import {
  BASE_MODEL_OPTIONS,
  DEFAULT_BASE_MODEL_LABEL,
  DEFAULT_BASE_MODELS,
  VISIBLE_BASE_MODEL_OPTIONS,
} from '../../src/views/assets/assetViewTypes'

describe('asset route helpers', () => {
  it('does not select Flux base models by default', () => {
    const fluxModels = BASE_MODEL_OPTIONS
      .filter((option) => option.group === 'Flux')
      .map((option) => option.value)

    expect(fluxModels.length).toBeGreaterThan(0)
    expect(DEFAULT_BASE_MODELS).not.toEqual(expect.arrayContaining(fluxModels))
  })

  it('does not render Flux base models in the visible assets compatibility filter', () => {
    expect(VISIBLE_BASE_MODEL_OPTIONS.map((option) => option.label)).not.toEqual(
      expect.arrayContaining(['Flux.1 D', 'Flux.1 S', 'Flux.1 Kontext']),
    )
    expect(VISIBLE_BASE_MODEL_OPTIONS.some((option) => option.group === 'Flux')).toBe(false)
    expect(DEFAULT_BASE_MODEL_LABEL).toBe('SDXL, Pony, Illustrious, Anima')
  })

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

  it('persists Civitai tag searches without a text query', () => {
    expect(
      buildAssetSearchRouteQuery({}, {
        searchTerm: '',
        tag: 'mecha',
      }),
    ).toMatchObject({ tag: 'mecha' })
  })
})
