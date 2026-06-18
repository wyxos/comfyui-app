import { animaAssets, samplerProfiles } from './config.mjs'
import { safeTrim } from './shared.mjs'
import { detectCheckpointFamily, normalizeCheckpointFamilyToken } from './checkpoint-family.mjs'
import { normalizeCfg, normalizeDenoise, normalizeDimension, normalizeSeed, normalizeSteps } from './model-paths.mjs'
import {
  applyAnimaLLLiteSourcesToModel,
  createAnimaLLLiteSourceNodes,
} from './controlnet-workflow.mjs'
import {
  normalizeClipSkip,
  normalizeHiresReplay,
} from './workflow-replay.mjs'
import { buildFilenamePrefix, getGenerationOutputCategory } from './workflow-naming.mjs'
import { buildSdxlWorkflow } from './workflow-sdxl.mjs'
import {
  applyLorasToModelAndClip,
  buildPromptVariantLabel,
  buildPromptVariantNodeLabel,
  createNodeIdGenerator,
} from './workflow-common.mjs'
export {
  applyLorasToModelAndClip,
  buildPromptVariantLabel,
  buildPromptVariantNodeLabel,
  createNodeIdGenerator,
} from './workflow-common.mjs'
export { buildSdxlWorkflow } from './workflow-sdxl.mjs'
function normalizeWorkflowOption(value, fallback) {
  return safeTrim(value) || fallback
}
export function buildAnimaWorkflow({
  promptVariants,
  negativePrompt,
  checkpoint,
  loras = [],
  width,
  height,
  steps,
  cfg,
  denoise,
  seed,
  samplerName,
  scheduler,
  clipName,
  vaeName,
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
      clip_name: clipName,
      type: animaAssets.clipType,
    },
  }
  prompt[vaeLoaderNodeId] = {
    class_type: 'VAELoader',
    inputs: {
      vae_name: vaeName,
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
  const controlNetSources = createAnimaLLLiteSourceNodes({
    prompt,
    nodeLabels,
    nextNodeId,
    controlNets,
    width,
    height,
  })
  activeModelRef = applyAnimaLLLiteSourcesToModel({
    prompt,
    nodeLabels,
    nextNodeId,
    modelRef: activeModelRef,
    controlNetSources,
  })
  for (const variant of promptVariants) {
    const samplerNodeId = nextNodeId()
    const vaeDecodeNodeId = nextNodeId()
    const saveImageNodeId = nextNodeId()

    prompt[samplerNodeId] = {
      class_type: 'KSampler',
      inputs: {
        seed,
        steps,
        cfg,
        sampler_name: samplerName,
        scheduler,
        denoise: usingImageInput ? denoise : samplerProfile.txt2imgDenoise,
        model: activeModelRef,
        positive: [positiveNodeIds[variant.id], 0],
        negative: [negativeNodeId, 0],
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
          getGenerationOutputCategory(inputImageName),
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
  steps,
  cfg,
  denoise,
  seed,
  samplerName,
  scheduler,
  clipName,
  vaeName,
  clipSkip,
  hires,
  inputImageName,
  controlNets,
  checkpointFamily,
}) {
  const family = normalizeCheckpointFamilyToken(checkpointFamily) ?? detectCheckpointFamily(checkpoint)
  const samplerProfile = samplerProfiles[family] ?? samplerProfiles.sdxl
  const normalizedWidth = normalizeDimension(width, samplerProfile.width)
  const normalizedHeight = normalizeDimension(height, samplerProfile.height)
  const normalizedSteps = normalizeSteps(steps, samplerProfile.steps)
  const normalizedCfg = normalizeCfg(cfg, samplerProfile.cfg)
  const normalizedDenoise = normalizeDenoise(denoise, samplerProfile.img2imgDenoise)
  const normalizedSeed = normalizeSeed(seed)
  const normalizedSamplerName = normalizeWorkflowOption(samplerName, samplerProfile.samplerName)
  const normalizedScheduler = normalizeWorkflowOption(scheduler, samplerProfile.scheduler)
  const normalizedClipName = family === 'anima' ? normalizeWorkflowOption(clipName, animaAssets.clipName) : null
  const normalizedVaeName = family === 'anima'
    ? normalizeWorkflowOption(vaeName, animaAssets.vaeName)
    : safeTrim(vaeName) || null
  const normalizedClipSkip = family === 'sdxl' ? normalizeClipSkip(clipSkip) : null
  const normalizedHires = family === 'sdxl'
    ? normalizeHiresReplay(hires, {
        width: normalizedWidth,
        height: normalizedHeight,
        steps: normalizedSteps,
        cfg: normalizedCfg,
        samplerName: normalizedSamplerName,
        scheduler: normalizedScheduler,
      })
    : null
  const workflowInput = {
    promptVariants,
    negativePrompt,
    checkpoint,
    loras,
    width: normalizedWidth,
    height: normalizedHeight,
    steps: normalizedSteps,
    cfg: normalizedCfg,
    denoise: normalizedDenoise,
    seed: normalizedSeed,
    samplerName: normalizedSamplerName,
    scheduler: normalizedScheduler,
    clipName: normalizedClipName,
    vaeName: normalizedVaeName,
    clipSkip: normalizedClipSkip,
    hires: normalizedHires,
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
    steps: normalizedSteps,
    cfg: normalizedCfg,
    denoise: normalizedDenoise,
    seed: normalizedSeed,
    samplerName: normalizedSamplerName,
    scheduler: normalizedScheduler,
    clipName: normalizedClipName,
    vaeName: normalizedVaeName,
    clipSkip: normalizedClipSkip,
    hires: normalizedHires,
  }
}
