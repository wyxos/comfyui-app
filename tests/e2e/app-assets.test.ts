import { describe, expect, it, vi } from 'vitest'
import {
  BLACKLIST_STORAGE_KEY,
  DEFAULT_BASE_MODELS,
  PAGE_SIZE,
} from '../../src/views/assets/assetViewTypes'
import { createMockDownload, createMockModel } from '../fixtures/mockApi'
import { renderCompanionApp } from './appFlowTestUtils'

function clickHostButton(host: HTMLElement, label: string, index = 0) {
  const trigger = host.querySelectorAll<HTMLButtonElement>(`button[aria-label="${label}"]`)[index]
  expect(trigger).toBeDefined()
  trigger?.click()
}

function hostButtonByText(host: HTMLElement, label: string) {
  const trigger = Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find(
    (button) => button.textContent?.trim() === label,
  )
  expect(trigger).toBeDefined()
  return trigger as HTMLButtonElement
}

function openDownloadsSheet(host: HTMLElement) {
  clickHostButton(host, 'Open asset downloads')
}

describe('companion app e2e flows', () => {
  it('searches assets, opens a preview, hides a model, and queues a download', async () => {
    const { api, screen, host } = await renderCompanionApp('/assets?q=detail')

    await expect.element(screen.getByText('Mock Detail LoRA')).toBeVisible()
    const creatorLink = document.querySelector<HTMLAnchorElement>('a[href="/assets?username=atlasmaker"]')
    expect(creatorLink).not.toBeNull()
    expect(creatorLink?.target).toBe('_blank')
    expect(creatorLink?.textContent).toContain('atlasmaker')
    const initialSearchCall = api.calls.find((call) => call.path === '/api/civitai/models')
    expect(initialSearchCall?.search.has('sort')).toBe(false)

    await screen.getByRole('button', { name: 'Open Mock Detail LoRA image preview' }).click()
    const previewDialog = screen.getByRole('dialog', { name: 'Mock Detail LoRA image preview' })

    await expect.element(previewDialog).toBeVisible()
    await expect.element(previewDialog.getByText('sample prompt', { exact: true })).toBeVisible()
    await screen.getByRole('button', { name: 'Close image preview' }).click()

    await screen.getByRole('button', { name: 'Download for Mock Detail LoRA', exact: true }).click()

    openDownloadsSheet(host)
    await vi.waitFor(() => {
      expect(host.querySelector('[role="dialog"][aria-label="Asset downloads"]')).not.toBeNull()
    })
    expect(api.calls.some((call) => call.method === 'POST' && call.path === '/api/civitai/downloads')).toBe(true)

    clickHostButton(host, 'Pause download')

    await vi.waitFor(() => {
      expect(
        api.calls.some(
          (call) => call.method === 'POST' && call.path === '/api/civitai/downloads/101__201__301/pause',
        ),
      ).toBe(true)
    })

    clickHostButton(host, 'Close asset downloads')
    clickHostButton(host, 'Hide Mock Detail LoRA')
    await vi.waitFor(() => {
      expect(host.textContent).toContain('No Civitai models matched "detail".')
    })
  })

  it('searches assets by Civitai model and version id', async () => {
    const lookupModel = createMockModel({ id: 505, name: 'Lookup Detail LoRA' })
    lookupModel.modelVersions[0].id = 606
    const byModel = await renderCompanionApp('/assets?modelId=505', { models: [lookupModel] })

    await vi.waitFor(() => {
      expect(byModel.host.textContent).toContain('Lookup Detail LoRA')
    })
    const modelSearchCall = byModel.api.calls.find((call) => call.path === '/api/civitai/models')
    expect(modelSearchCall?.search.get('modelId')).toBe('505')
    expect(modelSearchCall?.search.get('query')).toBeNull()
    expect((byModel.host.querySelector('#asset-model-id') as HTMLInputElement | null)?.value).toBe('505')

    await byModel.cleanup()

    const byVersion = await renderCompanionApp('/assets?modelVersionId=606', { models: [lookupModel] })

    await vi.waitFor(() => {
      expect(byVersion.host.textContent).toContain('Lookup Detail LoRA')
    })
    const versionSearchCall = byVersion.api.calls.find((call) => call.path === '/api/civitai/models')
    expect(versionSearchCall?.search.get('modelVersionId')).toBe('606')
    expect(versionSearchCall?.search.get('modelId')).toBeNull()
    expect((byVersion.host.querySelector('#asset-version-id') as HTMLInputElement | null)?.value).toBe('606')
    await byVersion.cleanup()
  })

  it('searches assets by Civitai tag', async () => {
    const tagged = await renderCompanionApp('/assets?tag=mecha')

    await vi.waitFor(() => {
      expect(tagged.api.calls.some((call) => call.path === '/api/civitai/models')).toBe(true)
    })

    const searchCall = tagged.api.calls.find((call) => call.path === '/api/civitai/models')
    expect(searchCall?.search.get('tag')).toBe('mecha')
    expect(searchCall?.search.get('query')).toBeNull()
    expect((tagged.host.querySelector('#asset-tag') as HTMLInputElement | null)?.value).toBe('mecha')

    await tagged.cleanup()
  })

  it('loads locally hidden assets on a dedicated route and restores them', async () => {
    const hiddenModel = createMockModel({ id: 505, name: 'Hidden Detail LoRA' })
    const visibleModel = createMockModel({ id: 606, name: 'Visible Detail LoRA' })
    window.localStorage.setItem(BLACKLIST_STORAGE_KEY, JSON.stringify([505]))

    const hidden = await renderCompanionApp('/assets/hidden', {
      models: [hiddenModel, visibleModel],
    }, {
      preserveLocalStorage: true,
    })

    await vi.waitFor(() => {
      expect(
        hidden.api.calls.some(
          (call) => call.path === '/api/civitai/models' && call.search.get('ids') === '505',
        ),
      ).toBe(true)
    })
    await expect.element(hidden.screen.getByText('Hidden Detail LoRA')).toBeVisible()
    expect(hidden.host.textContent).not.toContain('Visible Detail LoRA')

    await hidden.screen.getByRole('button', { name: 'Show Hidden Detail LoRA' }).click()

    await vi.waitFor(() => {
      expect(window.localStorage.getItem(BLACKLIST_STORAGE_KEY)).toBe('[]')
      expect(hidden.host.textContent).toContain('No hidden Civitai models yet.')
    })
  })

  it('unhides a hidden model after its download is queued', async () => {
    const hiddenModel = createMockModel({ id: 505, name: 'Hidden Download LoRA' })
    window.localStorage.setItem(BLACKLIST_STORAGE_KEY, JSON.stringify([505]))

    const hidden = await renderCompanionApp('/assets/hidden', {
      models: [hiddenModel],
    }, {
      preserveLocalStorage: true,
    })

    await expect.element(hidden.screen.getByText('Hidden Download LoRA')).toBeVisible()
    await hidden.screen.getByRole('button', { name: 'Download for Hidden Download LoRA' }).click()

    await vi.waitFor(() => {
      expect(
        hidden.api.calls.some(
          (call) => call.method === 'POST' && call.path === '/api/civitai/downloads',
        ),
      ).toBe(true)
      expect(window.localStorage.getItem(BLACKLIST_STORAGE_KEY)).toBe('[]')
      expect(hidden.host.textContent).toContain('No hidden Civitai models yet.')
    })
  })

  it('fills hidden asset pages from later IDs when some hidden models cannot be loaded', async () => {
    const hiddenIds = Array.from({ length: 30 }, (_unused, index) => index + 1)
    const missingIds = new Set([5, 9, 13, 17])
    const hiddenModels = hiddenIds
      .filter((id) => !missingIds.has(id))
      .map((id) => createMockModel({ id, name: `Hidden Fill ${id}` }))
    window.localStorage.setItem(BLACKLIST_STORAGE_KEY, JSON.stringify(hiddenIds))

    const hidden = await renderCompanionApp('/assets/hidden', {
      models: hiddenModels,
    }, {
      preserveLocalStorage: true,
    })

    await vi.waitFor(() => {
      expect(hidden.host.querySelectorAll('article')).toHaveLength(PAGE_SIZE)
    })
    const hiddenSearchCalls = hidden.api.calls.filter((call) => call.path === '/api/civitai/models')

    expect(hiddenSearchCalls[0]?.search.get('ids')).toBe(hiddenIds.slice(0, PAGE_SIZE).join(','))
    expect(hiddenSearchCalls[1]?.search.get('ids')).toBe(hiddenIds.slice(PAGE_SIZE).join(','))
    expect(hidden.host.textContent).toContain('Hidden Fill 28')
    expect(hidden.host.textContent).not.toContain('Hidden Fill 29')
  })

  it('covers asset filters, empty results, route pagination, metadata, and download panel actions', async () => {
    const empty = await renderCompanionApp('/assets?q=missing', { models: [] })

    await vi.waitFor(() => {
      expect(empty.host.textContent).toContain('No Civitai models matched "missing".')
    })
    await empty.cleanup()

    const filtered = await renderCompanionApp('/assets?q=detail&types=LORA&nsfw=1&sort=Newest&period=Week&baseModels=all', {
      civitaiConfigured: true,
      models: [
        createMockModel(),
        createMockModel({ id: 102, name: 'Mock Detail Checkpoint', type: 'Checkpoint' }),
        createMockModel({
          id: 103,
          name: 'Mock Detail No Preview',
          modelVersions: [
            {
              id: 203,
              name: 'v1',
              baseModel: 'Pony',
              files: [
                {
                  id: 303,
                  name: 'noPreview.safetensors',
                  primary: true,
                  type: 'Model',
                  sizeKB: 1024,
                  downloadUrl: 'https://example.test/noPreview.safetensors',
                },
              ],
              images: [],
            },
          ],
        }),
      ],
      downloads: [
        createMockDownload({
          id: 'paused-download',
          state: 'paused',
          modelName: 'Paused model',
          progressPercent: 12,
        }),
        createMockDownload({
          id: 'complete-download',
          state: 'complete',
          modelName: 'Complete model',
        }),
        createMockDownload({
          id: 'error-download',
          state: 'error',
          modelName: 'Errored model',
          error: 'Download failed.',
        }),
      ],
    })

    await vi.waitFor(() => {
      expect(filtered.host.textContent).toContain('API key')
      expect(filtered.host.textContent).toContain('Mock Detail LoRA')
      expect(filtered.host.textContent).toContain('Mock Detail No Preview')
      expect(filtered.host.textContent).toContain('2 results')
      expect(filtered.host.textContent).toContain('Page 1')
      expect(filtered.host.textContent).toContain('No preview available')
    })
    expect(filtered.host.textContent).not.toContain('2 results · Page 1')
    const noPreviewButton = document.querySelector<HTMLButtonElement>(
      'button[aria-label="Mock Detail No Preview has no preview available"]',
    )
    expect(noPreviewButton?.disabled).toBe(true)
    expect(hostButtonByText(filtered.host, 'Latest')).toBeDefined()
    expect(hostButtonByText(filtered.host, 'Latest LoRA')).toBeDefined()
    expect(hostButtonByText(filtered.host, 'Latest checkpoints')).toBeDefined()
    expect(hostButtonByText(filtered.host, 'Highest rated checkpoints')).toBeDefined()

    const searchCall = filtered.api.calls.find((call) => call.path === '/api/civitai/models')
    expect(searchCall?.search.get('types')).toBe('LORA')
    expect(searchCall?.search.get('nsfw')).toBe('true')
    expect(searchCall?.search.get('sort')).toBe('Newest')
    expect(searchCall?.search.get('period')).toBe('Week')
    expect(searchCall?.search.get('primaryFileOnly')).toBeNull()
    expect(searchCall?.search.getAll('baseModels')).toEqual([])

    clickHostButton(filtered.host, 'Open Mock Detail LoRA image preview')
    await vi.waitFor(() => {
      expect(filtered.host.textContent).toContain('Negative prompt')
      expect(filtered.host.textContent).toContain('blur')
    })
    clickHostButton(filtered.host, 'Close image preview')

    openDownloadsSheet(filtered.host)
    await vi.waitFor(() => {
      expect(filtered.host.textContent).toContain('Paused model')
      expect(filtered.host.textContent).toContain('Errored model')
    })

    clickHostButton(filtered.host, 'Resume download')
    clickHostButton(filtered.host, 'Cancel download')
    clickHostButton(filtered.host, 'Clear finished downloads')
    clickHostButton(filtered.host, 'Close asset downloads')

    await vi.waitFor(() => {
      expect(
        filtered.api.calls.some(
          (call) => call.method === 'POST' && call.path === '/api/civitai/downloads/paused-download/resume',
        ),
      ).toBe(true)
      expect(filtered.api.calls.some((call) => call.method === 'POST' && call.path.endsWith('/cancel'))).toBe(true)
      expect(filtered.api.calls.some((call) => call.method === 'POST' && call.path === '/api/civitai/downloads/clear')).toBe(true)
    })

    const modelSearchCallsBeforePreset = filtered.api.calls.filter((call) => call.path === '/api/civitai/models').length
    hostButtonByText(filtered.host, 'Highest rated checkpoints').click()
    await vi.waitFor(() => {
      expect(filtered.api.calls.filter((call) => call.path === '/api/civitai/models').length).toBeGreaterThan(
        modelSearchCallsBeforePreset,
      )
    })
    const modelSearchCallsAfterPreset = filtered.api.calls.filter((call) => call.path === '/api/civitai/models')
    const presetSearchCall = modelSearchCallsAfterPreset[modelSearchCallsAfterPreset.length - 1]
    expect(presetSearchCall?.search.get('types')).toBe('Checkpoint')
    expect(presetSearchCall?.search.get('nsfw')).toBe('true')
    expect(presetSearchCall?.search.get('sort')).toBe('Highest Rated')
    expect(presetSearchCall?.search.get('period')).toBe('AllTime')
    expect(presetSearchCall?.search.get('primaryFileOnly')).toBe('true')
    expect(presetSearchCall?.search.get('query')).toBeNull()
    expect(presetSearchCall?.search.getAll('baseModels')).toEqual(DEFAULT_BASE_MODELS)
  })
})
