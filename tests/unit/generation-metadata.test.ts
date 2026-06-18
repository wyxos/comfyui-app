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

  it('extracts A1111 hires replay, schedule type, clip skip, and model verification fields', () => {
    const fields = extractGenerationMetadataFields(
      {
        prompt: '1girl, blue hair',
        negativePrompt: 'bad quality',
        seed: 424011486,
        steps: 30,
        cfgScale: 7,
        sampler: 'Euler a',
        width: 1024,
        height: 1344,
        'Schedule type': 'Automatic',
        'Denoising strength': 0.5,
        'Hires upscale': 2,
        'Hires steps': 20,
        'Hires CFG Scale': 4.5,
        'Hires upscaler': 'RealESRGAN_x4plus_anime_6B',
        clipSkip: 2,
        VAE: 'sdxl_vae',
        'VAE hash': 'a1b2c3',
        Model: 'WAI-Nsfw-Illustrious-17',
        'Model hash': 'f116b0c78f',
      },
      {
        samplerOptions,
        schedulerOptions,
        vaeOptions: ['sdxl_vae.safetensors'],
        upscaleModelOptions: ['RealESRGAN_x4plus_anime_6B.pth'],
      },
    )

    expect(fields).toMatchObject({
      prompt: '1girl, blue hair',
      negativePrompt: 'bad quality',
      seed: '424011486',
      steps: '30',
      cfg: '7',
      samplerName: 'euler_ancestral',
      scheduler: 'normal',
      imageDenoise: '0.5',
      width: '1024',
      height: '1344',
      clipSkip: '2',
      vaeName: 'sdxl_vae.safetensors',
      hiresEnabled: true,
      hiresUpscale: '2',
      hiresWidth: '2048',
      hiresHeight: '2688',
      hiresSteps: '20',
      hiresCfg: '4.5',
      hiresDenoise: '0.5',
      hiresUpscaler: 'RealESRGAN_x4plus_anime_6B.pth',
      hiresScheduler: 'normal',
      modelName: 'WAI-Nsfw-Illustrious-17',
      modelHash: 'f116b0c78f',
      vaeHash: 'a1b2c3',
      sourceVaeName: 'sdxl_vae',
      sourceHiresUpscaler: 'RealESRGAN_x4plus_anime_6B',
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
