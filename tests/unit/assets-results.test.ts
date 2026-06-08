// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
import { computed, defineComponent, nextTick, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'

import AssetsResults from '../../src/views/assets/AssetsResults.vue'
import { provideAssetsView } from '../../src/views/assets/assetsViewContext'
import type { AssetsViewContext } from '../../src/views/assets/useAssetsView'

function mountAssetsResults(viewOverrides: Partial<AssetsViewContext> = {}) {
  const openImageModal = vi.fn()
  const model = {
    id: 101,
    name: 'Carousel model',
    type: 'Checkpoint',
    creator: { username: 'previewer' },
    stats: {
      downloadCount: 1234,
      favoriteCount: 234,
      commentCount: 12,
    },
    modelVersions: [
      {
        id: 201,
        name: 'v1',
        baseModel: 'Illustrious',
        images: [
          { url: 'https://example.test/first.jpg', type: 'image', nsfw: false },
          { url: 'https://example.test/second.jpg', type: 'image', nsfw: false },
        ],
        files: [
          {
            id: 301,
            name: 'carousel.safetensors',
            type: 'Model',
            primary: true,
            downloadUrl: 'https://example.test/download',
          },
        ],
      },
    ],
  }

  const baseView = {
    loading: ref(false),
    error: ref(''),
    searched: ref(true),
    activeQuery: ref(''),
    activeModelId: ref(''),
    activeModelVersionId: ref(''),
    activeUsername: ref(''),
    openDownloadMenuKey: ref(''),
    visibleModels: computed(() => [model]),
    hasRenderableState: computed(() => true),
    resultSummary: computed(() => '1 shown'),
    currentPage: ref(1),
    canGoPrevious: computed(() => false),
    canGoNext: computed(() => false),
    pageCount: computed(() => 1),
    pageLabel: computed(() => 'Page 1'),
    formatNumber: (value?: number) => String(value ?? 0),
    firstVersion: () => model.modelVersions[0],
    isVideoPreview: () => false,
    thumbnailMediaFor: () => model.modelVersions[0].images[0],
    thumbnailFor: () => model.modelVersions[0].images[0].url,
    versionLabel: () => 'v1 - Illustrious',
    modelVersionLabel: () => 'v1 - Illustrious',
    creatorLabel: () => 'previewer',
    favoriteCountFor: () => 234,
    modelHasNsfw: () => false,
    formatFileSize: () => '1 MB',
    versionsForModel: () => model.modelVersions,
    primaryFileForVersion: () => model.modelVersions[0].files[0],
    fileSizeFor: () => 1024,
    downloadForVersion: () => null,
    hasDownloadedVersion: () => false,
    activeDownloadForModel: () => null,
    downloadStatusLabel: () => '',
    downloadButtonLabel: () => 'Versions',
    canQueueVersion: () => true,
    versionDownloadButtonLabel: () => 'Download',
    isModelDownloadQueuing: () => false,
    isVersionQueuing: () => false,
    queueAssetDownload: vi.fn(),
    queueMissingVersionsForModel: vi.fn(),
    queueableMissingVersionsForModel: () => [],
    handleDownloadClick: vi.fn(),
    modelUrl: () => 'https://civitai.com/models/101',
    blacklistModel: vi.fn(),
    creatorFilterHref: () => '',
    goToPage: vi.fn(),
    openImageModal,
    ...viewOverrides,
  } as unknown as AssetsViewContext

  const Harness = defineComponent({
    components: { AssetsResults },
    setup() {
      provideAssetsView(baseView)
      return {}
    },
    template: '<AssetsResults />',
  })

  return {
    model,
    openImageModal,
    wrapper: mount(Harness, { attachTo: document.body }),
  }
}

describe('AssetsResults', () => {
  it('keeps card images hidden behind a spinner until they are loaded', async () => {
    const { wrapper } = mountAssetsResults()

    const image = wrapper.get('img')
    expect(wrapper.find('[data-asset-card-media-spinner]').exists()).toBe(true)
    expect(image.classes()).toContain('opacity-0')
    expect(image.attributes('style')).toContain('opacity: 0;')
    expect(image.attributes('loading')).toBe('eager')

    await image.trigger('load')

    expect(wrapper.find('[data-asset-card-media-spinner]').exists()).toBe(false)
    expect(wrapper.get('img').classes()).toContain('opacity-100')
    expect(wrapper.get('img').attributes('style')).toContain('opacity: 1;')
  })

  it('places card badges below the truncated title and exposes a title tooltip', async () => {
    const { wrapper } = mountAssetsResults({
      creatorLabel: () => 'Autismix_anon',
      versionLabel: () => 'AutismMix_pony - Pony',
    })

    const body = wrapper.get('[data-asset-card-body]')
    const titleRow = wrapper.get('[data-asset-card-title-row]')
    const titleLink = wrapper.get('[data-asset-card-title-link]')
    const badges = wrapper.get('[data-asset-card-badges]')
    const creatorBadge = wrapper.get('[data-asset-card-creator-badge]')
    const versionBadge = wrapper.get('[data-asset-card-version-badge]')
    const bodyChildren = Array.from(body.element.children)
    const titleCopiesBeforeFocus = document.body.textContent?.match(/Carousel model/g)?.length ?? 0

    expect(titleLink.classes()).toContain('truncate')
    expect(titleLink.classes()).not.toContain('line-clamp-2')
    expect(badges.classes()).toContain('flex-nowrap')
    expect(badges.classes()).toContain('overflow-hidden')
    expect(badges.classes()).not.toContain('flex-wrap')
    expect(creatorBadge.attributes('title')).toBe('Autismix_anon')
    expect(creatorBadge.classes()).toContain('truncate')
    expect(versionBadge.attributes('title')).toBe('AutismMix_pony - Pony')
    expect(versionBadge.classes()).toContain('truncate')
    expect(bodyChildren.indexOf(titleRow.element)).toBeLessThan(bodyChildren.indexOf(badges.element))
    expect(wrapper.find('[data-asset-card-media] [data-asset-card-badges]').exists()).toBe(false)

    await titleLink.trigger('focusin')
    await nextTick()

    expect(document.body.textContent?.match(/Carousel model/g)?.length ?? 0).toBeGreaterThan(titleCopiesBeforeFocus)
  })

  it('cycles list-card preview images without opening the modal', async () => {
    const { openImageModal, wrapper } = mountAssetsResults()

    expect(wrapper.get('img').attributes('src')).toBe('https://example.test/first.jpg')
    expect(wrapper.text()).toContain('1 / 2')

    await wrapper.get('button[aria-label="Next preview image for Carousel model"]').trigger('click')

    expect(openImageModal).not.toHaveBeenCalled()
    expect(wrapper.get('img').attributes('src')).toBe('https://example.test/second.jpg')
    expect(wrapper.text()).toContain('2 / 2')

    await wrapper.get('button[aria-label="Previous preview image for Carousel model"]').trigger('click')

    expect(wrapper.get('img').attributes('src')).toBe('https://example.test/first.jpg')

    await wrapper.get('button[aria-label="Open Carousel model image preview"]').trigger('click')

    expect(openImageModal).toHaveBeenCalledWith(expect.objectContaining({ id: 101 }))
  })
})
