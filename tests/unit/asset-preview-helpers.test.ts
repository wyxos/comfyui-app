import { describe, expect, it } from 'vitest'
import {
  civitaiModelWebUrl,
  imageNsfwDetectedValue,
  modelHasNsfwContent,
  versionDownloadUnavailableLabel,
} from '../../src/components/asset-preview/assetPreviewHelpers'

describe('asset preview helpers', () => {
  it('uses civitai.com for safe model web links', () => {
    expect(civitaiModelWebUrl({
      id: 101,
      nsfw: false,
      modelVersions: [
        {
          images: [
            { nsfw: 'Safe' },
          ],
        },
      ],
    })).toBe('https://civitai.com/models/101')
  })

  it('uses civitai.red for NSFW model web links', () => {
    expect(civitaiModelWebUrl({
      id: 202,
      nsfw: true,
      modelVersions: [
        {
          images: [
            { nsfwLevel: 8 },
          ],
        },
      ],
    })).toBe('https://civitai.red/models/202')
  })

  it('uses civitai.red when a model image is flagged NSFW', () => {
    expect(civitaiModelWebUrl({
      id: 303,
      nsfw: false,
      modelVersions: [
        {
          images: [
            { nsfwLevel: 'Mature' },
          ],
        },
      ],
    })).toBe('https://civitai.red/models/303')
  })

  it('does not classify PG-13 numeric nsfwLevel images as NSFW', () => {
    expect(imageNsfwDetectedValue({ nsfwLevel: 2 })).toBe(false)
    expect(imageNsfwDetectedValue({ nsfwLevel: 'PG-13' })).toBe(false)
    expect(imageNsfwDetectedValue({ nsfwLevel: 4 })).toBe(false)
    expect(imageNsfwDetectedValue({ nsfwLevel: 8 })).toBe(true)
    expect(imageNsfwDetectedValue({ nsfwLevel: 'R' })).toBe(true)
  })

  it('uses nsfwLevel instead of stale legacy nsfw flags', () => {
    expect(imageNsfwDetectedValue({ nsfw: true, nsfwLevel: 1 })).toBe(false)
    expect(imageNsfwDetectedValue({ nsfw: 'Mature', nsfwLevel: 'PG-13' })).toBe(false)
    expect(imageNsfwDetectedValue({ nsfw: false, nsfwLevel: 4 })).toBe(false)
    expect(imageNsfwDetectedValue({ nsfw: false, nsfwLevel: 8 })).toBe(true)
    expect(imageNsfwDetectedValue({ nsfw: true })).toBe(null)
  })

  it('ignores legacy model nsfw when deciding model safety', () => {
    expect(modelHasNsfwContent({
      id: 606,
      nsfw: true,
      modelVersions: [{ images: [{ nsfw: true, nsfwLevel: 1 }] }],
    })).toBe(false)
  })

  it('labels uncovered early-access versions as unavailable for app downloads', () => {
    expect(versionDownloadUnavailableLabel({
      id: 404,
      availability: 'EarlyAccess',
      covered: false,
      files: [
        {
          name: 'early.safetensors',
          type: 'Model',
          downloadUrl: 'https://civitai.com/api/download/models/404',
          primary: true,
        },
      ],
    })).toBe('Early access locked')
  })

  it('allows covered early-access versions to download', () => {
    expect(versionDownloadUnavailableLabel({
      id: 405,
      availability: 'EarlyAccess',
      covered: true,
      files: [
        {
          name: 'covered.safetensors',
          type: 'Model',
          downloadUrl: 'https://civitai.com/api/download/models/405',
          primary: true,
        },
      ],
    })).toBe('')
  })
})
