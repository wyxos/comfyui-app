import { animaAssets, samplerProfiles } from './config.mjs'
import { safeTrim } from './shared.mjs'
import { normalizeCfg, normalizeDenoise, normalizeDimension, normalizeSeed } from './model-paths.mjs'
import { applyControlNetSourcesToConditioning, createControlNetSourceNodes } from './controlnet-workflow.mjs'
export function detectCheckpointFamily(checkpointName) {
  return checkpointName.toLowerCase().includes('anima') ? 'anima' : 'sdxl'
}
export function createNodeIdGenerator(start = 3) {
  let nextId = start
  return () => String(nextId++)
}
export function buildPromptVariantLabel(variant) {
  return variant.isImproved ? 'Improved prompt' : 'Original prompt'
}
export function buildPromptVariantNodeLabel(action, variant) {
  return `${action} ${buildPromptVariantLabel(variant).toLowerCase()}`
}
export function stripModelExtension(modelName) {
  return safeTrim(modelName).replace(/\.[^.]+$/, '')
}

export function buildModelToken(modelName, fallback = 'model') {
  const normalized = stripModelExtension(modelName)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)

  return normalized || fallback
}
export function buildFilenamePrefix(basePrefix, checkpoint, variant, variantCount) {
  const checkpointToken = buildModelToken(checkpoint)
  const variantSuffix = variantCount > 1 ? `-${buildModelToken(variant.id, 'variant')}` : ''
  return `${basePrefix}-${checkpointToken}${variantSuffix}`
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
export function buildSdxlWorkflow({
  promptVariants,
  negativePrompt,
  checkpoint,
  loras = [],
  width,
  height,
  cfg,
  denoise,
  seed,
  inputImageName,
  controlNets = [],
}) {
  const samplerProfile = samplerProfiles.sdxl
  const usingImageInput = Boolean(inputImageName)
  const prompt = {}
  const nodeLabels = {}
  const saveNodeMeta = {}
  const outputNodeOrder = []
  const nextNodeId = createNodeIdGenerator()
  const checkpointNodeId = nextNodeId()
  const negativeNodeId = nextNodeId()
  const positiveNodeIds = {}
  prompt[checkpointNodeId] = {
    class_type: 'CheckpointLoaderSimple',
    inputs: {
      ckpt_name: checkpoint,
    },
  }
  nodeLabels[checkpointNodeId] = 'Loading checkpoint'
  let activeModelRef = [checkpointNodeId, 0]
  let activeClipRef = [checkpointNodeId, 1]
  ;({ modelRef: activeModelRef, clipRef: activeClipRef } = applyLorasToModelAndClip({
    prompt,
    nodeLabels,
    nextNodeId,
    modelRef: activeModelRef,
    clipRef: activeClipRef,
    loras,
  }))
  prompt[negativeNodeId] = {
    class_type: 'CLIPTextEncode',
    inputs: {
      text: negativePrompt,
      clip: activeClipRef,
    },
  }
  nodeLabels[negativeNodeId] = 'Encoding negative prompt'
  for (const variant of promptVariants) {
    const positiveNodeId = nextNodeId()
    positiveNodeIds[variant.id] = positiveNodeId
    prompt[positiveNodeId] = {
      class_type: 'CLIPTextEncode',
      inputs: {
        text: variant.promptText,
        clip: activeClipRef,
      },
    }
    nodeLabels[positiveNodeId] = buildPromptVariantNodeLabel('Encoding', variant)
  }
  let latentSourceNodeId
  if (usingImageInput) {
    const loadImageNodeId = nextNodeId()
    const imageScaleNodeId = nextNodeId()
    const vaeEncodeNodeId = nextNodeId()
    prompt[loadImageNodeId] = {
      class_type: 'LoadImage',
      inputs: {
        image: inputImageName,
      },
    }
    prompt[imageScaleNodeId] = {
      class_type: 'ImageScale',
      inputs: {
        image: [loadImageNodeId, 0],
        upscale_method: 'lanczos',
        width,
        height,
        crop: 'center',
      },
    }
    prompt[vaeEncodeNodeId] = {
      class_type: 'VAEEncode',
      inputs: {
        pixels: [imageScaleNodeId, 0],
        vae: [checkpointNodeId, 2],
      },
    }
    Object.assign(nodeLabels, {
      [loadImageNodeId]: 'Loading input image',
      [imageScaleNodeId]: 'Resizing input image',
      [vaeEncodeNodeId]: 'Encoding input image',
    })
    latentSourceNodeId = vaeEncodeNodeId
  } else {
    const emptyLatentNodeId = nextNodeId()
    prompt[emptyLatentNodeId] = {
      class_type: 'EmptyLatentImage',
      inputs: {
        width,
        height,
        batch_size: 1,
      },
    }
    nodeLabels[emptyLatentNodeId] = 'Preparing latent'
    latentSourceNodeId = emptyLatentNodeId
  }
  const controlNetSources = createControlNetSourceNodes({
    prompt,
    nodeLabels,
    nextNodeId,
    controlNets,
    width,
    height,
  })
  for (const variant of promptVariants) {
    const samplerNodeId = nextNodeId()
    const vaeDecodeNodeId = nextNodeId()
    const saveImageNodeId = nextNodeId()
    const conditioningRefs = applyControlNetSourcesToConditioning({
      prompt,
      nodeLabels,
      nextNodeId,
      positiveRef: [positiveNodeIds[variant.id], 0],
      negativeRef: [negativeNodeId, 0],
      controlNetSources,
      variantLabel: buildPromptVariantLabel(variant).toLowerCase(),
    })

    prompt[samplerNodeId] = {
      class_type: 'KSampler',
      inputs: {
        seed,
        steps: samplerProfile.steps,
        cfg,
        sampler_name: samplerProfile.samplerName,
        scheduler: samplerProfile.scheduler,
        denoise: usingImageInput ? denoise : samplerProfile.txt2imgDenoise,
        model: activeModelRef,
        positive: conditioningRefs.positiveRef,
        negative: conditioningRefs.negativeRef,
        latent_image: [latentSourceNodeId, 0],
      },
    }
    prompt[vaeDecodeNodeId] = {
      class_type: 'VAEDecode',
      inputs: {
        samples: [samplerNodeId, 0],
        vae: [checkpointNodeId, 2],
      },
    }
    prompt[saveImageNodeId] = {
      class_type: 'SaveImage',
      inputs: {
        filename_prefix: buildFilenamePrefix(
          samplerProfile.filenamePrefix,
          checkpoint,
          variant,
          promptVariants.length,
        ),
        images: [vaeDecodeNodeId, 0],
      },
    }

    nodeLabels[samplerNodeId] = buildPromptVariantNodeLabel('Sampling', variant)
    nodeLabels[vaeDecodeNodeId] = buildPromptVariantNodeLabel('Decoding', variant)
    nodeLabels[saveImageNodeId] = buildPromptVariantNodeLabel('Saving', variant)
    saveNodeMeta[saveImageNodeId] = {
      variantId: variant.id,
      variantLabel: buildPromptVariantLabel(variant),
      promptText: variant.promptText,
      isImproved: Boolean(variant.isImproved),
    }
    outputNodeOrder.push(saveImageNodeId)
  }
  return { prompt, nodeLabels, saveNodeMeta, outputNodeOrder }
}
export function buildAnimaWorkflow({
  promptVariants,
  negativePrompt,
  checkpoint,
  loras = [],
  width,
  height,
  cfg,
  denoise,
  seed,
  inputImageName,
  controlNets = [],
}) {
  const samplerProfile = samplerProfiles.anima
  const usingImageInput = Boolean(inputImageName)
  const prompt = {}
  const nodeLabels = {}
  const saveNodeMeta = {}
  const outputNodeOrder = []
  const nextNodeId = createNodeIdGenerator()
  const checkpointNodeId = nextNodeId()
  const clipLoaderNodeId = nextNodeId()
  const vaeLoaderNodeId = nextNodeId()
  const negativeNodeId = nextNodeId()
  const positiveNodeIds = {}
  prompt[checkpointNodeId] = {
    class_type: 'CheckpointLoaderSimple',
    inputs: {
      ckpt_name: checkpoint,
    },
  }
  prompt[clipLoaderNodeId] = {
    class_type: 'CLIPLoader',
    inputs: {
      clip_name: animaAssets.clipName,
      type: animaAssets.clipType,
    },
  }
  prompt[vaeLoaderNodeId] = {
    class_type: 'VAELoader',
    inputs: {
      vae_name: animaAssets.vaeName,
    },
  }
  prompt[negativeNodeId] = {
    class_type: 'CLIPTextEncode',
    inputs: {
      text: negativePrompt,
      clip: [clipLoaderNodeId, 0],
    },
  }

  Object.assign(nodeLabels, {
    [checkpointNodeId]: 'Loading checkpoint',
    [clipLoaderNodeId]: 'Loading prompt encoder',
    [vaeLoaderNodeId]: 'Loading VAE',
    [negativeNodeId]: 'Encoding negative prompt',
  })
  let activeModelRef = [checkpointNodeId, 0]
  let activeClipRef = [clipLoaderNodeId, 0]
  ;({ modelRef: activeModelRef, clipRef: activeClipRef } = applyLorasToModelAndClip({
    prompt,
    nodeLabels,
    nextNodeId,
    modelRef: activeModelRef,
    clipRef: activeClipRef,
    loras,
  }))
  prompt[negativeNodeId].inputs.clip = activeClipRef
  for (const variant of promptVariants) {
    const positiveNodeId = nextNodeId()
    positiveNodeIds[variant.id] = positiveNodeId
    prompt[positiveNodeId] = {
      class_type: 'CLIPTextEncode',
      inputs: {
        text: variant.promptText,
        clip: activeClipRef,
      },
    }
    nodeLabels[positiveNodeId] = buildPromptVariantNodeLabel('Encoding', variant)
  }
  let latentSourceNodeId
  if (usingImageInput) {
    const loadImageNodeId = nextNodeId()
    const imageScaleNodeId = nextNodeId()
    const vaeEncodeNodeId = nextNodeId()
    prompt[loadImageNodeId] = {
      class_type: 'LoadImage',
      inputs: {
        image: inputImageName,
      },
    }
    prompt[imageScaleNodeId] = {
      class_type: 'ImageScale',
      inputs: {
        image: [loadImageNodeId, 0],
        upscale_method: 'lanczos',
        width,
        height,
        crop: 'center',
      },
    }
    prompt[vaeEncodeNodeId] = {
      class_type: 'VAEEncode',
      inputs: {
        pixels: [imageScaleNodeId, 0],
        vae: [vaeLoaderNodeId, 0],
      },
    }
    Object.assign(nodeLabels, {
      [loadImageNodeId]: 'Loading input image',
      [imageScaleNodeId]: 'Resizing input image',
      [vaeEncodeNodeId]: 'Encoding input image',
    })
    latentSourceNodeId = vaeEncodeNodeId
  } else {
    const emptyLatentNodeId = nextNodeId()
    prompt[emptyLatentNodeId] = {
      class_type: 'EmptySD3LatentImage',
      inputs: {
        width,
        height,
        batch_size: 1,
      },
    }
    nodeLabels[emptyLatentNodeId] = 'Preparing latent'
    latentSourceNodeId = emptyLatentNodeId
  }
  const controlNetSources = createControlNetSourceNodes({
    prompt,
    nodeLabels,
    nextNodeId,
    controlNets,
    width,
    height,
  })
  for (const variant of promptVariants) {
    const samplerNodeId = nextNodeId()
    const vaeDecodeNodeId = nextNodeId()
    const saveImageNodeId = nextNodeId()
    const conditioningRefs = applyControlNetSourcesToConditioning({
      prompt,
      nodeLabels,
      nextNodeId,
      positiveRef: [positiveNodeIds[variant.id], 0],
      negativeRef: [negativeNodeId, 0],
      controlNetSources,
      variantLabel: buildPromptVariantLabel(variant).toLowerCase(),
    })

    prompt[samplerNodeId] = {
      class_type: 'KSampler',
      inputs: {
        seed,
        steps: samplerProfile.steps,
        cfg,
        sampler_name: samplerProfile.samplerName,
        scheduler: samplerProfile.scheduler,
        denoise: usingImageInput ? denoise : samplerProfile.txt2imgDenoise,
        model: activeModelRef,
        positive: conditioningRefs.positiveRef,
        negative: conditioningRefs.negativeRef,
        latent_image: [latentSourceNodeId, 0],
      },
    }
    prompt[vaeDecodeNodeId] = {
      class_type: 'VAEDecode',
      inputs: {
        samples: [samplerNodeId, 0],
        vae: [vaeLoaderNodeId, 0],
      },
    }
    prompt[saveImageNodeId] = {
      class_type: 'SaveImage',
      inputs: {
        filename_prefix: buildFilenamePrefix(
          samplerProfile.filenamePrefix,
          checkpoint,
          variant,
          promptVariants.length,
        ),
        images: [vaeDecodeNodeId, 0],
      },
    }

    nodeLabels[samplerNodeId] = buildPromptVariantNodeLabel('Sampling', variant)
    nodeLabels[vaeDecodeNodeId] = buildPromptVariantNodeLabel('Decoding', variant)
    nodeLabels[saveImageNodeId] = buildPromptVariantNodeLabel('Saving', variant)
    saveNodeMeta[saveImageNodeId] = {
      variantId: variant.id,
      variantLabel: buildPromptVariantLabel(variant),
      promptText: variant.promptText,
      isImproved: Boolean(variant.isImproved),
    }
    outputNodeOrder.push(saveImageNodeId)
  }
  return { prompt, nodeLabels, saveNodeMeta, outputNodeOrder }
}
export function buildWorkflow({
  promptVariants,
  negativePrompt,
  checkpoint,
  loras,
  width,
  height,
  cfg,
  denoise,
  seed,
  inputImageName,
  controlNets,
}) {
  const family = detectCheckpointFamily(checkpoint)
  const samplerProfile = samplerProfiles[family] ?? samplerProfiles.sdxl
  const normalizedWidth = normalizeDimension(width, samplerProfile.width)
  const normalizedHeight = normalizeDimension(height, samplerProfile.height)
  const normalizedCfg = normalizeCfg(cfg, samplerProfile.cfg)
  const normalizedDenoise = normalizeDenoise(denoise, samplerProfile.img2imgDenoise)
  const normalizedSeed = normalizeSeed(seed)
  const workflowInput = {
    promptVariants,
    negativePrompt,
    checkpoint,
    loras,
    width: normalizedWidth,
    height: normalizedHeight,
    cfg: normalizedCfg,
    denoise: normalizedDenoise,
    seed: normalizedSeed,
    inputImageName,
    controlNets,
  }
  const workflow =
    family === 'anima' ? buildAnimaWorkflow(workflowInput) : buildSdxlWorkflow(workflowInput)
  return {
    ...workflow,
    family,
    width: normalizedWidth,
    height: normalizedHeight,
    cfg: normalizedCfg,
    denoise: normalizedDenoise,
    seed: normalizedSeed,
  }
}
