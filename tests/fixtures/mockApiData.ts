export type FetchCall = {
  path: string
  method: string
  body: unknown
  search: URLSearchParams
}

export type MockJob = Record<string, unknown>
export type MockDownload = Record<string, unknown>
export type MockModel = Record<string, any>

export type MockFailure = {
  status?: number
  payload?: unknown
}

export type MockApiOptions = {
  checkpoints?: Array<Record<string, unknown>>
  loras?: Array<Record<string, unknown>>
  controlNets?: Array<Record<string, unknown>>
  models?: MockModel[]
  jobs?: MockJob[]
  downloads?: MockDownload[]
  civitaiConfigured?: boolean
  includeNsfwDefault?: boolean
  generateJobState?: string
  improvePrompt?: string
  uploadInputImageNames?: string[]
  failures?: Record<string, MockFailure>
  waits?: Record<string, Promise<unknown>>
}

export const checkpointName = 'waiIllustriousSDXL_v160.safetensors'
export const secondCheckpointName = 'animaPencilXL.safetensors'
export const loraName = 'detailBoost.safetensors'
export const animaLoraName = 'animaSketch.safetensors'
export const sameArchitectureLoraName = 'illustriousGlow.safetensors'
export const unverifiedLoraName = 'mysteryStyle.safetensors'

export function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
  })
}

export async function parseRequestBody(init?: RequestInit) {
  if (!init?.body || typeof init.body !== 'string') {
    return null
  }

  try {
    return JSON.parse(init.body)
  } catch {
    return init.body
  }
}

export function createMockJob(body: Record<string, unknown> = {}, state = 'complete'): MockJob {
  const promptText = typeof body.prompt === 'string' && body.prompt ? body.prompt : 'test prompt'
  const improvedPrompt = typeof body.improvedPrompt === 'string' && body.improvedPrompt ? body.improvedPrompt : null
  const checkpointEntry = Array.isArray(body.checkpoints) ? body.checkpoints[0] : null
  const checkpoint =
    checkpointEntry && typeof checkpointEntry === 'object' && 'name' in checkpointEntry
      ? String(checkpointEntry.name)
      : checkpointName
  const promptVariants = [
    {
      id: 'original',
      label: 'Original prompt',
      promptText,
      isImproved: false,
    },
  ]

  if (improvedPrompt) {
    promptVariants.push({
      id: 'improved',
      label: 'Improved prompt',
      promptText: improvedPrompt,
      isImproved: true,
    })
  }

  const complete = state === 'complete'
  const failed = state === 'error'
  const inputImageName =
    typeof body.inputImageName === 'string' && body.inputImageName.trim()
      ? body.inputImageName.trim()
      : null

  return {
    ok: true,
    promptId: 'prompt-1',
    batchId: null,
    batchIndex: null,
    state,
    promptText,
    negativePrompt: '',
    promptVariants,
    improvedPrompt,
    promptImprovementError: null,
    checkpoint,
    inputImageName,
    steps: typeof body.steps === 'number' ? body.steps : null,
    seed: 12345,
    createdAt: Date.now() - 1200,
    updatedAt: Date.now(),
    queuePosition: state === 'queued' ? 1 : null,
    queueNumber: state === 'queued' ? 12 : null,
    cancelRequested: state === 'cancelling',
    elapsedMs: 1200,
    currentNode: state === 'running' ? 'KSampler' : null,
    currentNodeLabel: failed ? 'Sampler failed' : complete ? 'Saved image' : state === 'queued' ? 'Queued in ComfyUI' : 'Sampling',
    progressValue: state === 'running' ? 4 : null,
    progressMax: state === 'running' ? 20 : null,
    progressPercent: state === 'running' ? 20 : null,
    outputs: complete
      ? [
          {
            filename: 'mock-output.png',
            subfolder: '',
            type: 'output',
            variantId: promptVariants[0].id,
            variantLabel: promptVariants[0].label,
            promptText: promptVariants[0].promptText,
            isImproved: false,
            url: '/api/view?filename=mock-output.png&subfolder=&type=output',
            fullPath: 'C:\\mock\\mock-output.png',
            parentDirectory: 'C:\\mock',
          },
        ]
      : [],
    error: failed ? 'Sampler failed' : null,
    websocketConnected: true,
  }
}

