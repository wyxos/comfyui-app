import { describe, expect, it } from 'vitest'

import { createHomeLoraActions } from '../../src/views/home/homeLoraActions'
import { createHomeModelActions } from '../../src/views/home/homeModelActions'
import { createHomeSelectionComputed } from '../../src/views/home/homeSelectionComputed'
import { createHomeState } from '../../src/views/home/homeState'
import { buildPromptVariantsFromFields } from '../../src/views/home/homePromptVariants'

function createActionsHarness() {
  const state = createHomeState()
  const selection = createHomeSelectionComputed(state, {
    buildNegativePromptFromTags: () => '',
    buildPromptFromSections: () => '',
    buildPromptVariantsFromFields,
    getLatestOutput: () => null,
    hasPromptSectionDrafts: () => false,
  })
  const loraActions = createHomeLoraActions(state, selection, {
    buildStoredInputImagePreviewUrl: (inputImageName) => `/api/input/${inputImageName}`,
    normalizeControlNetResolutionFromOutputSize: () => 1024,
    resolveAvailableControlNetModel: (model) => (typeof model === 'string' ? model : ''),
  })
  const modelActions = createHomeModelActions(state, selection, {
    buildCheckpointSelection: loraActions.buildCheckpointSelection,
    buildLoraSelection: loraActions.buildLoraSelection,
    formatLoraStrength: loraActions.formatLoraStrength,
  })

  state.defaultLoraStrength.value = '0.75'
  state.checkpoints.value = [
    {
      name: 'illustrious-a.safetensors',
      family: 'sdxl',
      compatibility: { baseModel: 'Illustrious', baseModelKey: 'illustrious' },
    },
    {
      name: 'illustrious-b.safetensors',
      family: 'sdxl',
      compatibility: { baseModel: 'Illustrious', baseModelKey: 'illustrious' },
    },
    {
      name: 'anima.safetensors',
      family: 'anima',
      compatibility: { baseModel: 'Anima', baseModelKey: 'anima' },
    },
  ]
  state.loras.value = [
    {
      name: 'illustrious-lora.safetensors',
      compatibility: { baseModel: 'Illustrious', baseModelKey: 'illustrious' },
    },
  ]

  return { modelActions, selection, state }
}

describe('home model actions', () => {
  it('applies a LoRA to all compatible loaded checkpoints from one toggle', () => {
    const { modelActions, state } = createActionsHarness()

    modelActions.addSelectedCheckpoint('illustrious-a.safetensors')
    modelActions.addSelectedCheckpoint('illustrious-b.safetensors')
    modelActions.addSelectedCheckpoint('anima.safetensors')
    modelActions.addCheckpointLora('illustrious-a.safetensors', 'illustrious-lora.safetensors')

    modelActions.toggleLoraAllCompatible('illustrious-a.safetensors', 'illustrious-lora.safetensors')

    expect(state.selectedCheckpoints.value).toMatchObject([
      {
        name: 'illustrious-a.safetensors',
        loras: [{ name: 'illustrious-lora.safetensors', applyToAllCompatible: true }],
      },
      {
        name: 'illustrious-b.safetensors',
        loras: [{ name: 'illustrious-lora.safetensors', appliedByAllCompatible: true }],
      },
      {
        name: 'anima.safetensors',
        loras: [],
      },
    ])
  })

  it('keeps all-compatible LoRAs synced for compatible checkpoints added later', () => {
    const { modelActions, state } = createActionsHarness()

    modelActions.addSelectedCheckpoint('illustrious-a.safetensors')
    modelActions.addCheckpointLora('illustrious-a.safetensors', 'illustrious-lora.safetensors')
    modelActions.toggleLoraAllCompatible('illustrious-a.safetensors', 'illustrious-lora.safetensors')
    modelActions.addSelectedCheckpoint('illustrious-b.safetensors')

    expect(state.selectedCheckpoints.value[1]).toMatchObject({
      name: 'illustrious-b.safetensors',
      loras: [{ name: 'illustrious-lora.safetensors', appliedByAllCompatible: true }],
    })

    modelActions.toggleLoraAllCompatible('illustrious-b.safetensors', 'illustrious-lora.safetensors')

    expect(state.selectedCheckpoints.value[0].loras).toMatchObject([
      { name: 'illustrious-lora.safetensors', applyToAllCompatible: undefined },
    ])
    expect(state.selectedCheckpoints.value[1].loras).toEqual([])
  })

  it('clears automatically applied LoRAs when the all-compatible source is cleared', () => {
    const { modelActions, state } = createActionsHarness()

    modelActions.addSelectedCheckpoint('illustrious-a.safetensors')
    modelActions.addSelectedCheckpoint('illustrious-b.safetensors')
    modelActions.addCheckpointLora('illustrious-a.safetensors', 'illustrious-lora.safetensors')
    modelActions.toggleLoraAllCompatible('illustrious-a.safetensors', 'illustrious-lora.safetensors')

    modelActions.clearCheckpointLoras('illustrious-a.safetensors')

    expect(state.selectedCheckpoints.value[0].loras).toEqual([])
    expect(state.selectedCheckpoints.value[1].loras).toEqual([])
  })

  it('keeps LoRA base-model metadata on picker options for modal filtering', () => {
    const { modelActions, selection } = createActionsHarness()
    modelActions.addSelectedCheckpoint('illustrious-a.safetensors')

    const [option] = modelActions.getCheckpointLoraOptions(selection.selectedCheckpointEntries.value[0])

    expect(option.modelMetadata).toMatchObject({
      baseModel: 'Illustrious',
      baseModelKey: 'illustrious',
    })
  })
})
