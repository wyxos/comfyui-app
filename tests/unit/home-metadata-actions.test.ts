import { beforeEach, describe, expect, it, vi } from 'vitest'

const { toastWarning } = vi.hoisted(() => ({
  toastWarning: vi.fn(),
}))

vi.mock('vue-sonner', () => ({
  toast: {
    warning: toastWarning,
  },
}))

import { createHomeMetadataActions } from '../../src/views/home/homeMetadataActions'
import { createHomeState } from '../../src/views/home/homeState'

describe('home metadata actions', () => {
  beforeEach(() => {
    toastWarning.mockClear()
  })

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
    expect(toastWarning).not.toHaveBeenCalled()
  })

  it('warns when metadata has unsupported fields or missing local checkpoint metadata', () => {
    const state = createHomeState()
    state.checkpoints.value = []
    state.schedulerOptions.value = ['normal']

    createHomeMetadataActions(state).applyGenerationMetadataFromSource({
      RNG: 'CPU',
      Model: 'WAI-anima-01',
      Shift: '3',
      width: 1024,
      height: 1344,
      Version: 'neo',
      'Module 1': 'qwen_image_vae',
      'Module 2': 'qwen_3_06b_base',
      'Model hash': '195ff3c7a5',
      'Schedule type': 'Normal',
      clipSkip: 2,
    })

    expect(state.width.value).toBe('1024')
    expect(state.height.value).toBe('1344')
    expect(state.scheduler.value).toBe('normal')
    expect(state.clipSkip.value).toBe('2')
    expect(state.metadataPasteNotice.value).toBe('Metadata applied with replay warnings.')
    expect(state.metadataReplayWarnings.value).toEqual([
      'Model hash 195ff3c7a5 was not found in local checkpoint metadata.',
      'RNG CPU was not applied. Companion does not expose an RNG control.',
      'Shift 3 was not applied. Companion does not expose a Shift control.',
      'Version neo was not applied. Version is source metadata, not a generation control.',
      'Module 1 qwen_image_vae was not applied. Base modules are not mapped to Companion controls yet.',
      'Module 2 qwen_3_06b_base was not applied. Base modules are not mapped to Companion controls yet.',
    ])
    expect(toastWarning).toHaveBeenCalledWith('Metadata applied with replay warnings.', {
      description: '6 replay warnings need review.',
    })
  })
})
