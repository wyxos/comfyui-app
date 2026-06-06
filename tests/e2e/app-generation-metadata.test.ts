import { describe, expect, it, vi } from 'vitest'
import { createMockModel } from '../fixtures/mockApi'
import { checkpointName } from '../fixtures/mockApiData'
import { renderCompanionApp } from './appFlowTestUtils'

describe('companion app metadata paste flow', () => {
  it('applies copied image metadata from the persistent form footer', async () => {
    const { api, screen } = await renderCompanionApp()
    const readText = vi.fn().mockResolvedValue(JSON.stringify({
      Prompt: 'silver hair, looking away',
      'Negative prompt': 'blur, text',
      Seed: 987654,
      Steps: 30,
      'CFG scale': 6.5,
      Sampler: 'DPM++ 2M Karras',
      'Denoising strength': 0.62,
      Size: '832x1216',
    }))

    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        ...navigator.clipboard,
        readText,
      },
    })

    await screen.getByRole('button', { name: 'Paste metadata' }).click()

    await screen.getByRole('button', { name: /Config.*Size, steps, seed, and CFG/ }).click()
    await expect.element(screen.getByRole('spinbutton', { name: 'Width' })).toHaveValue(832)
    await expect.element(screen.getByRole('spinbutton', { name: 'Height' })).toHaveValue(1216)
    await expect.element(screen.getByRole('spinbutton', { name: 'Seed' })).toHaveValue(987654)
    await expect.element(screen.getByRole('spinbutton', { name: 'Steps' })).toHaveValue(30)
    await expect.element(screen.getByRole('spinbutton', { name: 'CFG' })).toHaveValue(6.5)
    await expect.element(screen.getByRole('combobox', { name: 'Sampler' })).toHaveValue('dpmpp_2m')
    await expect.element(screen.getByRole('combobox', { name: 'Scheduler' })).toHaveValue('karras')

    await screen.getByRole('button', { name: /Prompt text and negative prompt/ }).click()
    await expect.element(screen.getByText('silver hair', { exact: true })).toBeVisible()
    await expect.element(screen.getByText('looking away', { exact: true })).toBeVisible()
    await expect.element(screen.getByText('blur', { exact: true })).toBeVisible()
    await expect.element(screen.getByText('text', { exact: true })).toBeVisible()

    await screen.getByRole('button', { name: 'Generate' }).click()

    await vi.waitFor(() => {
      const generateCall = api.calls.find((call) => call.method === 'POST' && call.path === '/api/generate')
      expect(generateCall?.body).toMatchObject({
        prompt: 'silver hair, looking away',
        negativePrompt: 'blur, text',
        width: 832,
        height: 1216,
        seed: 987654,
        steps: 30,
        cfg: 6.5,
        samplerName: 'dpmpp_2m',
        scheduler: 'karras',
      })
    })
  })

  it('pastes copied image metadata from the prompt tab', async () => {
    const { screen } = await renderCompanionApp('/?tab=prompt')
    const readText = vi.fn().mockResolvedValue(JSON.stringify({
      Prompt: 'orange dress, city lights',
      'Negative prompt': 'bad hands, watermark',
      Seed: 13579,
      Steps: 28,
      'CFG scale': 5.5,
      Sampler: 'Euler a',
      Size: '768x1152',
    }))

    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        ...navigator.clipboard,
        readText,
      },
    })

    await screen.getByRole('button', { name: 'Paste metadata' }).click()

    await expect.element(screen.getByText('orange dress', { exact: true })).toBeVisible()
    await expect.element(screen.getByText('city lights', { exact: true })).toBeVisible()
    await expect.element(screen.getByText('bad hands', { exact: true })).toBeVisible()
    await expect.element(screen.getByText('watermark', { exact: true })).toBeVisible()

    await screen.getByRole('button', { name: /Config.*Size, steps, seed, and CFG/ }).click()
    await expect.element(screen.getByRole('spinbutton', { name: 'Width' })).toHaveValue(768)
    await expect.element(screen.getByRole('spinbutton', { name: 'Height' })).toHaveValue(1152)
    await expect.element(screen.getByRole('spinbutton', { name: 'Seed' })).toHaveValue(13579)
    await expect.element(screen.getByRole('spinbutton', { name: 'Steps' })).toHaveValue(28)
    await expect.element(screen.getByRole('spinbutton', { name: 'CFG' })).toHaveValue(5.5)
    await expect.element(screen.getByRole('combobox', { name: 'Sampler' })).toHaveValue('euler_ancestral')
  })

  it('applies image preview metadata directly to the generation form', async () => {
    const { screen } = await renderCompanionApp('/', {
      checkpoints: [
        {
          name: checkpointName,
          displayName: 'WAI Illustrious',
          family: 'sdxl',
          downloaded: true,
          previewUrl: null,
          previewMediaType: null,
          compatibility: {
            modelId: 101,
            versionId: 201,
            modelType: 'Checkpoint',
            baseModel: 'Illustrious',
            baseModelKey: 'illustrious',
            source: 'sidecar',
            status: 'ready',
          },
        },
      ],
      models: [
        createMockModel({
          name: 'WAI Illustrious',
          type: 'Checkpoint',
          modelVersions: [
            {
              id: 201,
              name: 'v16.0',
              baseModel: 'Illustrious',
              trainedWords: [],
              files: [],
              images: [
                {
                  id: 401,
                  url: '/mock-assets/wai-preview.png',
                  type: 'image',
                  nsfw: false,
                  width: 832,
                  height: 1216,
                  meta: {
                    prompt: 'blue hair, underwater',
                    negativePrompt: 'blur, text',
                    seed: 2073075463,
                    steps: 30,
                    cfgScale: 7,
                    denoise: 0.5,
                    sampler: 'Euler a',
                    Size: '832x1216',
                  },
                },
              ],
            },
          ],
        }),
      ],
    })

    await screen.getByRole('button', { name: 'WAI Illustrious' }).click()
    await screen.getByRole('button', { name: 'Apply metadata' }).click()
    await screen.getByRole('button', { name: /Config.*Size, steps, seed, and CFG/ }).click()

    await expect.element(screen.getByRole('spinbutton', { name: 'Width' })).toHaveValue(832)
    await expect.element(screen.getByRole('spinbutton', { name: 'Height' })).toHaveValue(1216)
    await expect.element(screen.getByRole('spinbutton', { name: 'Seed' })).toHaveValue(2073075463)
    await expect.element(screen.getByRole('spinbutton', { name: 'Steps' })).toHaveValue(30)
    await expect.element(screen.getByRole('spinbutton', { name: 'CFG' })).toHaveValue(7)
    await expect.element(screen.getByRole('combobox', { name: 'Sampler' })).toHaveValue('euler_ancestral')

    await screen.getByRole('button', { name: /Prompt text and negative prompt/ }).click()
    await expect.element(screen.getByText('blue hair', { exact: true })).toBeVisible()
    await expect.element(screen.getByText('underwater', { exact: true })).toBeVisible()
    await expect.element(screen.getByText('blur', { exact: true })).toBeVisible()
    await expect.element(screen.getByText('text', { exact: true })).toBeVisible()
  })
})
