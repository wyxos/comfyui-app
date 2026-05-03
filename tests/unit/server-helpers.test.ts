import type { AddressInfo } from 'node:net'
import { describe, expect, it, vi } from 'vitest'

import {
  buildCivitaiImagesQueryParams,
  buildCivitaiKeyPreview,
  buildControlNetPreviewWorkflow,
  buildCivitaiModelsQueryParams,
  buildQueueSummaryForPromptIds,
  buildRequestedPromptVariants,
  buildWorkflow,
  classifyControlNetCompatibility,
  classifyLoraCompatibility,
  createCompanionServer,
  createDownloadsResponse,
  extractInputImageNameFromHistory,
  extractRequestedCheckpoints,
  extractRequestedCheckpointJobs,
  extractRequestedControlNets,
  extractRequestedLoras,
  fetchCivitaiVersionMetadata,
  normalizeBaseModelKey,
  getQueueSnapshot,
  mergeJobOutputs,
  normalizeCfg,
  normalizeDenoise,
  normalizeDimension,
  normalizeImprovedPromptText,
  normalizeModelCompatibilityMetadata,
  normalizeQueueEntries,
  normalizeSeed,
  sanitizeFilename,
  sanitizeSubfolder,
  serializeCivitaiSettings,
  serializeDownload,
} from '../../server/index.mjs'

