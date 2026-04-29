import { describe, expect, it, vi } from 'vitest'
import { renderCompanionApp } from './appFlowTestUtils'
import { createMockDownload, createMockJob } from '../fixtures/mockApi'

describe('companion app e2e flows', () => {
  it('navigates all user-visible routes and reference pages', async () => {
    const { screen } = await renderCompanionApp()

    await expect.element(screen.getByRole('link', { name: 'Generate' })).toBeVisible()

    await screen.getByRole('link', { name: 'Guidelines' }).click()
    await expect.element(screen.getByRole('heading', { name: 'Comfy Companion design system direction' })).toBeVisible()

    await screen.getByRole('link', { name: 'Assets' }).click()
    await expect.element(screen.getByRole('searchbox', { name: 'Search Civitai models' })).toBeVisible()

    await screen.getByRole('link', { name: 'Downloads' }).click()
    await expect.element(screen.getByRole('heading', { name: 'Downloads' })).toBeVisible()

    await screen.getByRole('link', { name: 'Library' }).click()
    await expect.element(screen.getByRole('heading', { name: 'Library' })).toBeVisible()

    await screen.getByRole('link', { name: 'Jobs' }).click()
    await expect.element(screen.getByRole('heading', { name: 'Generation jobs' })).toBeVisible()

    await screen.getByRole('link', { name: 'Settings' }).click()
    await expect.element(screen.getByRole('heading', { name: 'Local Civitai access' })).toBeVisible()
  })

  it('navigates to settings and saves/clears the Civitai API key', async () => {
    const { screen } = await renderCompanionApp()

    await expect.element(screen.getByRole('link', { name: 'Generate' })).toBeVisible()

    await screen.getByRole('link', { name: 'Settings' }).click()
    await expect.element(screen.getByRole('heading', { name: 'Local Civitai access' })).toBeVisible()
    await expect.element(screen.getByText('No Civitai API key saved yet.')).toBeVisible()

    await screen.getByLabelText('Civitai API key').fill('abcdef1234')
    await screen.getByRole('button', { name: 'Save' }).click()

    await expect.element(screen.getByText('Civitai API key saved to this machine.')).toBeVisible()
    await expect.element(screen.getByText('Saved, ending in 1234')).toBeVisible()

    await screen.getByRole('button', { name: 'Clear' }).click()

    await expect.element(screen.getByText('Civitai API key cleared from this machine.')).toBeVisible()
  })

  it('keeps the generate form tab in the URL and restores it on load', async () => {
    const { router, screen } = await renderCompanionApp('/?tab=prompt')

    await expect.element(screen.getByText('Prompt sections')).toBeVisible()
    expect(router.currentRoute.value.query.tab).toBe('prompt')

    await screen.getByRole('button', { name: /Config.*Size, seed, and CFG/ }).click()
    await vi.waitFor(() => {
      expect(router.currentRoute.value.query.tab).toBe('config')
    })
    await expect.element(screen.getByRole('spinbutton', { name: 'Width' })).toBeVisible()

    await screen.getByRole('button', { name: /Assets.*Checkpoints and LoRAs/ }).click()
    await vi.waitFor(() => {
      expect(router.currentRoute.value.query.tab).toBeUndefined()
    })
    await expect.element(screen.getByText('Checkpoint', { exact: true })).toBeVisible()
  })

  it('paginates generation jobs separately from the running queue panel', async () => {
    const now = Date.now()
    const jobs = Array.from({ length: 45 }, (_, index) => {
      const displayNumber = index + 1
      const suffix = String(displayNumber).padStart(2, '0')

      return {
        ...createMockJob({ prompt: `job prompt ${suffix}` }, 'complete'),
        promptId: `job-prompt-${suffix}`,
        checkpoint: `checkpoint-${suffix}.safetensors`,
        negativePrompt: displayNumber === 1 ? 'low quality, blur' : '',
        width: displayNumber === 1 ? 1024 : null,
        height: displayNumber === 1 ? 1536 : null,
        cfg: displayNumber === 1 ? 7 : null,
        denoise: displayNumber === 1 ? 0.62 : null,
        inputImageDisplayName: displayNumber === 1 ? 'input-reference.png' : null,
        loras: displayNumber === 1 ? [{ name: 'detailBoost.safetensors', strength: 0.65 }] : [],
        createdAt: now - index - 1200,
        updatedAt: now - index,
      }
    })

    const { screen } = await renderCompanionApp('/jobs', { jobs })

    await expect.element(screen.getByRole('heading', { name: 'Generation jobs' })).toBeVisible()
    await expect.element(screen.getByText('1-40 of 45')).toBeVisible()
    const firstJobCard = document.querySelector<HTMLButtonElement>(
      'button[aria-label="Open outputs for generation job job-prompt-01"]',
    )
    expect(firstJobCard).not.toBeNull()
    expect(firstJobCard?.className).toContain('flex-col')
    expect(firstJobCard?.querySelector('img')?.className).toContain('object-contain')
    expect(firstJobCard?.textContent).toContain('job-prompt-01')
    expect(firstJobCard?.textContent).not.toContain('job prompt 01')
    expect(firstJobCard?.textContent).not.toContain('checkpoint-01.safetensors')
    expect(document.querySelector('table')).toBeNull()

    firstJobCard?.click()
    await vi.waitFor(() => {
      expect(document.querySelector('[role="dialog"][aria-label="job-prompt-01 outputs preview"]')).not.toBeNull()
      expect(document.body.textContent).toContain('mock-output.png')
      expect(document.body.textContent).toContain('Negative prompt')
      expect(document.body.textContent).toContain('low quality, blur')
      expect(document.body.textContent).toContain('Generation settings')
      expect(document.body.textContent).toContain('1024 x 1536')
      expect(document.body.textContent).toContain('input-reference.png')
      expect(document.body.textContent).toContain('detailBoost.safetensors (0.65)')
    })
    document.querySelector<HTMLButtonElement>('button[aria-label="Close job outputs preview"]')?.click()

    await screen.getByRole('button', { name: 'Next generation jobs page' }).click()

    await expect.element(screen.getByText('41-45 of 45')).toBeVisible()
  })

  it('keeps library pagination usable with the header downloads sheet', async () => {
    const now = Date.now()
    const downloads = Array.from({ length: 46 }, (_, index) => {
      const displayNumber = index + 1
      const suffix = String(displayNumber).padStart(2, '0')
      const modelType = index % 2 === 0 ? 'LORA' : 'Checkpoint'
      const modelNsfw = displayNumber === 46

      return createMockDownload({
        id: `library-download-${suffix}`,
        state: 'complete',
        modelId: 1000 + displayNumber,
        modelName: `Library model ${suffix}`,
        modelType,
        modelNsfw,
        modelMetadata: { nsfw: modelNsfw },
        versionId: 2000 + displayNumber,
        versionName: `v${displayNumber}`,
        fileId: 3000 + displayNumber,
        fileName: `library_model_${suffix}.safetensors`,
        targetPath: `C:\\models\\${modelType.toLowerCase()}\\library_model_${suffix}.safetensors`,
        finishedAt: now - index,
        updatedAt: now - index,
        previewUrl: `/api/view?filename=library-${suffix}.png`,
      })
    })

    const { screen } = await renderCompanionApp('/library', { downloads })

    await expect.element(screen.getByRole('heading', { name: 'Library' })).toBeVisible()

    await vi.waitFor(() => {
      expect(document.querySelector<HTMLButtonElement>('[aria-label="Next library page"]')?.disabled).toBe(false)
    })
    expect(document.querySelector('button[aria-label="Open asset downloads"]')).not.toBeNull()
    expect(document.querySelector('aside[aria-label="Asset downloads"]')).toBeNull()
    expect(document.querySelector('footer')?.className).not.toContain('lg:pr-[25rem]')
    const firstLibraryCard = document.querySelector<HTMLButtonElement>('button[aria-label="Open Library model 01 preview"]')
    expect(firstLibraryCard?.className).toContain('flex-col')
    expect(firstLibraryCard?.querySelector('img')?.className).toContain('object-contain')
    expect(firstLibraryCard?.textContent).not.toContain('library_model_01.safetensors')
    expect(firstLibraryCard?.textContent).not.toContain('Downloaded')

    firstLibraryCard?.click()
    await vi.waitFor(() => {
      expect(document.querySelector('[role="dialog"][aria-label$="image preview"]')).not.toBeNull()
    })
    document.querySelector<HTMLButtonElement>('button[aria-label="Close image preview"]')?.click()

    document.querySelector<HTMLButtonElement>('[aria-label="Next library page"]')?.click()

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain('41-45 of 45')
      expect(document.body.textContent).not.toContain('Library model 46')
    })

    document.querySelector<HTMLInputElement>('input[aria-label="Include NSFW library models"]')?.click()
    await vi.waitFor(() => {
      expect(document.body.textContent).toContain('1-40 of 46')
    })
    document.querySelector<HTMLButtonElement>('[aria-label="Next library page"]')?.click()
    await vi.waitFor(() => {
      expect(document.body.textContent).toContain('41-46 of 46')
      expect(document.body.textContent).toContain('Library model 46')
      expect(document.body.textContent).toContain('NSFW')
    })
  })
})
