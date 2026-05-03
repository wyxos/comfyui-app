import { describe, expect, it, vi } from 'vitest'
import {
  createHistoryJob,
  createImageFile,
  createSizedImageFile,
  createJobOutput,
  dropFile,
  mockClipboardReadImages,
  pasteFile,
  renderCompanionApp,
  uploadFile,
} from './appFlowTestUtils'
import { FORM_STATE_STORAGE_KEY } from '../../src/views/home/homeConstants'
import { checkpointName, loraName, sameArchitectureLoraName } from '../fixtures/mockApiData'

describe('companion app e2e flows', () => {
  it('loads mocked generation dependencies, improves a prompt, and submits generation', async () => {
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
      expect((generateCall?.body as any).controlNets).toBeUndefined()
      const submittedControlNet = (generateCall?.body as any).checkpoints[0].controlNets[0]
      expect(typeof submittedControlNet.strength).toBe('number')
      expect(typeof submittedControlNet.startPercent).toBe('number')
      expect(typeof submittedControlNet.endPercent).toBe('number')

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

      await screen.getByRole('button', { name: /Prompt text and improver/ }).click()
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

      await screen.getByRole('button', { name: /Size, seed, and CFG/ }).click()
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

      await screen.getByRole('button', { name: /Size, seed, and CFG/ }).click()
      await expect.element(screen.getByRole('spinbutton', { name: 'Width' })).toHaveValue(777)
      await expect.element(screen.getByRole('spinbutton', { name: 'Height' })).toHaveValue(913)
    })

  it('pastes clipboard images into image dropzones', async () => {
      const { api, screen } = await renderCompanionApp('/', {
        uploadInputImageNames: ['pasted-input.png', 'pasted-control.png'],
      })

      await screen.getByRole('button', { name: /Image.*Input image and denoise/ }).click()
      const inputImageDropzone = document.querySelector<HTMLElement>('[aria-label="Choose or paste input image"]')
      expect(inputImageDropzone).not.toBeNull()
      pasteFile(window, createImageFile('clipboard-input.png'))

      await expect.element(screen.getByText('clipboard-input.png')).toBeVisible()
      await vi.waitFor(() => {
        expect(api.calls.filter((call) => call.method === 'POST' && call.path === '/api/upload-input-image')).toHaveLength(1)
      })

      await screen.getByRole('button', { name: /Assets.*Checkpoints and LoRAs/ }).click()
      await screen.getByLabelText(`Add ControlNet for ${checkpointName}`).click()
      await screen.getByRole('button', { name: 'mistoLine_rank256.safetensors' }).click()
      const controlNetDropzone = document.querySelector<HTMLElement>(
        '[aria-label="Choose or paste ControlNet image"]',
      )
      expect(controlNetDropzone).not.toBeNull()
      controlNetDropzone?.dispatchEvent(new PointerEvent('pointerenter', { bubbles: true }))
      pasteFile(window, createImageFile('clipboard-control.png'))

      await expect.element(screen.getByText('clipboard-control.png')).toBeVisible()
      await vi.waitFor(() => {
        expect(api.calls.filter((call) => call.method === 'POST' && call.path === '/api/upload-input-image')).toHaveLength(2)
      })
    })

  it('pastes clipboard images from visible dropzone CTAs', async () => {
      const { api, screen } = await renderCompanionApp('/', {
        uploadInputImageNames: ['cta-input.png', 'cta-control.png'],
      })

      await screen.getByRole('button', { name: /Image.*Input image and denoise/ }).click()
      const inputClipboardRead = mockClipboardReadImages([createImageFile('clipboard-input-cta.png')])

      await screen.getByRole('button', { name: 'Paste input image from clipboard' }).click()

      await vi.waitFor(() => {
        expect(inputClipboardRead).toHaveBeenCalled()
      })
      await expect.element(screen.getByText('clipboard-input-cta.png')).toBeVisible()
      await vi.waitFor(() => {
        expect(api.calls.filter((call) => call.method === 'POST' && call.path === '/api/upload-input-image')).toHaveLength(1)
      })

      await screen.getByRole('button', { name: /Assets.*Checkpoints and LoRAs/ }).click()
      await screen.getByLabelText(`Add ControlNet for ${checkpointName}`).click()
      await screen.getByRole('button', { name: 'mistoLine_rank256.safetensors' }).click()
      const controlClipboardRead = mockClipboardReadImages([createImageFile('clipboard-control-cta.png')])

      await screen.getByRole('button', { name: 'Paste ControlNet image from clipboard' }).click()

      await vi.waitFor(() => {
        expect(controlClipboardRead).toHaveBeenCalled()
      })
      await expect.element(screen.getByText('clipboard-control-cta.png')).toBeVisible()
      await vi.waitFor(() => {
        expect(api.calls.filter((call) => call.method === 'POST' && call.path === '/api/upload-input-image')).toHaveLength(2)
      })
    })

  it('auto-enables disabled image controls when files are dropped', async () => {
      const { api, screen } = await renderCompanionApp('/', {
        uploadInputImageNames: ['initial-input.png', 'dropped-input.png', 'dropped-control.png'],
      })

      await screen.getByRole('button', { name: /Image.*Input image and denoise/ }).click()
      const inputImageDropzone = document.querySelector<HTMLElement>('[aria-label="Choose or paste input image"]')
      const inputImageSwitch = document.querySelector<HTMLButtonElement>('[aria-label="Use input image"]')
      expect(inputImageDropzone).not.toBeNull()
      expect(inputImageSwitch).not.toBeNull()

      dropFile(inputImageDropzone as HTMLElement, createImageFile('initial-source.png'))
      await expect.element(screen.getByText('initial-source.png')).toBeVisible()
      await vi.waitFor(() => {
        expect(api.calls.filter((call) => call.method === 'POST' && call.path === '/api/upload-input-image')).toHaveLength(1)
        expect(inputImageSwitch?.getAttribute('aria-checked')).toBe('true')
      })

      await screen.getByRole('switch', { name: 'Use input image' }).click()
      await vi.waitFor(() => {
        expect(inputImageSwitch?.getAttribute('aria-checked')).toBe('false')
      })

      dropFile(inputImageDropzone as HTMLElement, createImageFile('dropped-source.png'))
      await expect.element(screen.getByText('dropped-source.png')).toBeVisible()
      await vi.waitFor(() => {
        expect(api.calls.filter((call) => call.method === 'POST' && call.path === '/api/upload-input-image')).toHaveLength(2)
        expect(inputImageSwitch?.getAttribute('aria-checked')).toBe('true')
      })

      await screen.getByRole('button', { name: /Assets.*Checkpoints and LoRAs/ }).click()
      await screen.getByLabelText(`Add ControlNet for ${checkpointName}`).click()
      await screen.getByRole('button', { name: 'mistoLine_rank256.safetensors' }).click()
      const controlNetDropzone = document.querySelector<HTMLElement>(
        '[aria-label="Choose or paste ControlNet image"]',
      )
      const controlNetSwitch = document.querySelector<HTMLButtonElement>(
        'button[role="switch"][aria-label="Enable mistoLine_rank256.safetensors"]',
      )
      expect(controlNetDropzone).not.toBeNull()
      expect(controlNetSwitch).not.toBeNull()
      await screen.getByRole('switch', { name: 'Enable mistoLine_rank256.safetensors' }).click()
      await vi.waitFor(() => {
        expect(controlNetSwitch?.getAttribute('aria-checked')).toBe('false')
      })

      dropFile(controlNetDropzone as HTMLElement, createImageFile('dropped-control-source.png'))
      await expect.element(screen.getByText('dropped-control-source.png')).toBeVisible()
      await vi.waitFor(() => {
        expect(api.calls.filter((call) => call.method === 'POST' && call.path === '/api/upload-input-image')).toHaveLength(3)
        expect(controlNetSwitch?.getAttribute('aria-checked')).toBe('true')
      })
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

  it('disables prompt tags with one click and omits them from generation', async () => {
      const { api, screen } = await renderCompanionApp('/')

      await screen.getByRole('button', { name: /Prompt text and improver/ }).click()
      await screen.getByRole('textbox', { name: 'Subject', exact: true }).fill('blue hair, red eyes')

      await vi.waitFor(() => {
        expect(document.querySelector('[aria-label="Disable blue hair tag"]')).not.toBeNull()
        expect(document.querySelector('[aria-label="Disable red eyes tag"]')).not.toBeNull()
      })

      await screen.getByRole('button', { name: 'Disable blue hair tag' }).click()

      await vi.waitFor(() => {
        const disabledTag = document.querySelector<HTMLElement>('[aria-label="Enable blue hair tag"]')
        expect(disabledTag).not.toBeNull()
        expect(disabledTag?.className).toContain('bg-primary-foreground/14')
        expect(screen.getByText('red eyes', { exact: true })).toBeTruthy()
      })

      await screen.getByRole('button', { name: 'Generate' }).click()

      await vi.waitFor(() => {
        const generateCall = api.calls.find((call) => call.method === 'POST' && call.path === '/api/generate')
        expect(generateCall?.body).toMatchObject({ prompt: 'red eyes' })
      })
    })

  it('edits prompt tags on double click and drags them between fields', async () => {
      const { screen } = await renderCompanionApp('/')

      await screen.getByRole('button', { name: /Prompt text and improver/ }).click()
      const subjectInput = screen.getByRole('textbox', { name: 'Subject', exact: true })
      await subjectInput.fill('blue hair')
      document.querySelector<HTMLInputElement>('input[aria-label="Subject"]')?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
      )
      const negativeInput = screen.getByRole('textbox', { name: 'Negative prompt', exact: true })
      await negativeInput.fill('blur')
      document.querySelector<HTMLInputElement>('input[aria-label="Negative prompt"]')?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
      )

      const getDraggableTag = (text: string) =>
        Array.from(document.querySelectorAll<HTMLElement>('span[draggable="true"]'))
          .find((tag) => tag.textContent?.trim() === text)

      getDraggableTag('blue hair')?.dispatchEvent(
        new MouseEvent('dblclick', { bubbles: true, cancelable: true }),
      )
      await vi.waitFor(() => {
        expect(document.querySelector<HTMLInputElement>('input[aria-label="Edit blue hair tag"]')).not.toBeNull()
      })
      const editInput = document.querySelector<HTMLInputElement>('input[aria-label="Edit blue hair tag"]')
      if (!editInput) {
        throw new Error('Prompt tag edit input was not rendered.')
      }
      editInput.value = 'purple hair'
      editInput.dispatchEvent(new Event('input', { bubbles: true }))
      editInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))

      await vi.waitFor(() => {
        expect(getDraggableTag('purple hair')).not.toBeUndefined()
      })

      const purpleHairTag = getDraggableTag('purple hair')
      const subjectDropTarget = document.querySelector<HTMLElement>('[data-prompt-drop-target="subject"]')
      const negativeDropTarget = document.querySelector<HTMLElement>('[data-prompt-drop-target="negative"]')
      expect(purpleHairTag).not.toBeUndefined()
      expect(subjectDropTarget).not.toBeNull()
      expect(negativeDropTarget).not.toBeNull()
      const dataTransfer = new DataTransfer()
      purpleHairTag?.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer }))
      negativeDropTarget?.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer }))
      negativeDropTarget?.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }))
      purpleHairTag?.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer }))

      await vi.waitFor(() => {
        expect(subjectDropTarget?.textContent).not.toContain('purple hair')
        expect(negativeDropTarget?.textContent).toContain('purple hair')
        expect(negativeDropTarget?.textContent).toContain('blur')
      })
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
