import { join } from 'node:path'
import { mkdir, stat, writeFile } from 'node:fs/promises'
import { describe, expect, it, vi } from 'vitest'
import { useServerHarness } from './serverApiTestUtils'

const { setupHarness } = useServerHarness()

describe('companion server API routes', () => {
  it('covers prompt improvement, generation, job polling, cancellation, and failure states', async () => {
      vi.setSystemTime(new Date('2026-04-26T00:00:00.000Z'))
      const server = await setupHarness()

      await expect(
        server.json('POST', '/api/improve-prompt', {
          prompt: 'portrait',
          checkpoint: 'waiIllustriousSDXL_v160.safetensors',
          ollamaModel: 'gpt-oss:20b',
        }),
      ).resolves.toMatchObject({
        payload: expect.objectContaining({
          ok: true,
          improvedPrompt: 'refined prompt, cinematic light, crisp subject detail',
        }),
      })

      await expect(server.json('POST', '/api/generate', { prompt: '', checkpoint: '' })).resolves.toMatchObject({
        response: expect.objectContaining({ status: 400 }),
        payload: expect.objectContaining({ error: 'missing-prompt' }),
      })
      await expect(
        server.json('POST', '/api/generate', {
          prompt: 'portrait',
          checkpoints: [
            {
              name: 'waiIllustriousSDXL_v160.safetensors',
              controlNets: [{ model: 'mistoLine_rank256.safetensors', inputImageName: 'missing.png' }],
            },
          ],
        }),
      ).resolves.toMatchObject({
        response: expect.objectContaining({ status: 400 }),
        payload: expect.objectContaining({ error: 'missing-controlnet-image' }),
      })

      await writeFile(join(server.inputDir, 'control.png'), 'control image', 'utf8')
      await expect(
        server.json('POST', '/api/generate', {
          prompt: 'portrait',
          checkpoints: [
            {
              name: 'animaPencilXL.safetensors',
              controlNets: [
                {
                  model: 'mistoLine_rank256.safetensors',
                  inputImageName: 'control.png',
                },
              ],
            },
          ],
        }),
      ).resolves.toMatchObject({
        response: expect.objectContaining({ status: 400 }),
        payload: expect.objectContaining({
          error: 'invalid-controlnet',
          message: expect.stringContaining('mistoLine_rank256.safetensors is not compatible'),
        }),
      })

      const generated = await server.json('POST', '/api/generate', {
        prompt: 'portrait',
        improvedPrompt: 'refined portrait',
        checkpoints: [
          {
            name: 'waiIllustriousSDXL_v160.safetensors',
            loras: [
              {
                name: 'detailBoost.safetensors',
                strength: 0.7,
                triggerWords: [{ word: 'detail boost', weight: 1.2 }],
              },
            ],
            controlNets: [
              {
                model: 'mistoLine_rank256.safetensors',
                inputImageName: 'control.png',
                strength: 0.8,
                startPercent: 0.1,
                endPercent: 0.9,
              },
            ],
          },
          {
            name: 'animaPencilXL.safetensors',
            loras: [
              {
                name: 'animaSketch.safetensors',
                strength: 0.5,
                triggerWords: [{ word: 'anima sketch', weight: 1 }],
              },
            ],
          },
        ],
        width: 1024,
        height: 1024,
        cfg: 7,
        seed: 123,
      })
      expect(generated.payload).toMatchObject({
        ok: true,
        promptId: 'prompt-1',
        promptIds: ['prompt-1', 'prompt-2'],
        state: 'queued',
      })

      const promptCalls = server.calls.filter((call) => call.method === 'POST' && call.url.pathname === '/prompt')
      const firstPromptNodes = Object.values((promptCalls[0].body as any).prompt) as any[]
      const secondPromptNodes = Object.values((promptCalls[1].body as any).prompt) as any[]
      const firstPromptText = firstPromptNodes.map((node) => node.inputs?.text).filter(Boolean).join('\n')
      const secondPromptText = secondPromptNodes.map((node) => node.inputs?.text).filter(Boolean).join('\n')
      const firstLoraNames = firstPromptNodes.map((node) => node.inputs?.lora_name).filter(Boolean)
      const secondLoraNames = secondPromptNodes.map((node) => node.inputs?.lora_name).filter(Boolean)
      const controlNetNodes = firstPromptNodes.filter((node) => node.class_type === 'ControlNetApplyAdvanced')

      expect(firstPromptText).toContain('(detail boost:1.2)')
      expect(firstPromptText).not.toContain('anima sketch')
      expect(secondPromptText).toContain('(anima sketch:1)')
      expect(secondPromptText).not.toContain('detail boost')
      expect(firstLoraNames).toContain('detailBoost.safetensors')
      expect(secondLoraNames).toContain('animaSketch.safetensors')
      expect(firstPromptNodes.some((node) => node.inputs?.control_net_name === 'mistoLine_rank256.safetensors')).toBe(true)
      expect(controlNetNodes[0].inputs).toMatchObject({
        strength: 0.8,
        start_percent: 0.1,
        end_percent: 0.9,
      })

      server.serverModule.resetJobStoreRuntimeState({ clearMemory: true })
      await expect(server.request('/api/jobs')).resolves.toMatchObject({
        payload: expect.objectContaining({
          ok: true,
          jobs: expect.arrayContaining([
            expect.objectContaining({
              promptId: 'prompt-1',
              checkpoint: 'waiIllustriousSDXL_v160.safetensors',
              state: 'queued',
              width: 1024,
              height: 1024,
              cfg: 7,
              seed: 123,
              loras: [expect.objectContaining({ name: 'detailBoost.safetensors', strength: 0.7 })],
            }),
            expect.objectContaining({
              promptId: 'prompt-2',
              checkpoint: 'animaPencilXL.safetensors',
              state: 'queued',
            }),
          ]),
        }),
      })

      server.upstream.queue = {
        queue_running: [[1, 'prompt-1']],
        queue_pending: [[2, 'external-job']],
      }

      await expect(server.request('/api/jobs/prompt-1')).resolves.toMatchObject({
        payload: expect.objectContaining({
          ok: true,
          promptId: 'prompt-1',
          state: 'running',
          currentNodeLabel: 'Queued in ComfyUI',
        }),
      })

      await expect(server.json('POST', '/api/jobs/prompt-1/cancel')).resolves.toMatchObject({
        payload: expect.objectContaining({
          ok: true,
          promptId: 'prompt-1',
          state: 'cancelling',
          cancelRequested: true,
        }),
      })
      expect(server.calls.some((call) => call.method === 'POST' && call.url.pathname === '/interrupt')).toBe(true)

      await server.json('POST', '/api/generate', {
        prompt: 'complete portrait',
        checkpoint: 'waiIllustriousSDXL_v160.safetensors',
      })
      server.upstream.histories['prompt-3'] = {
        'prompt-3': {
          status: { status_str: 'success' },
          outputs: {
            9: {
              images: [{ filename: 'mock-output.png', subfolder: '2026-05-04\\txt2img', type: 'output' }],
            },
          },
        },
      }

      await expect(server.request('/api/jobs/prompt-3')).resolves.toMatchObject({
        payload: expect.objectContaining({
          ok: true,
          state: 'complete',
          outputs: [
            expect.objectContaining({
              filename: 'mock-output.png',
              subfolder: '2026-05-04/txt2img',
              url: '/api/view?filename=mock-output.png&subfolder=2026-05-04%2Ftxt2img&type=output',
            }),
          ],
        }),
      })

      const generatedOutputDir = join(server.outputDir, '2026-05-04', 'txt2img')
      const generatedOutputPath = join(generatedOutputDir, 'mock-output.png')
      await mkdir(generatedOutputDir, { recursive: true })
      await writeFile(generatedOutputPath, 'generated output image', 'utf8')
      await expect(
        server.request('/api/jobs/prompt-3?deleteOutputs=1', { method: 'DELETE' }),
      ).resolves.toMatchObject({
        payload: expect.objectContaining({
          ok: true,
          promptId: 'prompt-3',
          comfyHistoryDeleted: true,
          deletedOutputs: expect.objectContaining({
            requested: 1,
            deleted: [generatedOutputPath],
          }),
        }),
      })
      expect(
        server.calls.find((call) => call.method === 'POST' && call.url.pathname === '/history')?.body,
      ).toEqual({ delete: ['prompt-3'] })
      await expect(stat(generatedOutputPath)).rejects.toMatchObject({ code: 'ENOENT' })
      const jobsAfterDelete = await server.request('/api/jobs')
      expect((jobsAfterDelete.payload.jobs as Array<{ promptId: string }>).some((job) => job.promptId === 'prompt-3')).toBe(false)

      const failedGenerate = await server.json('POST', '/api/generate', {
        prompt: 'failed portrait',
        checkpoint: 'waiIllustriousSDXL_v160.safetensors',
      })
      const failedPromptId = failedGenerate.payload.promptId
      server.upstream.histories[failedPromptId] = {
        [failedPromptId]: {
          status: {
            status_str: 'error',
            messages: [['execution_error', { exception_message: 'Sampler failed' }]],
          },
          outputs: {},
        },
      }

      await expect(server.request('/api/jobs')).resolves.toMatchObject({
        payload: expect.objectContaining({
          ok: true,
          jobs: expect.arrayContaining([
            expect.objectContaining({ promptId: failedPromptId, state: 'error', error: 'Sampler failed' }),
          ]),
          queue: expect.objectContaining({ externalPending: 1 }),
        }),
      })
    })

  it('keeps local history and outputs when ComfyUI history deletion fails', async () => {
      const server = await setupHarness({
        upstream: {
          failures: {
            'POST /history': { status: 500, payload: { error: 'history unavailable' } },
          },
        },
      })

      await server.json('POST', '/api/generate', {
        prompt: 'complete portrait',
        checkpoint: 'waiIllustriousSDXL_v160.safetensors',
      })
      server.upstream.histories['prompt-1'] = {
        'prompt-1': {
          status: { status_str: 'success' },
          outputs: {
            9: {
              images: [{ filename: 'mock-output.png', subfolder: '2026-05-04/txt2img', type: 'output' }],
            },
          },
        },
      }

      await expect(server.request('/api/jobs/prompt-1')).resolves.toMatchObject({
        payload: expect.objectContaining({ ok: true, state: 'complete' }),
      })

      const generatedOutputDir = join(server.outputDir, '2026-05-04', 'txt2img')
      const generatedOutputPath = join(generatedOutputDir, 'mock-output.png')
      await mkdir(generatedOutputDir, { recursive: true })
      await writeFile(generatedOutputPath, 'generated output image', 'utf8')

      await expect(
        server.request('/api/jobs/prompt-1?deleteOutputs=1', { method: 'DELETE' }),
      ).resolves.toMatchObject({
        response: expect.objectContaining({ status: 502 }),
        payload: expect.objectContaining({ error: 'comfyui-history-delete-failed' }),
      })
      await expect(stat(generatedOutputPath)).resolves.toBeDefined()

      const jobsAfterFailedDelete = await server.request('/api/jobs')
      expect(
        (jobsAfterFailedDelete.payload.jobs as Array<{ promptId: string }>).some((job) => job.promptId === 'prompt-1'),
      ).toBe(true)
    })

  it('does not turn LoRA trigger words into an improved prompt variant', async () => {
      const server = await setupHarness()

      const generated = await server.json('POST', '/api/generate', {
        prompt: 'portrait',
        improvedPrompt: '',
        checkpoints: [
          {
            name: 'waiIllustriousSDXL_v160.safetensors',
            loras: [
              {
                name: 'detailBoost.safetensors',
                strength: 0.7,
                triggerWords: [{ word: 'detail boost', weight: 1.2 }],
              },
            ],
          },
        ],
        width: 1024,
        height: 1024,
        cfg: 7,
        seed: 123,
      })

      expect(generated.payload).toMatchObject({
        ok: true,
        promptId: 'prompt-1',
        promptIds: ['prompt-1'],
        promptVariants: [
          expect.objectContaining({
            id: 'original',
            promptText: 'portrait, (detail boost:1.2)',
            isImproved: false,
          }),
        ],
        improvedPrompt: null,
      })
      expect(generated.payload.promptVariants).toHaveLength(1)

      const promptCalls = server.calls.filter((call) => call.method === 'POST' && call.url.pathname === '/prompt')
      expect(promptCalls).toHaveLength(1)
      const workflowNodes = Object.values((promptCalls[0].body as any).prompt) as any[]
      expect(workflowNodes.filter((node) => node.class_type === 'SaveImage')).toHaveLength(1)
      const promptText = workflowNodes.map((node) => node.inputs?.text).filter(Boolean).join('\n')
      expect(promptText).toContain('portrait, (detail boost:1.2)')
    })

  it('cancels only app-known queued jobs from the ComfyUI queue', async () => {
      const server = await setupHarness()

      await server.json('POST', '/api/generate', {
        prompt: 'running portrait',
        checkpoint: 'waiIllustriousSDXL_v160.safetensors',
      })
      await server.json('POST', '/api/generate', {
        prompt: 'queued portrait',
        checkpoint: 'waiIllustriousSDXL_v160.safetensors',
      })

      server.upstream.queue = {
        queue_running: [[1, 'prompt-1']],
        queue_pending: [[2, 'prompt-2'], [3, 'external-job']],
      }

      await expect(server.json('POST', '/api/jobs/queued/cancel')).resolves.toMatchObject({
        payload: expect.objectContaining({
          ok: true,
          cancelled: 1,
          promptIds: ['prompt-2'],
          jobs: [
            expect.objectContaining({
              promptId: 'prompt-2',
              state: 'cancelled',
              cancelRequested: true,
              currentNodeLabel: 'Cancelled',
            }),
          ],
        }),
      })

      expect(server.calls.some((call) => call.method === 'POST' && call.url.pathname === '/interrupt')).toBe(false)
      expect(
        server.calls.find((call) => call.method === 'POST' && call.url.pathname === '/queue')?.body,
      ).toEqual({ delete: ['prompt-2'] })
    })
})
