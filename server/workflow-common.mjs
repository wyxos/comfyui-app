import { safeTrim } from './shared.mjs'
import { stripModelExtension } from './workflow-naming.mjs'

export function createNodeIdGenerator(start = 3) {
  let nextId = start
  return () => String(nextId++)
}

export function buildPromptVariantLabel(variant) {
  return safeTrim(variant?.label) || 'Prompt'
}

export function buildPromptVariantNodeLabel(action, variant) {
  return `${action} ${buildPromptVariantLabel(variant).toLowerCase()}`
}

export function applyLorasToModelAndClip({ prompt, nodeLabels, nextNodeId, modelRef, clipRef, loras }) {
  let activeModelRef = modelRef
  let activeClipRef = clipRef

  for (const lora of Array.isArray(loras) ? loras : []) {
    const loraNodeId = nextNodeId()
    prompt[loraNodeId] = {
      class_type: 'LoraLoader',
      inputs: {
        model: activeModelRef,
        clip: activeClipRef,
        lora_name: lora.name,
        strength_model: lora.strength,
        strength_clip: lora.strength,
      },
    }
    nodeLabels[loraNodeId] = `Applying LoRA ${stripModelExtension(lora.name) || lora.name}`
    activeModelRef = [loraNodeId, 0]
    activeClipRef = [loraNodeId, 1]
  }

  return {
    modelRef: activeModelRef,
    clipRef: activeClipRef,
  }
}
