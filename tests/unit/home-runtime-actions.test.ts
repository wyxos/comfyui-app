import { describe, expect, it } from 'vitest'

import { createHomeLoraActions } from '../../src/views/home/homeLoraActions'
import { createHomePreviewComputed } from '../../src/views/home/homePreviewComputed'
import { buildPromptVariantsFromFields } from '../../src/views/home/homePromptVariants'
import { createHomeRuntimeActions } from '../../src/views/home/homeRuntimeActions'
import { createHomeSelectionComputed } from '../../src/views/home/homeSelectionComputed'
import { createHomeState } from '../../src/views/home/homeState'
import { createHomeStatusComputed } from '../../src/views/home/homeStatusComputed'

function createRuntimeHarness() {
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
  const preview = createHomePreviewComputed(state, selection, {
    formatElapsed: () => '',
    getJobInputImageSnapshot: () => null,
  })
  const status = createHomeStatusComputed(state, selection, {
    getScaledAspectRatioSize: () => null,
    normalizeControlNetResolutionFromOutputSize: () => 1024,
  })
  const runtimeActions = createHomeRuntimeActions(state, selection, preview, status, {
    apiJson: async () => ({
      defaultStrength: 1,
      loras: [{ name: 'illustrious-lora.safetensors' }],
    }),
    buildCheckpointSelection: loraActions.buildCheckpointSelection,
    buildLoraSelection: loraActions.buildLoraSelection,
    canResetForm: selection.canResetForm,
    clearControlNetInstances: () => {},
    clearSelectedImage: () => {},
    formatLoraStrength: loraActions.formatLoraStrength,
    latestOutput: preview.latestOutput,
    persistFormState: () => {},
    resolveAvailableControlNetModel: () => '',
  })

  return { loraActions, runtimeActions, state }
}

describe('home runtime actions', () => {
  it('preserves all-compatible LoRA mode while refreshing available LoRAs', async () => {
    const { loraActions, runtimeActions, state } = createRuntimeHarness()

    state.selectedCheckpoints.value = [
      loraActions.buildCheckpointSelection('illustrious-a.safetensors', true, [
        loraActions.buildLoraSelection(
          'illustrious-lora.safetensors',
          '0.75',
          true,
          undefined,
          undefined,
          { applyToAllCompatible: true },
        ),
        loraActions.buildLoraSelection(
          'missing-lora.safetensors',
          '1',
          true,
          undefined,
          undefined,
          { appliedByAllCompatible: true },
        ),
      ]),
      loraActions.buildCheckpointSelection('illustrious-b.safetensors', true, [
        loraActions.buildLoraSelection(
          'illustrious-lora.safetensors',
          '0.75',
          true,
          ['tag'],
          { tag: 2 },
          { appliedByAllCompatible: true },
        ),
      ]),
    ]

    await runtimeActions.loadLoras()

    expect(state.selectedCheckpoints.value[0].loras).toMatchObject([
      { name: 'illustrious-lora.safetensors', applyToAllCompatible: true },
    ])
    expect(state.selectedCheckpoints.value[1].loras).toMatchObject([
      {
        name: 'illustrious-lora.safetensors',
        appliedByAllCompatible: true,
        enabledTriggerWords: ['tag'],
        triggerWordWeights: { tag: '2' },
      },
    ])
  })
})
