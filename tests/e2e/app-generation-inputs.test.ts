import { describe, expect, it, vi } from 'vitest'
import {
  createImageFile,
  createTransparentImageFile,
  dropFile,
  mockClipboardReadImages,
  pasteFile,
  renderCompanionApp,
} from './appFlowTestUtils'
import { checkpointName } from '../fixtures/mockApiData'

describe('companion app input and prompt flows', () => {
  function readFirstImagePixel(image: HTMLImageElement) {
    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 1
    const context = canvas.getContext('2d')
    if (!context) {
      throw new Error('Could not read image pixel.')
    }

    context.drawImage(image, 0, 0, 1, 1)
    return Array.from(context.getImageData(0, 0, 1, 1).data)
  }

  it('submits simple positive and negative prompt text when prompt text mode is selected', async () => {
      const { api, screen } = await renderCompanionApp('/?tab=prompt')

      await screen.getByRole('button', { name: 'Text', exact: true }).click()
      await screen.getByRole('textbox', { name: 'Positive prompt text' }).fill('simple portrait, blue hair')
      await screen.getByRole('textbox', { name: 'Negative prompt text' }).fill('bad hands, watermark')
      await screen.getByRole('button', { name: 'Generate' }).click()

      await vi.waitFor(() => {
        const generateCall = api.calls.find((call) => call.method === 'POST' && call.path === '/api/generate')
        expect(generateCall?.body).toMatchObject({
          prompt: 'simple portrait, blue hair',
          negativePrompt: 'bad hands, watermark',
        })
      })
    })

  it('flattens transparent input images onto the selected background color', async () => {
      const { api, screen } = await renderCompanionApp('/', {
        uploadInputImageNames: ['transparent-input.png'],
      })

      await screen.getByRole('button', { name: /Image.*Input image and denoise/ }).click()
      await screen.getByRole('switch', { name: 'Flatten transparent input background' }).click()
      const backgroundColorInput = document.querySelector<HTMLInputElement>(
        'input[aria-label="Input image alpha background color"]',
      )
      expect(backgroundColorInput).not.toBeNull()
      ;(backgroundColorInput as HTMLInputElement).value = '#00ff00'
      backgroundColorInput?.dispatchEvent(new Event('input', { bubbles: true }))

      const inputImageDropzone = document.querySelector<HTMLElement>(
        '[aria-label="Choose or paste input image"]',
      )
      expect(inputImageDropzone).not.toBeNull()
      dropFile(inputImageDropzone as HTMLElement, await createTransparentImageFile('transparent-source.png'))

      await expect.element(screen.getByText('transparent-source.png')).toBeVisible()
      await vi.waitFor(() => {
        expect(api.calls.filter((call) => call.method === 'POST' && call.path === '/api/upload-input-image')).toHaveLength(1)
      })

      const inputPreview = document.querySelector<HTMLImageElement>('img[alt="Selected input preview"]')
      await vi.waitFor(() => {
        expect(inputPreview?.complete).toBe(true)
        expect(inputPreview?.naturalWidth).toBeGreaterThan(0)
      })
      expect(readFirstImagePixel(inputPreview as HTMLImageElement)).toEqual([0, 255, 0, 255])
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

      await screen.getByRole('button', { name: /Prompt text and negative prompt/ }).click()
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

  it('applies prompt tag assistant suggestions into the compiled prompt', async () => {
      const { screen } = await renderCompanionApp('/?tab=prompt')

      const subjectInput = screen.getByRole('textbox', { name: 'Subject', exact: true })
      await subjectInput.fill('mik')

      await expect.element(screen.getByRole('option', { name: 'Add Hatsune Miku suggestion' })).toBeVisible()
      await screen.getByRole('option', { name: 'Add Hatsune Miku suggestion' }).click()

      await expect.element(screen.getByText(/hatsune miku, twintails, turquoise hair/)).toBeVisible()

      await screen.getByRole('textbox', { name: 'Details' }).fill('blue eyes')
      await expect.element(screen.getByRole('option', { name: 'Add blue_eyes suggestion' })).toBeVisible()
    })

  it('edits prompt tags on double click and drags them between fields', async () => {
      const { screen } = await renderCompanionApp('/')

      await screen.getByRole('button', { name: /Prompt text and negative prompt/ }).click()
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

  it('surfaces generation dependency, validation, running, cancel, and failed states', async () => {
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

      const running = await renderCompanionApp('/', { generateJobState: 'running' })
      await running.screen.getByRole('button', { name: /Prompt text and negative prompt/ }).click()
      await running.screen.getByRole('textbox', { name: 'Subject', exact: true }).fill('running portrait')
      await running.screen.getByRole('button', { name: 'Generate' }).click()
      await expect.element(running.screen.getByText('Sampling', { exact: true }).first()).toBeVisible()
      await running.screen.getByRole('button', { name: 'Cancel' }).click()
      expect(running.api.calls.some((call) => call.method === 'POST' && call.path === '/api/jobs/prompt-1/cancel')).toBe(true)
      await expect.element(running.screen.getByText('Cancelling').first()).toBeVisible()

      const failed = await renderCompanionApp('/', { generateJobState: 'error' })
      await failed.screen.getByRole('button', { name: /Prompt text and negative prompt/ }).click()
      await failed.screen.getByRole('textbox', { name: 'Subject', exact: true }).fill('failed portrait')
      await failed.screen.getByRole('button', { name: 'Generate' }).click()
      await expect.element(failed.screen.getByText('Sampler failed').first()).toBeVisible()
    })
})
