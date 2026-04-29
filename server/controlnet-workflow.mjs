import { safeTrim } from './shared.mjs'
import { getControlNetPreprocessorProfile, normalizeControlNetPreviewResolution } from './controlnet-options.mjs'

function stripModelExtension(value) {
  return safeTrim(value).replace(/\.[^.]+$/, '')
}

function buildControlNetLabel(controlNet, index) {
  return stripModelExtension(controlNet.model) || `ControlNet ${index + 1}`
}

function buildControlNetImageRef({
  prompt,
  nodeLabels,
  nextNodeId,
  controlNet,
  imageRef,
  width,
  height,
  label,
}) {
  const profile = getControlNetPreprocessorProfile(controlNet.preprocessor)
  let activeImageRef = imageRef

  if (profile?.nodeType) {
    const preprocessorNodeId = nextNodeId()
    prompt[preprocessorNodeId] = {
      class_type: profile.nodeType,
      inputs: {
        image: imageRef,
        ...profile.inputs,
        resolution: normalizeControlNetPreviewResolution(
          controlNet.previewResolution,
          profile.defaultResolution,
        ),
      },
    }
    nodeLabels[preprocessorNodeId] = `Preprocessing ${label}`
    activeImageRef = [preprocessorNodeId, 0]
  }

  const imageScaleNodeId = nextNodeId()
  prompt[imageScaleNodeId] = {
    class_type: 'ImageScale',
    inputs: {
      image: activeImageRef,
      upscale_method: 'lanczos',
      width,
      height,
      crop: 'center',
    },
  }
  nodeLabels[imageScaleNodeId] = `Resizing ${label} image`
  return [imageScaleNodeId, 0]
}

export function createControlNetSourceNodes({
  prompt,
  nodeLabels,
  nextNodeId,
  controlNets,
  width,
  height,
}) {
  return (Array.isArray(controlNets) ? controlNets : [])
    .filter((controlNet) => controlNet?.model && controlNet?.inputImageName)
    .map((controlNet, index) => {
      const label = buildControlNetLabel(controlNet, index)
      const loaderNodeId = nextNodeId()
      const imageNodeId = nextNodeId()

      prompt[loaderNodeId] = {
        class_type: 'ControlNetLoader',
        inputs: {
          control_net_name: controlNet.model,
        },
      }
      prompt[imageNodeId] = {
        class_type: 'LoadImage',
        inputs: {
          image: controlNet.inputImageName,
        },
      }

      nodeLabels[loaderNodeId] = `Loading ${label}`
      nodeLabels[imageNodeId] = `Loading ${label} image`

      return {
        ...controlNet,
        label,
        controlNetRef: [loaderNodeId, 0],
        imageRef: buildControlNetImageRef({
          prompt,
          nodeLabels,
          nextNodeId,
          controlNet,
          imageRef: [imageNodeId, 0],
          width,
          height,
          label,
        }),
      }
    })
}

export function applyControlNetSourcesToConditioning({
  prompt,
  nodeLabels,
  nextNodeId,
  positiveRef,
  negativeRef,
  controlNetSources,
  variantLabel,
}) {
  let activePositiveRef = positiveRef
  let activeNegativeRef = negativeRef

  for (const controlNet of controlNetSources) {
    const applyNodeId = nextNodeId()
    prompt[applyNodeId] = {
      class_type: 'ControlNetApplyAdvanced',
      inputs: {
        positive: activePositiveRef,
        negative: activeNegativeRef,
        control_net: controlNet.controlNetRef,
        image: controlNet.imageRef,
        strength: controlNet.strength,
        start_percent: controlNet.startPercent,
        end_percent: controlNet.endPercent,
      },
    }
    nodeLabels[applyNodeId] = `Applying ${controlNet.label} to ${variantLabel}`
    activePositiveRef = [applyNodeId, 0]
    activeNegativeRef = [applyNodeId, 1]
  }

  return {
    positiveRef: activePositiveRef,
    negativeRef: activeNegativeRef,
  }
}
