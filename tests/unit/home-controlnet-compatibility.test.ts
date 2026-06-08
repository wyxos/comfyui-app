import { ref } from 'vue'
import { describe, expect, it } from 'vitest'

import { createHomeControlNetCompatibility } from '../../src/views/home/homeControlNetCompatibility'
import type { CheckpointEntry, ControlNetOption } from '../../src/views/home/homeTypes'

const checkpoint: CheckpointEntry = {
  name: 'waiIllustriousSDXL_v160.safetensors',
  enabled: true,
  family: 'sdxl',
  displayName: 'WAI Illustrious SDXL',
  downloaded: true,
  previewUrl: null,
  previewMediaType: null,
  compatibility: { baseModel: 'Illustrious', baseModelKey: 'illustrious' },
  loraPicker: '',
  loras: [],
  controlNets: [],
}

describe('home ControlNet compatibility', () => {
  it('keeps preview and base-model metadata on ControlNet picker options', () => {
    const controlNets = ref<ControlNetOption[]>([
      {
        name: 'lineart-illustrious.safetensors',
        displayName: 'Lineart Illustrious',
        previewUrl: '/api/model-preview?type=controlnet&name=lineart-illustrious.safetensors',
        previewMediaType: 'image',
        previewPaths: [
          {
            url: '/api/model-archive-media?type=controlnet&name=lineart-illustrious.safetensors&index=0',
            mediaType: 'image',
          },
          {
            url: '/api/model-archive-media?type=controlnet&name=lineart-illustrious.safetensors&index=1',
            mediaType: 'image',
          },
        ],
        compatibility: {
          baseModel: 'Illustrious',
          baseModelKey: 'illustrious',
          compatibleBaseModels: ['Illustrious'],
          compatibleBaseModelKeys: ['illustrious'],
          controlType: 'lineart',
        },
        controlType: 'lineart',
      },
    ])
    const actions = createHomeControlNetCompatibility(controlNets)

    const [option] = actions.getCheckpointControlNetOptions(checkpoint)

    expect(option).toMatchObject({
      label: 'Lineart Illustrious',
      value: 'lineart-illustrious.safetensors',
      previewUrl: '/api/model-preview?type=controlnet&name=lineart-illustrious.safetensors',
      previewMediaType: 'image',
      previewPaths: [
        {
          url: '/api/model-archive-media?type=controlnet&name=lineart-illustrious.safetensors&index=0',
          mediaType: 'image',
        },
        {
          url: '/api/model-archive-media?type=controlnet&name=lineart-illustrious.safetensors&index=1',
          mediaType: 'image',
        },
      ],
      baseModel: 'Illustrious',
      baseModelKey: 'illustrious',
      compatibleBaseModels: ['Illustrious'],
      compatibleBaseModelKeys: ['illustrious'],
      modelMetadata: {
        baseModel: 'Illustrious',
        baseModelKey: 'illustrious',
        compatibleBaseModels: ['Illustrious'],
        compatibleBaseModelKeys: ['illustrious'],
      },
    })
  })
})
