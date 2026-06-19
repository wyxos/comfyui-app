// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { emblaApi } = vi.hoisted(() => ({
  emblaApi: {
    canScrollPrev: vi.fn(() => false),
    canScrollNext: vi.fn(() => true),
    selectedScrollSnap: vi.fn(() => 0),
    scrollPrev: vi.fn(),
    scrollNext: vi.fn(),
    scrollTo: vi.fn(),
    reInit: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  },
}))

vi.mock('embla-carousel-vue', async () => {
  const { ref } = await import('vue')
  return {
    default: () => [ref(null), ref(emblaApi)],
  }
})

function atlasSettingsResponse() {
  return new Response(JSON.stringify({
    ok: true,
    includeNsfw: false,
    blurNsfwModels: true,
    blurNsfwMediaLevel: 4,
    atlasConfigured: true,
    atlasUrl: 'https://atlas.test',
    atlasKeyConfigured: true,
    atlasKeyPreview: 'Saved, ending in 1234',
  }), { status: 200, headers: { 'Content-Type': 'application/json' } })
}

function createModel() {
  return {
    id: 101,
    name: 'Atlas reactions model',
    type: 'Checkpoint',
    modelVersions: [
      {
        id: 201,
        name: 'Latest version',
        baseModel: 'Illustrious',
        images: [
          {
            id: 800,
            url: 'https://example.test/version-original.jpg',
            type: 'image',
            nsfw: false,
            width: 768,
            height: 1024,
          },
        ],
      },
    ],
    feedImages: [],
  }
}

async function mountModal(fetchMock: ReturnType<typeof vi.fn>) {
  vi.stubGlobal('fetch', fetchMock)

  const { default: AssetPreviewModal } = await import('../../src/components/asset-preview/AssetPreviewModal.vue')
  const wrapper = mount(AssetPreviewModal, {
    attachTo: document.body,
    global: {
      stubs: {
        RouterLink: { template: '<a><slot /></a>' },
      },
    },
    props: {
      open: true,
      model: createModel(),
    },
  })

  await flushPromises()

  return wrapper
}

function requestBody(call: unknown[] | undefined) {
  return JSON.parse(String((call?.[1] as RequestInit | undefined)?.body))
}

function clickDialogButton(label: string) {
  const button = Array.from(document.body.querySelectorAll('button'))
    .find((candidate) => candidate.textContent?.trim() === label)
  expect(button).toBeTruthy()
  ;(button as HTMLButtonElement).click()
}

describe('AssetPreviewModal Atlas existing reaction prompt', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('prompts before updating an already reacted Atlas preview', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://127.0.0.1')
      if (url.pathname === '/api/settings/app') {
        return atlasSettingsResponse()
      }

      if (url.pathname === '/api/atlas/civitai/status') {
        return new Response(JSON.stringify({
          ok: true,
          configured: true,
          items: [{
            request_id: 'civitai:800',
            exists: true,
            file_id: 88,
            reaction: 'love',
            reacted_at: '2026-06-18T08:00:00Z',
            filtered: false,
          }],
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }

      if (url.pathname === '/api/atlas/civitai/reactions') {
        return new Response(JSON.stringify({
          configured: true,
          file: { id: 88, source: 'CivitAI', source_id: '800' },
          reaction: { type: 'like' },
          download: { requested: false },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }

      return new Response(JSON.stringify({ items: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    })

    const wrapper = await mountModal(fetchMock)

    await wrapper
      .get('[data-test="asset-preview-main-atlas-reactions"]')
      .get('button[aria-label="Like in Atlas"]')
      .trigger('click')
    await flushPromises()

    expect(
      fetchMock.mock.calls.filter((call) => String(call[0]) === '/api/atlas/civitai/reactions'),
    ).toHaveLength(0)
    expect(document.body.textContent).toContain('Already reacted in Atlas')

    clickDialogButton('Update reaction')
    await flushPromises()

    const reactionCall = fetchMock.mock.calls.find((call) => String(call[0]) === '/api/atlas/civitai/reactions')
    expect(requestBody(reactionCall)).toMatchObject({
      type: 'like',
      download_behavior: 'skip',
      item: expect.objectContaining({ id: 800, modelId: 101, modelVersionId: 201 }),
    })
  })

  it('can queue a fresh Atlas download from the already reacted prompt', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://127.0.0.1')
      if (url.pathname === '/api/settings/app') {
        return atlasSettingsResponse()
      }

      if (url.pathname === '/api/atlas/civitai/status') {
        return new Response(JSON.stringify({
          ok: true,
          configured: true,
          items: [{
            request_id: 'civitai:800',
            exists: true,
            file_id: 88,
            reaction: 'love',
            filtered: false,
          }],
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }

      if (url.pathname === '/api/atlas/civitai/reactions') {
        return new Response(JSON.stringify({
          configured: true,
          file: { id: 88, source: 'CivitAI', source_id: '800' },
          reaction: { type: 'funny' },
          download: { requested: true },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }

      return new Response(JSON.stringify({ items: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    })

    const wrapper = await mountModal(fetchMock)

    await wrapper
      .get('[data-test="asset-preview-main-atlas-reactions"]')
      .get('button[aria-label="Funny in Atlas"]')
      .trigger('click')
    await flushPromises()

    clickDialogButton('Update and download again')
    await flushPromises()

    const reactionCall = fetchMock.mock.calls.find((call) => String(call[0]) === '/api/atlas/civitai/reactions')
    expect(requestBody(reactionCall)).toMatchObject({
      type: 'funny',
      download_behavior: 'force',
    })
  })
})
