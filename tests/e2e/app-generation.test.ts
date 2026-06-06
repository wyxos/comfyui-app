import { describe, expect, it, vi } from 'vitest'
import {
  createHistoryJob,
  createImageFile,
  createSizedImageFile,
  createJobOutput,
  renderCompanionApp,
  uploadFile,
} from './appFlowTestUtils'
import { FORM_STATE_STORAGE_KEY } from '../../src/views/home/homeConstants'
import { checkpointName, loraName, sameArchitectureLoraName } from '../fixtures/mockApiData'

type GenerateRequestBody = {
  controlNets?: unknown
  checkpoints?: Array<{
    controlNets?: Array<{
      strength?: unknown
      startPercent?: unknown
      endPercent?: unknown
    }>
  }>
}

describe('companion app e2e flows', () => {
  it('loads mocked generation dependencies and submits generation', async () => {
      const { api, screen } = await renderCompanionApp()

      await expect.element(screen.getByText('waiIllustriousSDXL_v160.safetensors')).toBeVisible()
      await expect.element(screen.getByLabelText('Add LoRA for waiIllustriousSDXL_v160.safetensors')).toBeVisible()

      await screen.getByLabelText('Add checkpoint').click()
      await screen.getByRole('button', { name: 'animaPencilXL.safetensors' }).click()

      await screen.getByLabelText('Add LoRA for waiIllustriousSDXL_v160.safetensors').click()
      await expect.element(
        screen.getByRole('button', { name: new RegExp(`${sameArchitectureLoraName}.*Same SDXL architecture`) }),
      ).toBeVisible()
      await expect.element(screen.getByRole('button', { name: /mysteryStyle\.safetensors.*Unverified/ })).toBeVisible()
      expect(document.body.textContent).not.toContain('animaSketch.safetensors')
      await screen.getByRole('button', { name: 'detailBoost.safetensors' }).click()

      await screen.getByLabelText('Add LoRA for animaPencilXL.safetensors').click()
      await screen.getByRole('button', { name: 'animaSketch.safetensors' }).click()

      await screen.getByLabelText(`Add ControlNet for ${checkpointName}`).click()
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
      await screen.getByRole('button', { name: 'Copy ControlNet preview image to clipboard' }).click()
      await vi.waitFor(() => {
        expect(navigator.clipboard.write).toHaveBeenCalled()
      })
      expect(api.calls.some((call) => call.method === 'GET' && call.path === '/api/view')).toBe(true)
      await expect.element(screen.getByText('Copied preview image')).toBeVisible()
      const firstPreviewCall = api.calls.find((call) => call.method === 'POST' && call.path === '/api/controlnet-preview')
      expect(firstPreviewCall?.body).toMatchObject({
        preprocessor: 'lineart',
        lineartPolarity: 'black-lines',
        resolution: 1024,
      })
      await screen.getByRole('button', { name: 'Use white lines on black background' }).click()
      await vi.waitFor(() => {
        expect(api.calls.filter((call) => call.method === 'POST' && call.path === '/api/controlnet-preview').length).toBeGreaterThan(1)
      })
      const polarityPreviewCall = api.calls
        .filter((call) => call.method === 'POST' && call.path === '/api/controlnet-preview')
        .at(-1)
      expect(polarityPreviewCall?.body).toMatchObject({ lineartPolarity: 'white-lines' })
      const previewCallCount = api.calls.filter((call) => call.method === 'POST' && call.path === '/api/controlnet-preview').length
      await screen.getByRole('button', { name: 'Use black lines on white background' }).click()
      await vi.waitFor(() => {
        expect(api.calls.filter((call) => call.method === 'POST' && call.path === '/api/controlnet-preview').length).toBeGreaterThan(previewCallCount)
      })
      const restoredPolarityPreviewCall = api.calls
        .filter((call) => call.method === 'POST' && call.path === '/api/controlnet-preview')
        .at(-1)
      expect(restoredPolarityPreviewCall?.body).toMatchObject({ lineartPolarity: 'black-lines' })
      const restoredPreviewCallCount = api.calls.filter((call) => call.method === 'POST' && call.path === '/api/controlnet-preview').length
      await screen.getByRole('button', { name: 'Use output size for ControlNet resolution' }).click()
      await vi.waitFor(() => {
        expect(api.calls.filter((call) => call.method === 'POST' && call.path === '/api/controlnet-preview').length).toBeGreaterThan(restoredPreviewCallCount)
      })
      await screen.getByRole('button', { name: /Size, steps, seed, and CFG/ }).click()
      const widthInput = screen.getByRole('spinbutton', { name: 'Width' })
      const heightInput = screen.getByRole('spinbutton', { name: 'Height' })
      const stepsInput = screen.getByRole('spinbutton', { name: 'Steps' })
      await expect.element(widthInput).toHaveValue(1024)
      await expect.element(heightInput).toHaveValue(1024)
      await widthInput.fill('1920')
      await heightInput.fill('1080')
      await stepsInput.fill('28')
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

      await screen.getByRole('button', { name: /Prompt text and negative prompt/ }).click()
      const subjectPrompt = screen.getByRole('textbox', { name: 'Subject', exact: true })
      await subjectPrompt.fill('sunlit cyberpunk portrait')
      const subjectPromptInput = document.querySelector<HTMLInputElement>('input[aria-label="Subject"]')
      subjectPromptInput?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
      )
      for (let index = 0; index < 5; index += 1) {
        await screen.getByRole('button', { name: 'Increase sunlit cyberpunk portrait weight' }).click()
      }

      await screen.getByRole('button', { name: 'Generate' }).click()

      await expect.element(screen.getByText(/outputs ready/)).toBeVisible()
      const generateCall = api.calls.find((call) => call.method === 'POST' && call.path === '/api/generate')
      expect(generateCall?.body).toMatchObject({
        prompt: '(sunlit cyberpunk portrait:1.5)',
        steps: 28,
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
            controlNets: [
              {
                model: 'mistoLine_rank256.safetensors',
                inputImageName: 'mock-upload.png',
                preprocessor: 'lineart',
                lineartPolarity: 'black-lines',
                previewResolution: 1920,
                strength: 1,
                startPercent: 0,
                endPercent: 1,
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
      })
      const generateBody = generateCall?.body as GenerateRequestBody | undefined
      const submittedControlNet = generateBody?.checkpoints?.[0]?.controlNets?.[0]
      expect(generateBody?.controlNets).toBeUndefined()
      expect(typeof submittedControlNet?.strength).toBe('number')
      expect(typeof submittedControlNet?.startPercent).toBe('number')
      expect(typeof submittedControlNet?.endPercent).toBe('number')

      await screen.getByRole('button', { name: 'mock-output.png' }).click()
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('C:\\mock\\mock-output.png')

      await screen.getByRole('button', { name: 'Open parent folder' }).click()
      expect(api.calls.some((call) => call.method === 'POST' && call.path === '/api/open-parent-folder')).toBe(true)
    })

  it('adds a checkpoint-scoped ControlNet from the checkpoint card', async () => {
      const onlyControlNet = {
        name: 'mistoLine_rank256.safetensors',
        displayName: 'mistoLine_rank256.safetensors',
      }
      const { screen } = await renderCompanionApp('/', {
        controlNets: [onlyControlNet],
      })

      await screen.getByRole('button', { name: /Prompt text and negative prompt/ }).click()
      await screen.getByRole('textbox', { name: 'Subject', exact: true }).fill('line guided portrait')

      await screen.getByRole('button', { name: /Assets.*Checkpoints and LoRAs/ }).click()
      await screen.getByLabelText(`Add ControlNet for ${checkpointName}`).click()
      await screen.getByRole('button', { name: 'mistoLine_rank256.safetensors' }).click()
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

  it('retains a checkpoint-scoped ControlNet model after the app remounts', async () => {
      const firstRender = await renderCompanionApp()

      await firstRender.screen.getByLabelText(`Add ControlNet for ${checkpointName}`).click()
      await firstRender.screen.getByRole('button', { name: 'mistoLine_rank256.safetensors' }).click()

      await vi.waitFor(() => {
        const persisted = JSON.parse(window.localStorage.getItem(FORM_STATE_STORAGE_KEY) ?? '{}')
        expect(persisted.selectedCheckpoints?.[0]?.controlNets?.[0]?.model).toBe(
          'mistoLine_rank256.safetensors',
        )
      })

      await firstRender.cleanup()

      const secondRender = await renderCompanionApp('/', {}, { preserveLocalStorage: true })

      await expect.element(secondRender.screen.getByText('mistoLine_rank256.safetensors').first()).toBeVisible()
      await vi.waitFor(() => {
        const persisted = JSON.parse(window.localStorage.getItem(FORM_STATE_STORAGE_KEY) ?? '{}')
        expect(persisted.selectedCheckpoints?.[0]?.controlNets?.[0]?.model).toBe(
          'mistoLine_rank256.safetensors',
        )
      })
    })

  it('auto-enables a disabled checkpoint when adding a LoRA to it', async () => {
      const { screen } = await renderCompanionApp()

      await screen.getByRole('switch', { name: `Disable ${checkpointName}` }).click()
      await expect.element(screen.getByRole('switch', { name: `Enable ${checkpointName}` })).toBeVisible()

      await screen.getByLabelText(`Add LoRA for ${checkpointName}`).click()
      await screen.getByRole('button', { name: loraName }).click()

      await expect.element(screen.getByRole('switch', { name: `Disable ${checkpointName}` })).toBeVisible()
      await expect.element(screen.getByRole('switch', { name: `Disable ${loraName}` })).toBeVisible()
    })

  it('uses job output URLs for capped history preview stacks', async () => {
      const outputs = Array.from({ length: 5 }, (_, index) =>
        createJobOutput(`history-output-${index + 1}.png`, index + 1),
      )
      const { api, screen } = await renderCompanionApp('/', {
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

      vi.spyOn(window, 'confirm').mockReturnValue(true)
      await screen.getByRole('button', { name: /Delete historyCheckpoint\.safetensors from history and remove generated files/ }).click()
      await vi.waitFor(() => {
        const deleteCall = api.calls.find((call) => call.method === 'DELETE' && call.path === '/api/jobs/history-prompt-1')
        expect(deleteCall?.search.get('deleteOutputs')).toBe('1')
      })
      await expect.element(screen.getByText('No jobs submitted yet.')).toBeVisible()
    })

  it('uses generated output context menu actions as image and ControlNet inputs', async () => {
      const { api, screen } = await renderCompanionApp('/', {
        jobs: [createHistoryJob([createJobOutput('context-output.png', 1)])],
        uploadInputImageNames: ['context-image-input.png', 'context-control-input.png'],
      })

      const generatedImage = () =>
        document.querySelector<HTMLImageElement>('img[src*="context-output.png"]')

      await vi.waitFor(() => {
        expect(generatedImage()).not.toBeNull()
      })

      generatedImage()?.dispatchEvent(
        new MouseEvent('contextmenu', {
          bubbles: true,
          cancelable: true,
          clientX: 48,
          clientY: 48,
          button: 2,
        }),
      )
      await vi.waitFor(() => {
        expect(document.querySelector('[role="menuitem"]')).not.toBeNull()
      })
      expect(
        Array.from(document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')).some((button) =>
          button.textContent?.includes('Copy image'),
        ),
      ).toBe(true)
      ;(Array.from(document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'))
        .find((button) => button.textContent?.includes('Copy image')) as HTMLButtonElement).click()

      await vi.waitFor(() => {
        expect(navigator.clipboard.write).toHaveBeenCalled()
      })
      expect(api.calls.some((call) => call.method === 'GET' && call.path === '/api/view')).toBe(true)
      await vi.waitFor(() => {
        expect(document.body.textContent).toContain('Copied image')
      })

      generatedImage()?.dispatchEvent(
        new MouseEvent('contextmenu', {
          bubbles: true,
          cancelable: true,
          clientX: 48,
          clientY: 48,
          button: 2,
        }),
      )
      await vi.waitFor(() => {
        expect(
          Array.from(document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')).some((button) =>
            button.textContent?.includes('Use as image input'),
          ),
        ).toBe(true)
      })
      ;(Array.from(document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'))
        .find((button) => button.textContent?.includes('Use as image input')) as HTMLButtonElement).click()

      await vi.waitFor(() => {
        expect(api.calls.filter((call) => call.method === 'POST' && call.path === '/api/upload-input-image')).toHaveLength(1)
      })
      await expect.element(
        screen.getByLabelText('Choose or paste input image').getByText('context-output.png'),
      ).toBeVisible()

      generatedImage()?.dispatchEvent(
        new MouseEvent('contextmenu', {
          bubbles: true,
          cancelable: true,
          clientX: 56,
          clientY: 56,
          button: 2,
        }),
      )
      await vi.waitFor(() => {
        expect(
          Array.from(document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')).some((button) =>
            button.textContent?.includes('Use as ControlNet input'),
          ),
        ).toBe(true)
      })
      ;(Array.from(document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'))
        .find((button) => button.textContent?.includes('Use as ControlNet input')) as HTMLButtonElement).click()

      await vi.waitFor(() => {
        expect(api.calls.filter((call) => call.method === 'POST' && call.path === '/api/upload-input-image')).toHaveLength(2)
      })
      await expect.element(
        screen.getByLabelText('Choose or paste ControlNet image').getByText('context-output.png'),
      ).toBeVisible()
      await expect.element(screen.getByText('mock-controlnet-preview.png')).toBeVisible()
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

      await screen.getByRole('button', { name: /Prompt text and negative prompt/ }).click()
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

  it('copies selected image pixel dimensions into the config size fields', async () => {
      const { api, screen } = await renderCompanionApp('/', {
        uploadInputImageNames: ['scan-source.png', 'control-source.png'],
      })

      await screen.getByRole('button', { name: /Image.*Input image and denoise/ }).click()
      const inputImageInput = document.querySelector<HTMLInputElement>('input[type="file"]:not([aria-label])')
      expect(inputImageInput).not.toBeNull()
      uploadFile(inputImageInput as HTMLInputElement, await createSizedImageFile('scan-source.png', 1501, 1620))

      await expect.element(screen.getByText('Source image detected at 1501 x 1620.')).toBeVisible()
      await screen.getByRole('button', { name: 'Use source image resolution' }).click()

      await screen.getByRole('button', { name: /Size, steps, seed, and CFG/ }).click()
      await expect.element(screen.getByRole('spinbutton', { name: 'Width' })).toHaveValue(1501)
      await expect.element(screen.getByRole('spinbutton', { name: 'Height' })).toHaveValue(1620)

      await screen.getByRole('button', { name: /Assets.*Checkpoints and LoRAs/ }).click()
      await screen.getByLabelText(`Add ControlNet for ${checkpointName}`).click()
      await screen.getByRole('button', { name: 'mistoLine_rank256.safetensors' }).click()
      const controlNetImageInput = document.querySelector<HTMLInputElement>(
        'input[aria-label="ControlNet image file"]',
      )
      expect(controlNetImageInput).not.toBeNull()
      uploadFile(
        controlNetImageInput as HTMLInputElement,
        await createSizedImageFile('control-source.png', 777, 913),
      )

      await expect.element(screen.getByText('777 x 913')).toBeVisible()
      await expect.element(screen.getByText('mock-controlnet-preview.png')).toBeVisible()
      const previewCallCount = api.calls.filter((call) => call.method === 'POST' && call.path === '/api/controlnet-preview').length
      await screen.getByRole('button', { name: 'Use ControlNet source image resolution' }).click()
      expect(api.calls.filter((call) => call.method === 'POST' && call.path === '/api/controlnet-preview')).toHaveLength(
        previewCallCount,
      )
      await expect.element(screen.getByText('mock-controlnet-preview.png')).toBeVisible()

      await screen.getByRole('button', { name: /Size, steps, seed, and CFG/ }).click()
      await expect.element(screen.getByRole('spinbutton', { name: 'Width' })).toHaveValue(777)
      await expect.element(screen.getByRole('spinbutton', { name: 'Height' })).toHaveValue(913)
    })
})
