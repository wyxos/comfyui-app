import { describe, expect, it, vi } from 'vitest'
import { createHistoryJob, createImageFile, createJobOutput, renderCompanionApp, uploadFile } from './appFlowTestUtils'

describe('companion app e2e flows', () => {
  it('loads mocked generation dependencies, improves a prompt, and submits generation', async () => {
      const { api, screen } = await renderCompanionApp()

      await expect.element(screen.getByText('waiIllustriousSDXL_v160.safetensors')).toBeVisible()
      await expect.element(screen.getByLabelText('Add LoRA for waiIllustriousSDXL_v160.safetensors')).toBeVisible()

      await screen.getByLabelText('Add checkpoint').click()
      await screen.getByRole('button', { name: 'animaPencilXL.safetensors' }).click()

      await screen.getByLabelText('Add LoRA for waiIllustriousSDXL_v160.safetensors').click()
      await expect.element(screen.getByRole('button', { name: /mysteryStyle\.safetensors.*Unverified/ })).toBeVisible()
      expect(document.body.textContent).not.toContain('animaSketch.safetensors')
      await screen.getByRole('button', { name: 'detailBoost.safetensors' }).click()

      await screen.getByLabelText('Add LoRA for animaPencilXL.safetensors').click()
      await screen.getByRole('button', { name: 'animaSketch.safetensors' }).click()

      await screen.getByRole('button', { name: /ControlNet.*Guided image controls/ }).click()
      await screen.getByRole('button', { name: 'Add' }).click()
      await screen.getByLabelText('Choose ControlNet model').click()
      await screen.getByRole('button', { name: 'mistoLine_rank256.safetensors' }).click()
      const controlNetImageInput = document.querySelector<HTMLInputElement>(
        'input[aria-label="ControlNet image file"]',
      )
      expect(controlNetImageInput).not.toBeNull()
      uploadFile(controlNetImageInput as HTMLInputElement, createImageFile('control.png'))
      await expect.element(screen.getByText('control.png')).toBeVisible()
      await expect.element(screen.getByRole('button', { name: 'Use output size for ControlNet resolution' })).toBeVisible()
      await vi.waitFor(() => {
        expect(api.calls.some((call) => call.method === 'POST' && call.path === '/api/upload-input-image')).toBe(true)
      })
      await expect.element(screen.getByText('mock-controlnet-preview.png')).toBeVisible()
      const firstPreviewCall = api.calls.find((call) => call.method === 'POST' && call.path === '/api/controlnet-preview')
      expect(firstPreviewCall?.body).toMatchObject({ preprocessor: 'lineart', resolution: 1024 })
      const previewCallCount = api.calls.filter((call) => call.method === 'POST' && call.path === '/api/controlnet-preview').length
      await screen.getByRole('button', { name: 'Use output size for ControlNet resolution' }).click()
      await vi.waitFor(() => {
        expect(api.calls.filter((call) => call.method === 'POST' && call.path === '/api/controlnet-preview').length).toBeGreaterThan(previewCallCount)
      })
      await screen.getByRole('button', { name: /Size, seed, and CFG/ }).click()
      const widthInput = screen.getByRole('spinbutton', { name: 'Width' })
      const heightInput = screen.getByRole('spinbutton', { name: 'Height' })
      await expect.element(widthInput).toHaveValue(1024)
      await expect.element(heightInput).toHaveValue(1024)
      await widthInput.fill('1920')
      await heightInput.fill('1080')
      const ratioField = document.querySelector<HTMLInputElement>('input[aria-label="Aspect ratio scale"]')
      const ratioSlider = document.querySelector<HTMLElement>('[role="slider"][aria-label="Aspect ratio scale"]')
      expect(ratioField?.min).toBe('-10')
      expect(ratioField?.max).toBe('10')
      expect(ratioField?.step).toBe('0.25')
      expect(ratioField?.disabled).toBe(true)
      expect(ratioSlider?.getAttribute('aria-valuemin')).toBe('-10')
      expect(ratioSlider?.getAttribute('aria-valuemax')).toBe('10')
      await screen.getByRole('button', { name: 'Free Ratio' }).click()
      expect(ratioField?.disabled).toBe(false)
      if (!ratioField) {
        throw new Error('Aspect ratio scale field not found.')
      }
      ratioField.value = '0.5'
      ratioField.dispatchEvent(new Event('input', { bubbles: true }))
      await expect.element(widthInput).toHaveValue(2112)
      await expect.element(heightInput).toHaveValue(1184)
      expect(ratioField.value).toBe('0.5')
      ratioField.value = '-2'
      ratioField.dispatchEvent(new Event('input', { bubbles: true }))
      await expect.element(widthInput).toHaveValue(1376)
      await expect.element(heightInput).toHaveValue(768)
      const scaledWidth = document.querySelector<HTMLInputElement>('input[aria-label="Width"]')
      const scaledHeight = document.querySelector<HTMLInputElement>('input[aria-label="Height"]')
      expect(Number(scaledWidth?.value)).toBeGreaterThan(Number(scaledHeight?.value))
      await screen.getByRole('button', { name: 'Reset aspect ratio scale' }).click()
      await vi.waitFor(() => {
        expect(ratioField.value).toBe('0')
      })
      await expect.element(widthInput).toHaveValue(1920)
      await expect.element(heightInput).toHaveValue(1088)

      await screen.getByRole('button', { name: /Prompt text and improver/ }).click()
      const subjectPrompt = screen.getByRole('textbox', { name: 'Subject', exact: true })
      await subjectPrompt.fill('sunlit cyberpunk portrait')
      const subjectPromptInput = document.querySelector<HTMLInputElement>('input[aria-label="Subject"]')
      subjectPromptInput?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
      )
      for (let index = 0; index < 5; index += 1) {
        await screen.getByRole('button', { name: 'Increase sunlit cyberpunk portrait weight' }).click()
      }
      await screen.getByRole('switch', { name: 'Use Ollama prompt improver' }).click()
      await screen.getByRole('button', { name: 'Improve', exact: true }).click()

      await expect.element(screen.getByText('Improved prompt ready', { exact: true })).toBeVisible()
      await expect.element(screen.getByRole('textbox', { name: 'Improved prompt' })).toHaveValue(
        'cinematic portrait, refined lighting, detailed composition',
      )
      const improveCall = api.calls.find((call) => call.method === 'POST' && call.path === '/api/improve-prompt')
      expect(improveCall?.body).toMatchObject({
        prompt: '(sunlit cyberpunk portrait:1.5)',
        checkpoint: 'waiIllustriousSDXL_v160.safetensors',
      })
      expect(JSON.stringify(improveCall?.body)).not.toContain('detail boost')

      await screen.getByRole('button', { name: 'Generate' }).click()

      await expect.element(screen.getByText(/outputs ready/)).toBeVisible()
      const generateCall = api.calls.find((call) => call.method === 'POST' && call.path === '/api/generate')
      expect(generateCall?.body).toMatchObject({
        prompt: '(sunlit cyberpunk portrait:1.5)',
        improvedPrompt: 'cinematic portrait, refined lighting, detailed composition',
        checkpoints: [
          {
            name: 'waiIllustriousSDXL_v160.safetensors',
            loras: [
              {
                name: 'detailBoost.safetensors',
                strength: 0.7,
                triggerWords: [{ word: 'detail boost', weight: 1 }],
              },
            ],
          },
          {
            name: 'animaPencilXL.safetensors',
            loras: [
              {
                name: 'animaSketch.safetensors',
                strength: 0.7,
                triggerWords: [{ word: 'anima sketch', weight: 1 }],
              },
            ],
          },
        ],
        controlNets: [
          {
            model: 'mistoLine_rank256.safetensors',
            inputImageName: 'mock-upload.png',
            preprocessor: 'lineart',
            previewResolution: 1920,
            strength: 1,
            startPercent: 0,
            endPercent: 1,
          },
        ],
      })
      const submittedControlNet = (generateCall?.body as any).controlNets[0]
      expect(typeof submittedControlNet.strength).toBe('number')
      expect(typeof submittedControlNet.startPercent).toBe('number')
      expect(typeof submittedControlNet.endPercent).toBe('number')

      await screen.getByRole('button', { name: 'mock-output.png' }).click()
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('C:\\mock\\mock-output.png')

      await screen.getByRole('button', { name: 'Open parent folder' }).click()
      expect(api.calls.some((call) => call.method === 'POST' && call.path === '/api/open-parent-folder')).toBe(true)
    })

  it('defaults the only available ControlNet model on new instances', async () => {
      const onlyControlNet = {
        name: 'mistoLine_rank256.safetensors',
        displayName: 'mistoLine_rank256.safetensors',
      }
      const { screen } = await renderCompanionApp('/', {
        controlNets: [onlyControlNet],
      })

      await screen.getByRole('button', { name: /Prompt text and improver/ }).click()
      await screen.getByRole('textbox', { name: 'Subject', exact: true }).fill('line guided portrait')

      await screen.getByRole('button', { name: /ControlNet.*Guided image controls/ }).click()
      await screen.getByRole('button', { name: 'Add' }).click()
      await vi.waitFor(() => {
        expect(document.body.textContent).toContain('mistoLine_rank256.safetensors')
      })

      const controlNetImageInput = document.querySelector<HTMLInputElement>(
        'input[aria-label="ControlNet image file"]',
      )
      expect(controlNetImageInput).not.toBeNull()
      uploadFile(controlNetImageInput as HTMLInputElement, createImageFile('control.png'))

      await expect.element(screen.getByText('mock-controlnet-preview.png')).toBeVisible()
      expect(document.body.textContent).not.toContain('Choose a ControlNet model or disable the empty instance.')
      await expect.element(screen.getByRole('button', { name: 'Generate' })).toBeEnabled()
    })

  it('uses job output URLs for capped history preview stacks', async () => {
      const outputs = Array.from({ length: 5 }, (_, index) =>
        createJobOutput(`history-output-${index + 1}.png`, index + 1),
      )
      const { screen } = await renderCompanionApp('/', {
        jobs: [createHistoryJob(outputs)],
      })

      await expect.element(screen.getByText('5 outputs ready', { exact: true })).toBeVisible()
      await expect.element(screen.getByText('+2')).toBeVisible()

      const stack = document.querySelector('[data-testid="job-output-preview-stack"]')
      expect(stack).not.toBeNull()

      const previewImages = Array.from(
        stack?.querySelectorAll<HTMLImageElement>('img[data-testid="job-output-preview"]') ?? [],
      )
      expect(previewImages).toHaveLength(3)
      expect(previewImages.map((image) => image.getAttribute('src'))).toEqual([
        '/api/view?filename=history-output-1.png&subfolder=&type=output',
        '/api/view?filename=history-output-2.png&subfolder=&type=output',
        '/api/view?filename=history-output-3.png&subfolder=&type=output',
      ])
    })

  it('keeps the preview input image tied to the submitted generation', async () => {
      const { api, screen } = await renderCompanionApp('/', {
        generateJobState: 'running',
        uploadInputImageNames: ['submitted-source.png', 'later-form-source.png'],
      })

      await screen.getByRole('button', { name: /Image.*Input image and denoise/ }).click()
      const inputImageInput = document.querySelector<HTMLInputElement>('input[type="file"]:not([aria-label])')
      expect(inputImageInput).not.toBeNull()
      uploadFile(inputImageInput as HTMLInputElement, createImageFile('source-a.png'))
      await vi.waitFor(() => {
        expect(api.calls.filter((call) => call.method === 'POST' && call.path === '/api/upload-input-image')).toHaveLength(1)
      })

      await screen.getByRole('button', { name: /Prompt text and improver/ }).click()
      await screen.getByRole('textbox', { name: 'Subject', exact: true }).fill('running portrait')
      await screen.getByRole('button', { name: 'Generate' }).click()
      await vi.waitFor(() => {
        const generateCall = api.calls.find((call) => call.method === 'POST' && call.path === '/api/generate')
        expect(generateCall?.body).toMatchObject({ inputImageName: 'submitted-source.png' })
      })

      const generationInputPreview = () =>
        document.querySelector<HTMLImageElement>('img[data-testid="generation-input-preview"]')
      await vi.waitFor(() => {
        expect(generationInputPreview()?.getAttribute('src')).toBe(
          '/api/view?filename=submitted-source.png&subfolder=&type=input',
        )
      })

      await screen.getByRole('button', { name: /Image.*Input image and denoise/ }).click()
      uploadFile(inputImageInput as HTMLInputElement, createImageFile('source-b.png'))
      await vi.waitFor(() => {
        expect(api.calls.filter((call) => call.method === 'POST' && call.path === '/api/upload-input-image')).toHaveLength(2)
      })

      expect(generationInputPreview()?.getAttribute('src')).toBe(
        '/api/view?filename=submitted-source.png&subfolder=&type=input',
      )
    })

  it('shows checkpoint loading as an inline assets spinner instead of a bottom error', async () => {
      let resolveCheckpoints: (() => void) | null = null
      const checkpointsReady = new Promise<void>((resolve) => {
        resolveCheckpoints = resolve
      })
      const loadingDependencies = await renderCompanionApp('/', {
        waits: {
          'GET /api/checkpoints': checkpointsReady,
        },
      })

      await expect
        .element(loadingDependencies.screen.getByText('Loading checkpoints from ComfyUI...'))
        .toBeVisible()
      expect(loadingDependencies.host.textContent).not.toContain('Checkpoints are still loading.')

      resolveCheckpoints?.()
      await expect
        .element(loadingDependencies.screen.getByText('waiIllustriousSDXL_v160.safetensors'))
        .toBeVisible()
    })

  it('surfaces generation dependency, validation, improver, running, cancel, and failed states', async () => {
      const dependencyFailure = await renderCompanionApp('/', {
        failures: {
          'GET /api/checkpoints': {
            status: 502,
            payload: { ok: false, message: 'Could not load checkpoints from ComfyUI.' },
          },
        },
      })
      await expect
        .element(dependencyFailure.screen.getByText('Could not load checkpoints from ComfyUI.').first())
        .toBeVisible()

      const improverFailure = await renderCompanionApp('/', {
        failures: {
          'POST /api/improve-prompt': {
            status: 502,
            payload: { ok: false, message: 'Ollama failed.' },
          },
        },
      })
      await improverFailure.screen.getByRole('button', { name: /Prompt text and improver/ }).click()
      await improverFailure.screen.getByRole('textbox', { name: 'Subject', exact: true }).fill('portrait')
      await improverFailure.screen.getByRole('switch', { name: 'Use Ollama prompt improver' }).click()
      await improverFailure.screen.getByRole('button', { name: 'Improve', exact: true }).click()
      await expect.element(improverFailure.screen.getByText('Ollama failed.').first()).toBeVisible()

      const running = await renderCompanionApp('/', { generateJobState: 'running' })
      await running.screen.getByRole('button', { name: /Prompt text and improver/ }).click()
      await running.screen.getByRole('textbox', { name: 'Subject', exact: true }).fill('running portrait')
      await running.screen.getByRole('button', { name: 'Generate' }).click()
      await expect.element(running.screen.getByText('Sampling', { exact: true }).first()).toBeVisible()
      await running.screen.getByRole('button', { name: 'Cancel' }).click()
      expect(running.api.calls.some((call) => call.method === 'POST' && call.path === '/api/jobs/prompt-1/cancel')).toBe(true)
      await expect.element(running.screen.getByText('Cancelling').first()).toBeVisible()

      const failed = await renderCompanionApp('/', { generateJobState: 'error' })
      await failed.screen.getByRole('button', { name: /Prompt text and improver/ }).click()
      await failed.screen.getByRole('textbox', { name: 'Subject', exact: true }).fill('failed portrait')
      await failed.screen.getByRole('button', { name: 'Generate' }).click()
      await expect.element(failed.screen.getByText('Sampler failed').first()).toBeVisible()
    })
})
