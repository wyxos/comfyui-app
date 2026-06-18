import { samplerProfiles } from './config.mjs'
import {
  applyControlNetSourcesToConditioning,
  createControlNetSourceNodes,
} from './controlnet-workflow.mjs'
import {
  applyLorasToModelAndClip,
  buildPromptVariantLabel,
  buildPromptVariantNodeLabel,
  createNodeIdGenerator,
} from './workflow-common.mjs'
import {
  createClipSkipNode,
  createHiresLatentSource,
  createVaeOverrideNode,
} from './workflow-replay.mjs'
import { buildFilenamePrefix, getGenerationOutputCategory } from './workflow-naming.mjs'

export function buildSdxlWorkflow({
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
  clipSkip,
  vaeName,
  hires,
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
  let activeVaeRef = [checkpointNodeId, 2]
  ;({ modelRef: activeModelRef, clipRef: activeClipRef } = applyLorasToModelAndClip({
    prompt,
    nodeLabels,
    nextNodeId,
    modelRef: activeModelRef,
    clipRef: activeClipRef,
    loras,
  }))
  activeClipRef = createClipSkipNode({
    prompt,
    nodeLabels,
    nextNodeId,
    clipRef: activeClipRef,
    clipSkip,
  })
  activeVaeRef = createVaeOverrideNode({
    prompt,
    nodeLabels,
    nextNodeId,
    vaeRef: activeVaeRef,
    vaeName,
  })
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
        vae: activeVaeRef,
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
        steps,
        cfg,
        sampler_name: samplerName,
        scheduler,
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
        vae: activeVaeRef,
      },
    }
    let saveImageRef = [vaeDecodeNodeId, 0]
    if (hires?.enabled) {
      const hiresLatentRef = createHiresLatentSource({
        prompt,
        nodeLabels,
        nextNodeId,
        imageRef: [vaeDecodeNodeId, 0],
        vaeRef: activeVaeRef,
        hires,
        variantLabel: buildPromptVariantLabel(variant).toLowerCase(),
      })
      const hiresSamplerNodeId = nextNodeId()
      const hiresDecodeNodeId = nextNodeId()
      prompt[hiresSamplerNodeId] = {
        class_type: 'KSampler',
        inputs: {
          seed,
          steps: hires.steps,
          cfg: hires.cfg,
          sampler_name: hires.samplerName,
          scheduler: hires.scheduler,
          denoise: hires.denoise,
          model: activeModelRef,
          positive: conditioningRefs.positiveRef,
          negative: conditioningRefs.negativeRef,
          latent_image: hiresLatentRef,
        },
      }
      prompt[hiresDecodeNodeId] = {
        class_type: 'VAEDecode',
        inputs: {
          samples: [hiresSamplerNodeId, 0],
          vae: activeVaeRef,
        },
      }
      nodeLabels[hiresSamplerNodeId] = buildPromptVariantNodeLabel('Hires sampling', variant)
      nodeLabels[hiresDecodeNodeId] = buildPromptVariantNodeLabel('Hires decoding', variant)
      saveImageRef = [hiresDecodeNodeId, 0]
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
        images: saveImageRef,
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
