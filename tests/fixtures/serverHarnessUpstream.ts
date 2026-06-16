export type UpstreamState = {
  checkpointInfo: unknown
  loraInfo: unknown
  controlNetInfo: unknown
  samplerInfo: unknown
  clipInfo: unknown
  vaeInfo: unknown
  civitaiModels: unknown
  civitaiImages: unknown
  civitaiImagePages: Record<string, string>
  civitaiVersion: unknown
  atlasStatus: unknown
  atlasReaction: unknown
  atlasOpenModel: unknown
  queue: unknown
  histories: Record<string, unknown>
  promptIds: string[]
  failures: Record<string, { status?: number; payload?: unknown; body?: string } | Error>
  downloadBody: Uint8Array
}

function createDefaultUpstreamState(): UpstreamState {
  return {
    checkpointInfo: {
      CheckpointLoaderSimple: {
        input: {
          required: {
            ckpt_name: [['waiIllustriousSDXL_v160.safetensors', 'animaPencilXL.safetensors']],
          },
        },
      },
    },
    loraInfo: {
      LoraLoader: {
        input: {
          required: {
            lora_name: [['detailBoost.safetensors']],
            strength_model: ['FLOAT', { default: 0.65 }],
          },
        },
      },
    },
    controlNetInfo: {
      ControlNetLoader: {
        input: {
          required: {
            control_net_name: [[
              'mistoLine_rank256.safetensors',
              'depth-sdxl.safetensors',
              'controlnetxlCNXL_windsingaiPose.safetensors',
            ]],
          },
        },
      },
    },
    samplerInfo: { KSampler: { input: { required: {
      sampler_name: [['dpmpp_2m', 'euler', 'euler_ancestral']], scheduler: [['karras', 'normal']],
    } } } },
    clipInfo: { CLIPLoader: { input: { required: { clip_name: [['qwen_3_06b_base.safetensors']] } } } },
    vaeInfo: { VAELoader: { input: { required: { vae_name: [['wan_2.1_vae.safetensors']] } } } },
    civitaiModels: {
      items: [
        {
          id: 101,
          name: 'Mock Detail LoRA',
          type: 'LORA',
          modelVersions: [{ id: 201, name: 'v1', files: [] }],
        },
      ],
      metadata: { totalItems: 1, totalPages: 1 },
    },
    civitaiImages: {
      items: [{ id: 401, url: 'https://image.test/detail.png', meta: { prompt: 'sample prompt' } }],
      metadata: { totalItems: 1 },
    },
    civitaiImagePages: {},
    civitaiVersion: {
      id: 201,
      name: 'v1',
      baseModel: 'Pony',
      trainedWords: ['detail boost'],
      model: { id: 101, name: 'Mock Detail LoRA', type: 'LORA', nsfw: false },
      files: [{ id: 301, name: 'detailBoost.safetensors', primary: true, hashes: { SHA256: 'MOCKHASH' } }],
    },
    atlasStatus: {
      ok: true,
      items: [],
    },
    atlasReaction: {
      file: { id: 501, source: 'CivitAI', source_id: '401', url: 'https://image.test/detail.png' },
      reaction: { type: 'love' },
      download: { requested: true },
    },
    atlasOpenModel: {
      tab: {
        id: 601,
        params: {
          service: 'civit-ai-images',
          modelId: 101,
          modelVersionId: 201,
        },
      },
      browse_url: 'https://atlas.test/browse',
    },
    queue: {
      queue_running: [],
      queue_pending: [],
    },
    histories: {},
    promptIds: ['prompt-1', 'prompt-2', 'prompt-3'],
    failures: {},
    downloadBody: new TextEncoder().encode('mock model bytes'),
  }
}

export function mergeUpstreamState(overrides: Partial<UpstreamState> | undefined) {
  const defaults = createDefaultUpstreamState()

  return {
    ...defaults,
    ...overrides,
    failures: {
      ...defaults.failures,
      ...overrides?.failures,
    },
    civitaiImagePages: {
      ...defaults.civitaiImagePages,
      ...overrides?.civitaiImagePages,
    },
    histories: {
      ...defaults.histories,
      ...overrides?.histories,
    },
  }
}
