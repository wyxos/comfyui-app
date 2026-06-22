import { describe, expect, it } from 'vitest'
import {
  civitaiModelWebUrl,
  imageMatchesNsfwBlurLevel,
  imageNsfwDetectedValue,
  imageNsfwLabel,
  imagesForVersion,
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

  it('classifies current Civitai nsfwLevel values by browsing-level flags', () => {
    expect(imageNsfwDetectedValue({ nsfwLevel: 2 })).toBe(false)
    expect(imageNsfwDetectedValue({ nsfwLevel: 'PG-13' })).toBe(false)
    expect(imageNsfwDetectedValue({ nsfwLevel: 4 })).toBe(true)
    expect(imageNsfwDetectedValue({ nsfwLevel: 7 })).toBe(true)
    expect(imageNsfwDetectedValue({ nsfwLevel: 8 })).toBe(true)
    expect(imageNsfwDetectedValue({ nsfwLevel: 'R' })).toBe(true)
  })

  it('uses nsfwLevel instead of stale legacy nsfw flags', () => {
    expect(imageNsfwDetectedValue({ nsfw: true, nsfwLevel: 1 })).toBe(false)
    expect(imageNsfwDetectedValue({ nsfw: 'Mature', nsfwLevel: 'PG-13' })).toBe(false)
    expect(imageNsfwDetectedValue({ nsfw: false, nsfwLevel: 4 })).toBe(true)
    expect(imageNsfwDetectedValue({ nsfw: false, nsfwLevel: 7 })).toBe(true)
    expect(imageNsfwDetectedValue({ nsfw: false, nsfwLevel: 8 })).toBe(true)
    expect(imageNsfwDetectedValue({ nsfw: true })).toBe(null)
  })

  it('matches image blur thresholds from R through Blocked', () => {
    expect(imageMatchesNsfwBlurLevel({ nsfwLevel: 4 }, 4)).toBe(true)
    expect(imageMatchesNsfwBlurLevel({ nsfwLevel: 4 }, 8)).toBe(false)
    expect(imageMatchesNsfwBlurLevel({ nsfwLevel: 7 }, 4)).toBe(true)
    expect(imageMatchesNsfwBlurLevel({ nsfwLevel: 7 }, 8)).toBe(false)
    expect(imageMatchesNsfwBlurLevel({ nsfwLevel: 16 }, 8)).toBe(true)
    expect(imageMatchesNsfwBlurLevel({ nsfwLevel: 32 }, 32)).toBe(true)
    expect(imageMatchesNsfwBlurLevel({ nsfwLevel: 32 }, null)).toBe(false)
  })

  it('labels modal image safety by Civitai level instead of yes or no', () => {
    expect(imageNsfwLabel(null, { nsfwLevel: 1 })).toBe('PG')
    expect(imageNsfwLabel(null, { nsfwLevel: 2 })).toBe('PG-13')
    expect(imageNsfwLabel(null, { nsfw: false, nsfwLevel: 7 })).toBe('R')
    expect(imageNsfwLabel(null, { nsfwLevel: 8 })).toBe('X')
    expect(imageNsfwLabel(null, { nsfwLevel: 16 })).toBe('XXX')
    expect(imageNsfwLabel(null, { nsfwLevel: 32 })).toBe('Blocked')
    expect(imageNsfwLabel(null, { nsfw: true })).toBe('Unknown')
  })

  it('ignores legacy model nsfw when deciding model safety', () => {
    expect(modelHasNsfwContent({
      id: 606,
      nsfw: true,
      modelVersions: [{ images: [{ nsfw: true, nsfwLevel: 1 }] }],
    })).toBe(false)
  })

  it('uses model and version nsfwLevel fields for model safety', () => {
    expect(modelHasNsfwContent({
      id: 707,
      nsfw: false,
      nsfwLevel: 7,
      modelVersions: [],
    })).toBe(true)

    expect(modelHasNsfwContent({
      id: 808,
      nsfw: false,
      nsfwLevel: 1,
      modelVersions: [{ nsfwLevel: 4, images: [{ nsfwLevel: 1 }] }],
    })).toBe(true)
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

  it('infers missing Civitai image ids from numeric CDN filenames', () => {
    const images = imagesForVersion({
      id: 505,
      images: [
        {
          url: 'https://image.civitai.com/xG1nkqKTMzGDvpLrqFT7WA/00bed0b0-f493-4e56-aa31-1079f3dae8b2/original=true/134254134.jpeg',
          hash: 'UBAI_e}]%3%he?^R=|kDIUNHWYNFxIM{E1EN',
        },
        {
          id: 42,
          url: 'https://image.civitai.com/xG1nkqKTMzGDvpLrqFT7WA/with-id/original=true/ignored.jpeg',
        },
      ],
    })

    expect(images[0]?.id).toBe(134254134)
    expect(images[1]?.id).toBe(42)
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
