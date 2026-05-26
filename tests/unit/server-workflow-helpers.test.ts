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
})
