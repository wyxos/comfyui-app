import { describe, expect, it } from 'vitest'
import { useServerHarness } from './serverApiTestUtils'

const { setupHarness } = useServerHarness()

describe('server generation option routes', () => {
  it('returns KSampler and Anima asset options from ComfyUI object info', async () => {
    const server = await setupHarness({
      upstream: {
        samplerInfo: {
          KSampler: {
            input: {
              required: {
                sampler_name: [['euler', 'dpmpp_2m']],
                scheduler: [['normal', 'karras']],
              },
            },
          },
        },
        clipInfo: {
          CLIPLoader: {
            input: {
              required: {
                clip_name: [['qwen_3_06b_base.safetensors', 'custom-clip.safetensors']],
              },
            },
          },
        },
        vaeInfo: {
          VAELoader: {
            input: {
              required: {
                vae_name: [['wan_2.1_vae.safetensors', 'custom-vae.safetensors']],
              },
            },
          },
        },
      },
    })

    await expect(server.request('/api/generation-options')).resolves.toMatchObject({
      payload: {
        ok: true,
        samplers: ['euler', 'dpmpp_2m'],
        schedulers: ['normal', 'karras'],
        clipNames: ['qwen_3_06b_base.safetensors', 'custom-clip.safetensors'],
        vaeNames: ['wan_2.1_vae.safetensors', 'custom-vae.safetensors'],
        defaults: {
          anima: expect.objectContaining({
            samplerName: 'euler',
            scheduler: 'normal',
            clipName: 'qwen_3_06b_base.safetensors',
            vaeName: 'wan_2.1_vae.safetensors',
          }),
          sdxl: expect.objectContaining({
            samplerName: 'dpmpp_2m',
            scheduler: 'karras',
          }),
        },
      },
    })
  })
})
