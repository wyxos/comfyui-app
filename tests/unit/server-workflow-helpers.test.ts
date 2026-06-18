import { describe, expect, it } from 'vitest'

import {
  buildRequestedPromptVariants,
  buildWorkflow,
} from '../../server/index.mjs'
import { workflowEntries, workflowNodes } from './workflowTestUtils'

describe('server workflow helpers', () => {
  it('builds SDXL and Anima workflows with normalized controls', () => {
    const promptVariants = buildRequestedPromptVariants('a portrait', '')
    const sdxl = buildWorkflow({
      promptVariants,
      negativePrompt: 'blur',
      checkpoint: 'ponyXL.safetensors',
      loras: [{ name: 'detail.safetensors', strength: 0.7 }],
      width: 1000,
      height: 1000,
      steps: 34,
      cfg: 5.555,
      denoise: 0.8,
      seed: 42,
      inputImageName: '',
      controlNets: [
        {
          model: 'mistoLine_rank256.safetensors',
          inputImageName: 'control.png',
          preprocessor: 'lineart',
          lineartPolarity: 'black-lines',
          previewResolution: 768,
          strength: 0.8,
          startPercent: 0.1,
          endPercent: 0.9,
        },
      ],
    })

    expect(sdxl.family).toBe('sdxl')
    expect(sdxl.width).toBe(992)
    expect(sdxl.steps).toBe(34)
    expect(sdxl.cfg).toBe(5.56)
    expect(workflowNodes(sdxl.prompt).some((node) => node.class_type === 'LoraLoader')).toBe(true)
    expect(workflowNodes(sdxl.prompt).some((node) => node.class_type === 'ControlNetLoader')).toBe(true)
    expect(workflowNodes(sdxl.prompt).some((node) => node.class_type === 'ControlNetApplyAdvanced')).toBe(true)
    const sdxlPromptEntries = workflowEntries(sdxl.prompt)
    const lineArtNode = sdxlPromptEntries.find(([, node]) => node.class_type === 'LineArtPreprocessor')
    const invertNode = sdxlPromptEntries.find(([, node]) => node.class_type === 'ImageInvert')
    const scaledControlImage = sdxlPromptEntries.find(([, node]) => {
      return node.class_type === 'ImageScale' && node.inputs?.image?.[0] === invertNode?.[0]
    })
    const controlNetApplyNode = sdxlPromptEntries.find(([, node]) => node.class_type === 'ControlNetApplyAdvanced')
    const sdxlSamplerNode = sdxlPromptEntries.find(([, node]) => node.class_type === 'KSampler')
    const sdxlSaveImageNode = sdxlPromptEntries.find(([, node]) => node.class_type === 'SaveImage')
    expect(lineArtNode?.[1].inputs).toMatchObject({ resolution: 768 })
    expect(invertNode?.[1].inputs.image).toEqual([lineArtNode?.[0], 0])
    expect(controlNetApplyNode?.[1].inputs.image).toEqual([scaledControlImage?.[0], 0])
    expect(sdxlSamplerNode?.[1].inputs.steps).toBe(34)
    expect(sdxlSaveImageNode?.[1].inputs.filename_prefix).toBe('%year%-%month%-%day%/txt2img/ponyxl')
    expect(sdxl.outputNodeOrder).toHaveLength(1)

    const anima = buildWorkflow({
      promptVariants,
      negativePrompt: '',
      checkpoint: 'animaPencilXL.safetensors',
      loras: [],
      width: 1024,
      height: 1024,
      steps: 48,
      cfg: 4,
      denoise: 0.75,
      seed: 1,
      inputImageName: 'input.png',
    })

    expect(anima.family).toBe('anima')
    expect(anima.steps).toBe(48)
    const animaNodes = workflowNodes(anima.prompt)
    expect(animaNodes.some((node) => node.class_type === 'CLIPLoader')).toBe(true)
    expect(animaNodes.some((node) => node.class_type === 'LoadImage')).toBe(true)
    expect(animaNodes.find((node) => node.class_type === 'KSampler')?.inputs?.steps).toBe(48)
    expect(
      animaNodes.find((node) => node.class_type === 'SaveImage')?.inputs
        .filename_prefix,
    ).toBe('%year%-%month%-%day%/img2img/animapencilxl')
  })

  it('builds SDXL replay graphs with CLIP skip, VAE override, and hires pass', () => {
    const sdxl = buildWorkflow({
      promptVariants: buildRequestedPromptVariants('a portrait', ''),
      negativePrompt: 'blur',
      checkpoint: 'waiIllustriousSDXL_v170.safetensors',
      checkpointFamily: 'sdxl',
      loras: [],
      width: 1024,
      height: 1344,
      steps: 30,
      cfg: 7,
      denoise: 0.5,
      seed: 424011486,
      samplerName: 'euler_ancestral',
      scheduler: 'normal',
      clipSkip: 2,
      vaeName: 'sdxl_vae.safetensors',
      hires: {
        enabled: true,
        upscale: 2,
        width: 2048,
        height: 2688,
        steps: 20,
        cfg: 4.5,
        denoise: 0.5,
        upscaler: 'RealESRGAN_x4plus_anime_6B.pth',
        samplerName: 'euler_ancestral',
        scheduler: 'normal',
      },
      inputImageName: '',
    })

    const entries = workflowEntries(sdxl.prompt)
    const clipSkipNode = entries.find(([, node]) => node.class_type === 'CLIPSetLastLayer')
    const vaeNode = entries.find(([, node]) => node.class_type === 'VAELoader')
    const upscaleModelNode = entries.find(([, node]) => node.class_type === 'UpscaleModelLoader')
    const imageUpscaleNode = entries.find(([, node]) => node.class_type === 'ImageUpscaleWithModel')
    const hiresScaleNode = entries.find(([, node]) =>
      node.class_type === 'ImageScale' && node.inputs?.image?.[0] === imageUpscaleNode?.[0],
    )
    const hiresEncodeNode = entries.find(([, node]) =>
      node.class_type === 'VAEEncode' && node.inputs?.pixels?.[0] === hiresScaleNode?.[0],
    )
    const samplerNodes = entries.filter(([, node]) => node.class_type === 'KSampler')
    const [baseSampler, hiresSampler] = samplerNodes
    const hiresDecodeNode = entries.find(([, node]) =>
      node.class_type === 'VAEDecode' && node.inputs?.samples?.[0] === hiresSampler?.[0],
    )
    const saveNode = entries.find(([, node]) => node.class_type === 'SaveImage')

    expect(sdxl.clipSkip).toBe(2)
    expect(sdxl.vaeName).toBe('sdxl_vae.safetensors')
    expect(sdxl.hires).toMatchObject({
      width: 2048,
      height: 2688,
      steps: 20,
      cfg: 4.5,
      denoise: 0.5,
      upscaler: 'RealESRGAN_x4plus_anime_6B.pth',
    })
    expect(clipSkipNode?.[1].inputs).toMatchObject({ stop_at_clip_layer: -2 })
    expect(vaeNode?.[1].inputs.vae_name).toBe('sdxl_vae.safetensors')
    expect(upscaleModelNode?.[1].inputs.model_name).toBe('RealESRGAN_x4plus_anime_6B.pth')
    expect(imageUpscaleNode?.[1].inputs.upscale_model).toEqual([upscaleModelNode?.[0], 0])
    expect(hiresScaleNode?.[1].inputs).toMatchObject({ width: 2048, height: 2688, crop: 'disabled' })
    expect(baseSampler?.[1].inputs).toMatchObject({
      steps: 30,
      cfg: 7,
      sampler_name: 'euler_ancestral',
      scheduler: 'normal',
      denoise: 1,
    })
    expect(hiresSampler?.[1].inputs).toMatchObject({
      steps: 20,
      cfg: 4.5,
      sampler_name: 'euler_ancestral',
      scheduler: 'normal',
      denoise: 0.5,
      latent_image: [hiresEncodeNode?.[0], 0],
    })
    expect(saveNode?.[1].inputs.images).toEqual([hiresDecodeNode?.[0], 0])
  })

  it('routes Anima control images through the LLLite model patch node', () => {
    const promptVariants = buildRequestedPromptVariants('a portrait', '')
    const anima = buildWorkflow({
      promptVariants,
      negativePrompt: '',
      checkpoint: 'animaPencilXL.safetensors',
      loras: [],
      width: 1024,
      height: 1024,
      cfg: 4,
      denoise: 0.75,
      seed: 1,
      inputImageName: '',
      controlNets: [
        {
          model: 'anima-lllite-lineart-1.safetensors',
          inputImageName: 'control.png',
          preprocessor: 'lineart',
          lineartPolarity: 'black-lines',
          previewResolution: 768,
          strength: 0.8,
          startPercent: 0.1,
          endPercent: 0.9,
        },
      ],
    })

    const entries = workflowEntries(anima.prompt)
    const llliteNode = entries.find(([, node]) => node.class_type === 'AnimaLLLiteApply')
    const samplerNode = entries.find(([, node]) => node.class_type === 'KSampler')

    expect(llliteNode?.[1].inputs).toMatchObject({
      lllite_name: 'anima-lllite-lineart-1.safetensors',
      strength: 0.8,
      start_percent: 0.1,
      end_percent: 0.9,
    })
    expect(samplerNode?.[1].inputs.model).toEqual([llliteNode?.[0], 0])
    expect(entries.some(([, node]) => node.class_type === 'ControlNetLoader')).toBe(false)
    expect(entries.some(([, node]) => node.class_type === 'ControlNetApplyAdvanced')).toBe(false)
  })

  it('uses requested sampler, scheduler, and Anima asset overrides', () => {
    const anima = buildWorkflow({
      promptVariants: buildRequestedPromptVariants('a portrait', ''),
      negativePrompt: '',
      checkpoint: 'animaPencilXL.safetensors',
      checkpointFamily: 'anima',
      loras: [],
      width: 1024,
      height: 1024,
      steps: 22,
      cfg: 4.5,
      denoise: 0.7,
      seed: 12,
      inputImageName: '',
      samplerName: 'dpmpp_2m',
      scheduler: 'karras',
      clipName: 'custom-clip.safetensors',
      vaeName: 'custom-vae.safetensors',
    })

    const entries = workflowEntries(anima.prompt)
    const samplerNode = entries.find(([, node]) => node.class_type === 'KSampler')
    const clipNode = entries.find(([, node]) => node.class_type === 'CLIPLoader')
    const vaeNode = entries.find(([, node]) => node.class_type === 'VAELoader')

    expect(anima.samplerName).toBe('dpmpp_2m')
    expect(anima.scheduler).toBe('karras')
    expect(anima.clipName).toBe('custom-clip.safetensors')
    expect(anima.vaeName).toBe('custom-vae.safetensors')
    expect(samplerNode?.[1].inputs).toMatchObject({
      sampler_name: 'dpmpp_2m',
      scheduler: 'karras',
    })
    expect(clipNode?.[1].inputs.clip_name).toBe('custom-clip.safetensors')
    expect(vaeNode?.[1].inputs.vae_name).toBe('custom-vae.safetensors')
  })
})
