import { describe, expect, it } from 'vitest'

import { createHomeMetadataActions } from '../../src/views/home/homeMetadataActions'
import { createHomeState } from '../../src/views/home/homeState'

describe('home metadata actions', () => {
  it('applies replay metadata and selects the checkpoint matched by hash', () => {
    const state = createHomeState()
    state.checkpoints.value = [
      {
        name: 'waiIllustriousSDXL_v170.safetensors',
        family: 'sdxl',
        compatibility: {
          hashes: {
            AutoV2: 'f116b0c78fbbccddeeff',
          },
        },
      },
      {
        name: 'other.safetensors',
        family: 'sdxl',
      },
    ]
    state.selectedCheckpoints.value = [
      {
        name: 'other.safetensors',
        enabled: true,
        loras: [],
        loraPicker: '',
        controlNets: [],
      },
    ]
    state.samplerOptions.value = ['euler_ancestral']
    state.schedulerOptions.value = ['normal']
    state.vaeNameOptions.value = ['sdxl_vae.safetensors']
    state.upscaleModelOptions.value = ['RealESRGAN_x4plus_anime_6B.pth']

    createHomeMetadataActions(state).applyGenerationMetadataFromSource({
      prompt: '1girl',
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
      Model: 'WAI-Nsfw-Illustrious-17',
      'Model hash': 'f116b0c78f',
    })

    expect(state.selectedCheckpoints.value).toEqual([
      expect.objectContaining({
        name: 'waiIllustriousSDXL_v170.safetensors',
        enabled: true,
      }),
    ])
    expect(state.scheduler.value).toBe('normal')
    expect(state.clipSkip.value).toBe('2')
    expect(state.vaeName.value).toBe('sdxl_vae.safetensors')
    expect(state.hiresEnabled.value).toBe(true)
    expect(state.hiresWidth.value).toBe('2048')
    expect(state.hiresHeight.value).toBe('2688')
    expect(state.hiresDenoise.value).toBe('0.5')
    expect(state.hiresUpscaler.value).toBe('RealESRGAN_x4plus_anime_6B.pth')
    expect(state.metadataReplayWarnings.value).toEqual([])
    expect(state.metadataPasteNotice.value).toBe('Metadata applied.')
  })
})
