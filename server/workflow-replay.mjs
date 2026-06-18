import { clamp, parseFloatValue, parseInteger } from './civitai-query.mjs'
import { normalizeCfg, normalizeDenoise, normalizeDimension, normalizeSteps } from './model-paths.mjs'
import { safeTrim } from './shared.mjs'

function normalizeUpscale(value, fallback = 2) {
  const parsed = parseFloatValue(value)
  if (parsed === null) {
    return fallback
  }

  return Math.round(clamp(parsed, 1, 8) * 100) / 100
}

export function normalizeClipSkip(value) {
  const parsed = parseInteger(value)
  return parsed !== null && parsed > 1 ? clamp(parsed, 2, 12) : null
}

export function normalizeHiresReplay(value, fallback) {
  if (!value?.enabled) {
    return null
  }

  const upscale = normalizeUpscale(value.upscale, 2)
  const scaledWidth = Math.round(fallback.width * upscale)
  const scaledHeight = Math.round(fallback.height * upscale)
  const width = normalizeDimension(value.width, scaledWidth)
  const height = normalizeDimension(value.height, scaledHeight)
  const steps = normalizeSteps(value.steps, fallback.steps)
  const cfg = normalizeCfg(value.cfg, fallback.cfg)
  const denoise = normalizeDenoise(value.denoise, 0.5)

  return {
    enabled: true,
    upscale,
    width,
    height,
    steps,
    cfg,
    denoise,
    upscaler: safeTrim(value.upscaler) || null,
    samplerName: safeTrim(value.samplerName) || fallback.samplerName,
    scheduler: safeTrim(value.scheduler) || fallback.scheduler,
  }
}

export function createClipSkipNode({ prompt, nodeLabels, nextNodeId, clipRef, clipSkip }) {
  if (!clipSkip) {
    return clipRef
  }

  const clipSkipNodeId = nextNodeId()
  prompt[clipSkipNodeId] = {
    class_type: 'CLIPSetLastLayer',
    inputs: {
      clip: clipRef,
      stop_at_clip_layer: -clipSkip,
    },
  }
  nodeLabels[clipSkipNodeId] = 'Applying CLIP skip'
  return [clipSkipNodeId, 0]
}

export function createVaeOverrideNode({ prompt, nodeLabels, nextNodeId, vaeRef, vaeName }) {
  const normalizedVaeName = safeTrim(vaeName)
  if (!normalizedVaeName) {
    return vaeRef
  }

  const vaeLoaderNodeId = nextNodeId()
  prompt[vaeLoaderNodeId] = {
    class_type: 'VAELoader',
    inputs: {
      vae_name: normalizedVaeName,
    },
  }
  nodeLabels[vaeLoaderNodeId] = 'Loading VAE'
  return [vaeLoaderNodeId, 0]
}

export function createHiresLatentSource({
  prompt,
  nodeLabels,
  nextNodeId,
  imageRef,
  vaeRef,
  hires,
  variantLabel,
}) {
  let imageSourceRef = imageRef

  if (hires.upscaler) {
    const upscaleModelNodeId = nextNodeId()
    const upscaleNodeId = nextNodeId()
    prompt[upscaleModelNodeId] = {
      class_type: 'UpscaleModelLoader',
      inputs: {
        model_name: hires.upscaler,
      },
    }
    prompt[upscaleNodeId] = {
      class_type: 'ImageUpscaleWithModel',
      inputs: {
        upscale_model: [upscaleModelNodeId, 0],
        image: imageSourceRef,
      },
    }
    nodeLabels[upscaleModelNodeId] = 'Loading hires upscaler'
    nodeLabels[upscaleNodeId] = `Upscaling ${variantLabel}`
    imageSourceRef = [upscaleNodeId, 0]
  }

  const scaleNodeId = nextNodeId()
  const vaeEncodeNodeId = nextNodeId()
  prompt[scaleNodeId] = {
    class_type: 'ImageScale',
    inputs: {
      image: imageSourceRef,
      upscale_method: 'lanczos',
      width: hires.width,
      height: hires.height,
      crop: 'disabled',
    },
  }
  prompt[vaeEncodeNodeId] = {
    class_type: 'VAEEncode',
    inputs: {
      pixels: [scaleNodeId, 0],
      vae: vaeRef,
    },
  }
  nodeLabels[scaleNodeId] = `Resizing ${variantLabel}`
  nodeLabels[vaeEncodeNodeId] = `Encoding hires ${variantLabel}`
  return [vaeEncodeNodeId, 0]
}
