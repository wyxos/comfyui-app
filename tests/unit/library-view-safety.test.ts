// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils'
import { computed, defineComponent, h, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory } from 'vue-router'
import { createAppRouter } from '../../src/router'

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
  })
}

describe('LibraryView safety overrides', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('allows local safety overrides from downloaded model previews', async () => {
    const downloads = ref([
      {
        id: 'library-download-1',
        state: 'complete',
        modelId: 101,
        modelName: 'Library checkpoint',
        modelType: 'Checkpoint',
        modelNsfw: true,
        modelMetadata: { nsfw: true },
        versionId: 201,
        versionName: 'v1',
        fileId: 301,
        fileName: 'library_checkpoint.safetensors',
        baseModel: 'Illustrious',
        targetPath: 'C:\\models\\checkpoints\\library_checkpoint.safetensors',
        finishedAt: 10,
        updatedAt: 10,
        previewUrl: '/api/view?filename=library.png',
        previewImage: { url: '/api/view?filename=library.png', nsfwLevel: 8 },
        previewPaths: [],
      },
    ])
    const refreshDownloads = vi.fn()
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url === '/api/controlnets') {
        return jsonResponse({ ok: true, controlNets: [] })
      }

      if (url.startsWith('/api/model-metadata')) {
        return jsonResponse({
          ok: true,
          metadata: {
            modelId: 101,
            versionId: 201,
            modelNsfw: false,
            modelNsfwOverride: false,
            baseModel: 'Illustrious',
          },
        })
      }

      return jsonResponse({ ok: true })
    })

    vi.stubGlobal('fetch', fetchMock)
    vi.doMock('../../src/composables/useAssetDownloads', () => ({
      useAssetDownloads: () => ({
        downloads,
        watchedDownloads: ref([]),
        activeDownloads: computed(() => []),
        completedDownloads: computed(() => downloads.value.filter((item) => item.state === 'complete')),
        loading: ref(false),
        error: ref(''),
        refreshDownloads,
        refreshWatchedDownloads: vi.fn(),
      }),
    }))
    vi.doMock('../../src/composables/useAppSettings', () => ({
      fetchAppSettings: vi.fn().mockResolvedValue({ includeNsfw: true }),
    }))

    const AssetPreviewModalStub = defineComponent({
      props: {
        open: { type: Boolean, default: false },
        compatibility: { type: Object, default: null },
        editableSafety: { type: Boolean, default: false },
      },
      emits: ['save-safety'],
      setup(props, { emit }) {
        return () =>
          props.open
            ? h('section', { 'data-testid': 'asset-preview-modal' }, [
                h('span', { 'data-testid': 'modal-editable-safety' }, String(props.editableSafety)),
                h('span', { 'data-testid': 'modal-model-nsfw' }, String(props.compatibility?.modelNsfw)),
                h('span', { 'data-testid': 'modal-model-nsfw-override' }, String(props.compatibility?.modelNsfwOverride)),
                h(
                  'button',
                  {
                    'aria-label': 'Save library safety override',
                    onClick: () => emit('save-safety', { modelNsfwOverride: false }),
                  },
                  'Save safety',
                ),
              ])
            : null
      },
    })

    const router = createAppRouter(createMemoryHistory())
    await router.push('/library')
    await router.isReady()
    const { default: LibraryView } = await import('../../src/views/LibraryView.vue')
    const wrapper = mount(LibraryView, {
      global: {
        plugins: [router],
        stubs: {
          AssetPreviewModal: AssetPreviewModalStub,
        },
      },
    })
    await flushPromises()

    await wrapper.get('[aria-label="Open Library checkpoint preview"]').trigger('click')

    expect(wrapper.get('[data-testid="modal-editable-safety"]').text()).toBe('true')
    expect(wrapper.get('[data-testid="modal-model-nsfw"]').text()).toBe('true')

    refreshDownloads.mockClear()
    await wrapper.get('[aria-label="Save library safety override"]').trigger('click')
    await flushPromises()

    const saveCall = fetchMock.mock.calls.find(([input]) => String(input).startsWith('/api/model-metadata?type=checkpoint'))
    expect(saveCall?.[0]).toBe('/api/model-metadata?type=checkpoint&name=library_checkpoint.safetensors')
    expect(saveCall?.[1]).toMatchObject({
      method: 'PUT',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json; charset=utf-8',
      },
    })
    expect(JSON.parse(String((saveCall?.[1] as RequestInit).body))).toEqual({
      metadata: {
        modelNsfw: false,
        modelNsfwOverride: false,
      },
    })
    expect(wrapper.get('[data-testid="modal-model-nsfw-override"]').text()).toBe('false')
    expect(refreshDownloads).toHaveBeenCalled()
  })
})