export function createMockModel(overrides: Partial<MockModel> = {}): MockModel {
  return {
    id: 101,
    name: 'Mock Detail LoRA',
    type: 'LORA',
    nsfw: false,
    creator: {
      username: 'atlasmaker',
    },
    stats: {
      downloadCount: 1200,
      favoriteCount: 55,
      thumbsUpCount: 55,
      commentCount: 7,
    },
    tags: ['detail', 'portrait'],
    modelVersions: [
      {
        id: 201,
        name: 'v1',
        baseModel: 'Pony',
        trainedWords: ['detail boost'],
        files: [
          {
            id: 301,
            name: loraName,
            primary: true,
            type: 'Model',
            sizeKB: 2048,
            downloadUrl: 'https://example.test/detailBoost.safetensors',
          },
        ],
        images: [
          {
            id: 401,
            url: '/mock-assets/detail-preview.png',
            type: 'image',
            nsfw: false,
            width: 512,
            height: 512,
            meta: {
              prompt: 'sample prompt',
              negativePrompt: 'blur',
              seed: 123,
              steps: 20,
              cfgScale: 7,
            },
          },
        ],
      },
    ],
    ...overrides,
  }
}

export function createMockDownload(overrides: Partial<MockDownload> = {}): MockDownload {
  return {
    id: '101__201__301',
    state: 'queued',
    modelId: 101,
    modelName: 'Mock Detail LoRA',
    modelType: 'LORA',
    versionId: 201,
    versionName: 'v1',
    fileId: 301,
    fileName: loraName,
    updatedAt: Date.now(),
    ...overrides,
  }
}

export function defaultCheckpoints() {
  return [
    {
      name: checkpointName,
      displayName: checkpointName,
      family: 'sdxl',
      downloaded: true,
      previewUrl: null,
      previewMediaType: null,
      compatibility: {
        modelType: 'Checkpoint',
        baseModel: 'Pony',
        baseModelKey: 'pony',
        source: 'sidecar',
        status: 'ready',
      },
    },
    {
      name: secondCheckpointName,
      displayName: secondCheckpointName,
      family: 'anima',
      downloaded: false,
      previewUrl: null,
      previewMediaType: null,
      compatibility: {
        modelType: 'Checkpoint',
        baseModel: 'Anima',
        baseModelKey: 'anima',
        source: 'sidecar',
        status: 'ready',
      },
    },
  ]
}

export function defaultLoras() {
  return [
    {
      name: loraName,
      displayName: loraName,
      downloaded: true,
      previewUrl: null,
      previewMediaType: null,
      civitai: {
        trainedWords: ['detail boost'],
      },
      triggerWords: ['detail boost'],
      compatibility: {
        modelId: 101,
        versionId: 201,
        modelType: 'LORA',
        baseModel: 'Pony',
        baseModelKey: 'pony',
        trainedWords: ['detail boost'],
        hashes: { SHA256: 'MOCKHASH' },
        source: 'sidecar',
        status: 'ready',
      },
    },
    {
      name: animaLoraName,
      displayName: animaLoraName,
      downloaded: true,
      previewUrl: null,
      previewMediaType: null,
      civitai: {
        trainedWords: ['anima sketch'],
      },
      triggerWords: ['anima sketch'],
      compatibility: {
        modelId: 102,
        versionId: 202,
        modelType: 'LORA',
        baseModel: 'Anima',
        baseModelKey: 'anima',
        trainedWords: ['anima sketch'],
        source: 'sidecar',
        status: 'ready',
      },
    },
    {
      name: sameArchitectureLoraName,
      displayName: sameArchitectureLoraName,
      downloaded: true,
      previewUrl: null,
      previewMediaType: null,
      civitai: {
        trainedWords: ['illustrious glow'],
      },
      triggerWords: ['illustrious glow'],
      compatibility: {
        modelId: 103,
        versionId: 203,
        modelType: 'LORA',
        baseModel: 'Illustrious',
        baseModelKey: 'illustrious',
        trainedWords: ['illustrious glow'],
        source: 'sidecar',
        status: 'ready',
      },
    },
    {
      name: unverifiedLoraName,
      displayName: unverifiedLoraName,
      downloaded: true,
      previewUrl: null,
      previewMediaType: null,
      civitai: {},
      triggerWords: ['mystery tone'],
      compatibility: {
        modelType: 'LORA',
        baseModel: '',
        baseModelKey: '',
        trainedWords: ['mystery tone'],
        source: 'unknown',
        status: 'loading',
      },
    },
  ]
}

export function defaultControlNets() {
  return [
    {
      name: 'mistoLine_rank256.safetensors',
      displayName: 'mistoLine_rank256.safetensors',
    },
    {
      name: 'depth-sdxl.safetensors',
      displayName: 'depth-sdxl.safetensors',
    },
  ]
}

export function defaultControlNetPreprocessors() {
  return [
    { id: 'none', label: 'Raw image', defaultResolution: 512 },
    { id: 'lineart', label: 'Line art', defaultResolution: 512 },
    { id: 'canny', label: 'Canny edges', defaultResolution: 512 },
    { id: 'depth', label: 'Depth map', defaultResolution: 512 },
  ]
}

export function failureFor(failures: Record<string, MockFailure>, method: string, pathname: string) {
  return failures[`${method} ${pathname}`] ?? failures[pathname]
}