describe('server helper exports', () => {
  it('sanitizes Civitai query parameters', () => {
    const modelParams = buildCivitaiModelsQueryParams(
      new URLSearchParams([
        ['query', 'pony'],
        ['limit', '999'],
        ['nsfw', 'yes'],
        ['modelId', '42'],
        ['modelVersionId', '9001'],
        ['ids', '1,bad'],
        ['ignored', 'value'],
      ]),
    )

    expect(modelParams.toString()).toBe('query=pony&limit=100&nsfw=true&modelId=42&modelVersionId=9001')

    const imageParams = buildCivitaiImagesQueryParams(
      new URLSearchParams([
        ['modelId', '-20'],
        ['page', '2'],
        ['nsfw', 'off'],
        ['query', 'ignored'],
      ]),
    )

    expect(imageParams.toString()).toBe('modelId=1&page=2&nsfw=false')
  })

  it('normalizes generation inputs and prompt variants', () => {
    expect(normalizeDimension('1025', 512)).toBe(1024)
    expect(normalizeDimension('16', 512)).toBe(64)
    expect(normalizeCfg('35.125', 5)).toBe(30)
    expect(normalizeDenoise('0.754', 0.5)).toBe(0.75)
    expect(normalizeSeed(9999999999)).toBe(2147483647)

    expect(normalizeImprovedPromptText('```text\nImproved prompt: sharp detail\n```')).toBe('sharp detail')

    expect(buildRequestedPromptVariants(' original ', ' improved ')).toEqual([
      {
        id: 'original',
        label: 'Original prompt',
        promptText: 'original',
        isImproved: false,
      },
      {
        id: 'improved',
        label: 'Improved prompt',
        promptText: 'improved',
        isImproved: true,
      },
    ])
  })

  it('sanitizes filenames and subfolders', () => {
    expect(sanitizeFilename(' output.png ')).toBe('output.png')
    expect(sanitizeFilename('../output.png')).toBeNull()
    expect(sanitizeFilename('nested/output.png')).toBeNull()

    expect(sanitizeSubfolder('session/one')).toBe('session/one')
    expect(sanitizeSubfolder('session\\one')).toBe('session/one')
    expect(sanitizeSubfolder('session//one')).toBe('session/one')
    expect(sanitizeSubfolder('../escape')).toBeNull()
    expect(sanitizeSubfolder('/absolute')).toBeNull()
    expect(sanitizeSubfolder('C:\\absolute')).toBeNull()
  })

  it('extracts requested checkpoints and LoRAs with de-duplication', () => {
    expect(
      extractRequestedCheckpoints({
        checkpoints: [{ name: 'a.safetensors' }, { name: 'a.safetensors' }, { name: 'b.safetensors' }],
      }),
    ).toEqual(['a.safetensors', 'b.safetensors'])

    expect(
      extractRequestedLoras(
        {
          loras: [
            { name: 'detail.safetensors', strength: '0.7' },
            { name: 'detail.safetensors', strength: 1 },
            { name: 'style.safetensors' },
          ],
        },
        0.5,
      ),
    ).toEqual([
      { name: 'detail.safetensors', strength: 0.7 },
      { name: 'style.safetensors', strength: 0.5 },
    ])

    expect(
      extractRequestedCheckpointJobs({
        checkpoints: [
          {
            name: 'pony.safetensors',
            loras: [
              {
                name: 'detail.safetensors',
                strength: '0.7',
                triggerWords: [{ word: 'detail boost', weight: '1.2' }],
              },
            ],
          },
          {
            name: 'anima.safetensors',
            loras: [{ name: 'line.safetensors', triggerWords: ['anima sketch'] }],
          },
        ],
      }),
    ).toEqual([
      {
        name: 'pony.safetensors',
        loras: [
          {
            name: 'detail.safetensors',
            strength: 0.7,
            triggerWords: [{ word: 'detail boost', weight: 1.2 }],
          },
        ],
      },
      {
        name: 'anima.safetensors',
        loras: [
          {
            name: 'line.safetensors',
            strength: 1,
            triggerWords: [{ word: 'anima sketch', weight: 1 }],
          },
        ],
      },
    ])

    expect(
      extractRequestedCheckpointJobs({
        checkpoints: [
          {
            name: 'pony.safetensors',
            controlNets: [
              {
                model: 'pony-canny.safetensors',
                inputImageName: 'control.png',
                preprocessor: 'canny',
              },
            ],
          },
        ],
      }),
    ).toEqual([
      {
        name: 'pony.safetensors',
        loras: [],
        controlNets: [
          {
            model: 'pony-canny.safetensors',
            inputImageName: 'control.png',
            preprocessor: 'canny',
          },
        ],
      },
    ])

    expect(
      extractRequestedControlNets({
        controlNets: [
          {
            id: 'cn-1',
            model: 'mistoLine_rank256.safetensors',
            inputImageName: 'control.png',
            preprocessor: 'lineart',
            lineartPolarity: 'black-lines',
            previewResolution: '640',
            strength: '1.25',
            startPercent: '-1',
            endPercent: '0.75',
          },
          { enabled: false, model: 'ignored.safetensors' },
        ],
      }),
    ).toEqual([
      {
        id: 'cn-1',
        model: 'mistoLine_rank256.safetensors',
        inputImageName: 'control.png',
        preprocessor: 'lineart',
        lineartPolarity: 'black-lines',
        previewResolution: 640,
        strength: 1.25,
        startPercent: 0,
        endPercent: 0.75,
      },
    ])
  })

  it('builds ControlNet preprocessor preview workflows', () => {
    const workflow = buildControlNetPreviewWorkflow({
      inputImageName: 'source.png',
      preprocessor: 'canny',
      resolution: 768,
    })
    const nodes = Object.values(workflow.prompt) as any[]

    expect(workflow.preprocessor).toBe('canny')
    expect(workflow.resolution).toBe(768)
    expect(nodes.some((node) => node.class_type === 'LoadImage')).toBe(true)
    expect(nodes.some((node) => node.class_type === 'CannyEdgePreprocessor')).toBe(true)
    expect(nodes.some((node) => node.class_type === 'SaveImage')).toBe(true)

    const invertedLineartWorkflow = buildControlNetPreviewWorkflow({
      inputImageName: 'source.png',
      preprocessor: 'lineart',
      resolution: 768,
    })
    const invertedNodes = Object.values(invertedLineartWorkflow.prompt) as any[]
    expect(invertedLineartWorkflow.lineartPolarity).toBe('black-lines')
    expect(invertedNodes.some((node) => node.class_type === 'LineArtPreprocessor')).toBe(true)
    expect(invertedNodes.some((node) => node.class_type === 'ImageInvert')).toBe(true)

    const whiteLineartWorkflow = buildControlNetPreviewWorkflow({
      inputImageName: 'source.png',
      preprocessor: 'lineart',
      lineartPolarity: 'white-lines',
      resolution: 768,
    })
    const whiteNodes = Object.values(whiteLineartWorkflow.prompt) as any[]
    expect(whiteLineartWorkflow.lineartPolarity).toBe('white-lines')
    expect(whiteNodes.some((node) => node.class_type === 'ImageInvert')).toBe(false)
  })

  it('normalizes Civitai metadata and classifies LoRA compatibility', () => {
    const checkpoint = normalizeModelCompatibilityMetadata(
      { modelId: 1, versionId: 2, modelType: 'Checkpoint', modelNsfw: false, baseModel: 'Pony' },
      { modelType: 'Checkpoint', source: 'sidecar' },
    )
    const compatibleLora = normalizeModelCompatibilityMetadata(
      { modelId: 3, versionId: 4, modelType: 'LORA', baseModel: 'pony', trainedWords: ['detail boost'] },
      { modelType: 'LORA', source: 'sidecar' },
    )
    const incompatibleLora = normalizeModelCompatibilityMetadata(
      { modelType: 'LORA', baseModel: 'Anima' },
      { modelType: 'LORA', source: 'sidecar' },
    )
    const sameArchitectureLora = normalizeModelCompatibilityMetadata(
      { modelType: 'LORA', baseModel: 'Illustrious' },
      { modelType: 'LORA', source: 'sidecar' },
    )
    const unverifiedLora = normalizeModelCompatibilityMetadata(null, {
      modelType: 'LORA',
      status: 'missing',
    })
    const ponyControlNet = normalizeModelCompatibilityMetadata(
      {
        modelType: 'ControlNet',
        compatibleBaseModels: ['Pony', 'Illustrious'],
        controlType: 'canny',
        loaderType: 'controlnet',
      },
      { modelType: 'ControlNet', source: 'manual' },
    )
    const animaControlNet = normalizeModelCompatibilityMetadata(
      { modelType: 'ControlNet', compatibleBaseModels: ['Anima'] },
      { modelType: 'ControlNet', source: 'manual' },
    )
    const sdxlControlNet = normalizeModelCompatibilityMetadata(
      { modelType: 'ControlNet', compatibleBaseModels: ['SDXL'] },
      { modelType: 'ControlNet', source: 'manual' },
    )
    const illustriousCheckpoint = normalizeModelCompatibilityMetadata(
      { modelType: 'Checkpoint', baseModel: 'Illustrious' },
      { modelType: 'Checkpoint', source: 'sidecar' },
    )

    expect(normalizeBaseModelKey('SDXL 1.0')).toBe('sdxl')
    expect(checkpoint.modelNsfw).toBe(false)
    expect(compatibleLora.trainedWords).toEqual(['detail boost'])
    expect(classifyLoraCompatibility(checkpoint, compatibleLora)).toBe('compatible')
    expect(classifyLoraCompatibility(checkpoint, sameArchitectureLora)).toBe('warning')
    expect(classifyLoraCompatibility(checkpoint, incompatibleLora)).toBe('incompatible')
    expect(classifyLoraCompatibility(checkpoint, unverifiedLora)).toBe('unverified')
    expect(ponyControlNet.compatibleBaseModelKeys).toEqual(['pony', 'illustrious'])
    expect(ponyControlNet.controlType).toBe('canny')
    expect(classifyControlNetCompatibility(checkpoint, ponyControlNet)).toBe('compatible')
    expect(classifyControlNetCompatibility(illustriousCheckpoint, sdxlControlNet, 'sdxl')).toBe('compatible')
    expect(classifyControlNetCompatibility(checkpoint, animaControlNet)).toBe('incompatible')
  })

  it('normalizes Civitai model payloads with nested versions', () => {
    const darkAura = normalizeModelCompatibilityMetadata(
      {
        id: 433097,
        name: 'Dark Aura for Pony',
        type: 'LORA',
        modelVersions: [
          {
            id: 1109669,
            name: 'Illustrious',
            baseModel: 'Illustrious',
            trainedWords: ['dark aura'],
            files: [
              {
                hashes: {
                  SHA256: '96D811C4383E4FE1D8BCA611C1C2D6D3763EF4674E37679B16EF7090B87FF616',
                },
              },
            ],
          },
        ],
      },
      { modelType: 'LORA', source: 'sidecar' },
    )

    expect(darkAura).toMatchObject({
      modelId: 433097,
      versionId: 1109669,
      modelName: 'Dark Aura for Pony',
      versionName: 'Illustrious',
      modelType: 'LORA',
      baseModel: 'Illustrious',
      baseModelKey: 'illustrious',
      trainedWords: ['dark aura'],
      hashes: {
        SHA256: '96D811C4383E4FE1D8BCA611C1C2D6D3763EF4674E37679B16EF7090B87FF616',
      },
    })
  })

  it('fetches Civitai metadata by version id and file hash', async () => {
    const fetchById = vi.fn(async () =>
      new Response(
        JSON.stringify({
          id: 201,
          name: 'v1',
          baseModel: 'Pony',
          trainedWords: ['detail boost'],
          model: { id: 101, name: 'Detail LoRA', type: 'LORA', nsfw: true },
          files: [{ id: 301, name: 'detail.safetensors', primary: true, hashes: { SHA256: 'abc' } }],
        }),
        { status: 200 },
      ),
    )

    await expect(fetchCivitaiVersionMetadata({ versionId: 201, fetchImpl: fetchById as any })).resolves.toMatchObject({
      modelId: 101,
      versionId: 201,
      modelNsfw: true,
      model: expect.objectContaining({ nsfw: true }),
      baseModel: 'Pony',
      trainedWords: ['detail boost'],
      hashes: { SHA256: 'abc' },
    })
    expect(fetchById).toHaveBeenCalledWith('https://civitai.com/api/v1/model-versions/201')

    const fetchByHash = vi.fn(async () =>
      new Response(
        JSON.stringify({
          id: 202,
          baseModel: 'Anima',
          model: { id: 102, name: 'Line LoRA', type: 'LORA' },
          files: [{ name: 'line.safetensors', primary: true, hashes: { SHA256: 'def' } }],
        }),
        { status: 200 },
      ),
    )

    await expect(
      fetchCivitaiVersionMetadata({ hashes: { SHA256: 'def' }, fetchImpl: fetchByHash as any }),
    ).resolves.toMatchObject({
      modelId: 102,
      versionId: 202,
      baseModel: 'Anima',
    })
    expect(fetchByHash).toHaveBeenCalledWith('https://civitai.com/api/v1/model-versions/by-hash/def')
  })

  it('builds SDXL and Anima workflows with normalized controls', () => {
    const promptVariants = buildRequestedPromptVariants('a portrait', '')
    const sdxl = buildWorkflow({
      promptVariants,
      negativePrompt: 'blur',
      checkpoint: 'ponyXL.safetensors',
      loras: [{ name: 'detail.safetensors', strength: 0.7 }],
      width: 1000,
      height: 1000,
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
    expect(sdxl.cfg).toBe(5.56)
    expect(Object.values(sdxl.prompt).some((node: any) => node.class_type === 'LoraLoader')).toBe(true)
    expect(Object.values(sdxl.prompt).some((node: any) => node.class_type === 'ControlNetLoader')).toBe(true)
    expect(Object.values(sdxl.prompt).some((node: any) => node.class_type === 'ControlNetApplyAdvanced')).toBe(true)
    const sdxlPromptEntries = Object.entries(sdxl.prompt) as [string, any][]
    const lineArtNode = sdxlPromptEntries.find(([, node]) => node.class_type === 'LineArtPreprocessor')
    const invertNode = sdxlPromptEntries.find(([, node]) => node.class_type === 'ImageInvert')
    const scaledControlImage = sdxlPromptEntries.find(([, node]) => {
      return node.class_type === 'ImageScale' && node.inputs?.image?.[0] === invertNode?.[0]
    })
    const controlNetApplyNode = sdxlPromptEntries.find(([, node]) => node.class_type === 'ControlNetApplyAdvanced')
    const sdxlSaveImageNode = sdxlPromptEntries.find(([, node]) => node.class_type === 'SaveImage')
    expect(lineArtNode?.[1].inputs).toMatchObject({ resolution: 768 })
    expect(invertNode?.[1].inputs.image).toEqual([lineArtNode?.[0], 0])
    expect(controlNetApplyNode?.[1].inputs.image).toEqual([scaledControlImage?.[0], 0])
    expect(sdxlSaveImageNode?.[1].inputs.filename_prefix).toBe('%year%-%month%-%day%/txt2img/ponyxl')
    expect(sdxl.outputNodeOrder).toHaveLength(1)

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
      inputImageName: 'input.png',
    })

    expect(anima.family).toBe('anima')
    expect(Object.values(anima.prompt).some((node: any) => node.class_type === 'CLIPLoader')).toBe(true)
    expect(Object.values(anima.prompt).some((node: any) => node.class_type === 'LoadImage')).toBe(true)
    expect(
      (Object.values(anima.prompt).find((node: any) => node.class_type === 'SaveImage') as any)?.inputs
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

    const entries = Object.entries(anima.prompt) as [string, any][]
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

  it('serializes downloads without abort controllers and summarizes counts', () => {
    const serialized = serializeDownload({
      id: 'download-1',
      state: 'complete',
      abortController: new AbortController(),
      previewImage: {
        id: 1,
        url: ' https://example.test/preview.png ',
        hash: ' abc ',
      },
      updatedAt: 10,
    })

    expect(serialized).not.toHaveProperty('abortController')
    expect(serialized.previewImage).toMatchObject({
      id: 1,
      url: 'https://example.test/preview.png',
      hash: 'abc',
    })

    const response = createDownloadsResponse([
      { id: 'complete', state: 'complete', updatedAt: 10 },
      { id: 'queued', state: 'queued', updatedAt: 1 },
      { id: 'downloading', state: 'downloading', updatedAt: 5 },
    ])

    expect(response.items.map((item: any) => item.id)).toEqual(['downloading', 'queued', 'complete'])
    expect(response.counts).toMatchObject({
      queued: 1,
      downloading: 1,
      complete: 1,
    })
  })

  it('summarizes ComfyUI queue state for app-owned prompt ids', () => {
    const queueSnapshot = getQueueSnapshot({
      queue_running: [[12, 'app-running']],
      queue_pending: [
        [13, 'external-pending'],
        [14, 'app-pending'],
      ],
    })

    expect(normalizeQueueEntries(null, 'queued')).toEqual([])
    expect(buildQueueSummaryForPromptIds(queueSnapshot, ['app-running', 'app-pending'])).toEqual({
      running: 1,
      pending: 2,
      appRunning: 1,
      appPending: 1,
      externalRunning: 0,
      externalPending: 1,
    })
  })

  it('extracts the main img2img input from ComfyUI history', () => {
    expect(
      extractInputImageNameFromHistory({
        prompt: [
          1,
          'prompt-id',
          {
            7: {
              class_type: 'LoadImage',
              inputs: { image: 'main-input.png' },
            },
            8: {
              class_type: 'ImageScale',
              inputs: { image: ['7', 0] },
            },
            9: {
              class_type: 'VAEEncode',
              inputs: { pixels: ['8', 0] },
            },
            10: {
              class_type: 'KSampler',
              inputs: { latent_image: ['9', 0] },
            },
            20: {
              class_type: 'LoadImage',
              inputs: { image: 'controlnet-only.png' },
            },
          },
        ],
      }),
    ).toBe('main-input.png')
  })

  it('merges job outputs by variant and image reference', () => {
    expect(
      mergeJobOutputs(
        [{ variantId: 'original', type: 'output', subfolder: '', filename: 'one.png' }],
        [
          { variantId: 'original', type: 'output', subfolder: '', filename: 'one.png', promptText: 'new' },
          { variantId: 'improved', type: 'output', subfolder: '', filename: 'two.png' },
        ],
      ),
    ).toEqual([
      { variantId: 'original', type: 'output', subfolder: '', filename: 'one.png', promptText: 'new' },
      { variantId: 'improved', type: 'output', subfolder: '', filename: 'two.png' },
    ])
  })

  it('masks Civitai API settings', () => {
    expect(buildCivitaiKeyPreview('short')).toBe('Configured')
    expect(buildCivitaiKeyPreview('abcdef1234')).toBe('Saved, ending in 1234')
    expect(serializeCivitaiSettings('')).toEqual({
      ok: true,
      configured: false,
      keyPreview: null,
    })
  })

  it('creates an importable HTTP server without connecting to ComfyUI', async () => {
    const server = createCompanionServer({ connectWebSocket: false })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))

    try {
      const address = server.address() as AddressInfo
      const response = await fetch(`http://127.0.0.1:${address.port}/health`)
      await expect(response.json()).resolves.toMatchObject({
        ok: true,
        app: 'comfyui-companion-app',
      })
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()))
      })
    }
  })
})
