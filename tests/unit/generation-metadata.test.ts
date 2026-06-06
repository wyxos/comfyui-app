import { describe, expect, it } from 'vitest'

import {
  extractGenerationMetadataFields,
  parseGenerationMetadataClipboard,
  serializeGenerationMetadataClipboard,
} from '../../src/lib/generationMetadata'

const samplerOptions = ['dpmpp_2m', 'euler', 'euler_ancestral']
const schedulerOptions = ['normal', 'karras', 'sgm_uniform']

describe('generation metadata mapping', () => {
  it('normalizes Civitai image metadata into generation form fields', () => {
    const fields = extractGenerationMetadataFields(
      {
        Prompt: 'silver hair, looking away',
        'Negative prompt': 'blur, text',
        Seed: 987654,
        Steps: 30,
        'CFG scale': 6.5,
        Sampler: 'DPM++ 2M Karras',
        'Denoising strength': 0.62,
        Size: '832x1216',
      },
      { samplerOptions, schedulerOptions },
    )

    expect(fields).toEqual({
      prompt: 'silver hair, looking away',
      negativePrompt: 'blur, text',
      seed: '987654',
      steps: '30',
      cfg: '6.5',
      samplerName: 'dpmpp_2m',
      scheduler: 'karras',
      imageDenoise: '0.62',
      width: '832',
      height: '1216',
    })
  })

  it('round-trips copied metadata payloads for form paste', () => {
    const copied = serializeGenerationMetadataClipboard(
      {
        prompt: 'portrait',
        negativePrompt: 'low quality',
        sampler: 'Euler a',
        scheduler: 'normal',
      },
      { samplerOptions, schedulerOptions },
    )

    expect(parseGenerationMetadataClipboard(copied, { samplerOptions, schedulerOptions })).toEqual({
      prompt: 'portrait',
      negativePrompt: 'low quality',
      samplerName: 'euler_ancestral',
      scheduler: 'normal',
    })
  })
})
