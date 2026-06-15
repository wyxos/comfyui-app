// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
import { computed, defineComponent, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'

import AssetsResults from '../../src/views/assets/AssetsResults.vue'
import { provideAssetsView } from '../../src/views/assets/assetsViewContext'
import type { AssetsViewContext } from '../../src/views/assets/useAssetsView'
import HomeAssetPickerCard from '../../src/views/home/HomeAssetPickerCard.vue'
import type { AssetPickerPreviewMedia } from '../../src/views/home/homeAssetPickerOptionHelpers'
import LibraryModelCard from '../../src/views/library/LibraryModelCard.vue'
import type { LibraryPreviewPath } from '../../src/views/library/libraryModelHelpers'

describe('NSFW blur content', () => {
  it('blurs the Assets card title but not a safe preview image when only the model is NSFW', () => {
    const model = {
      id: 101,
      name: 'NSFW asset card',
      type: 'Checkpoint',
      creator: { username: 'previewer' },
      stats: {},
      nsfw: true,
      modelVersions: [
        {
          id: 201,
          name: 'v1',
          images: [{ url: 'https://example.test/safe.jpg', type: 'image', nsfw: false }],
          files: [{ id: 301, name: 'model.safetensors', type: 'Model', primary: true }],
        },
      ],
    }
    const view = {
      loading: ref(false),
      error: ref(''),
      searched: ref(true),
      activeQuery: ref(''),
      activeModelId: ref(''),
      activeModelVersionId: ref(''),
      activeUsername: ref(''),
      hiddenModelCount: computed(() => 0),
      openDownloadMenuKey: ref(''),
      visibleModels: computed(() => [model]),
      hasRenderableState: computed(() => true),
      resultSummary: computed(() => '1 shown'),
      currentPage: ref(1),
      canGoPrevious: computed(() => false),
      canGoNext: computed(() => false),
      pageCount: computed(() => 1),
      pageLabel: computed(() => 'Page 1'),
      blurNsfwContent: ref(true),
      formatNumber: (value?: number) => String(value ?? 0),
      firstVersion: () => model.modelVersions[0],
      isVideoPreview: () => false,
      thumbnailMediaFor: () => model.modelVersions[0].images[0],
      versionLabel: () => 'v1',
      modelVersionLabel: () => 'v1',
      creatorLabel: () => 'previewer',
      favoriteCountFor: () => 0,
      modelHasNsfw: () => true,
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
      modelUrl: () => 'https://civitai.red/models/101',
      blacklistModel: vi.fn(),
      creatorFilterHref: () => '',
      goToPage: vi.fn(),
      openImageModal: vi.fn(),
    } as unknown as AssetsViewContext
    const Harness = defineComponent({
      components: { AssetsResults },
      setup() {
        provideAssetsView(view)
      },
      template: '<AssetsResults />',
    })

    const wrapper = mount(Harness)

    expect(wrapper.get('img[alt="NSFW asset card thumbnail"]').classes()).not.toContain('blur-sm')
    expect(wrapper.get('[data-asset-card-title-link]').classes()).toContain('blur-sm')
  })

  it('blurs the Assets card preview image but not the title when only the preview media is NSFW', () => {
    const model = {
      id: 102,
      name: 'Safe asset card',
      type: 'Checkpoint',
      creator: { username: 'previewer' },
      stats: {},
      nsfw: false,
      modelVersions: [
        {
          id: 202,
          name: 'v1',
          images: [{ url: 'https://example.test/nsfw.jpg', type: 'image', nsfw: true }],
          files: [{ id: 302, name: 'model.safetensors', type: 'Model', primary: true }],
        },
      ],
    }
    const view = {
      loading: ref(false),
      error: ref(''),
      searched: ref(true),
      activeQuery: ref(''),
      activeModelId: ref(''),
      activeModelVersionId: ref(''),
      activeUsername: ref(''),
      hiddenModelCount: computed(() => 0),
      openDownloadMenuKey: ref(''),
      visibleModels: computed(() => [model]),
      hasRenderableState: computed(() => true),
      resultSummary: computed(() => '1 shown'),
      currentPage: ref(1),
      canGoPrevious: computed(() => false),
      canGoNext: computed(() => false),
      pageCount: computed(() => 1),
      pageLabel: computed(() => 'Page 1'),
      blurNsfwContent: ref(true),
      formatNumber: (value?: number) => String(value ?? 0),
      firstVersion: () => model.modelVersions[0],
      isVideoPreview: () => false,
      thumbnailMediaFor: () => model.modelVersions[0].images[0],
      versionLabel: () => 'v1',
      modelVersionLabel: () => 'v1',
      creatorLabel: () => 'previewer',
      favoriteCountFor: () => 0,
      modelHasNsfw: () => true,
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
      modelUrl: () => 'https://civitai.com/models/102',
      blacklistModel: vi.fn(),
      creatorFilterHref: () => '',
      goToPage: vi.fn(),
      openImageModal: vi.fn(),
    } as unknown as AssetsViewContext
    const Harness = defineComponent({
      components: { AssetsResults },
      setup() {
        provideAssetsView(view)
      },
      template: '<AssetsResults />',
    })

    const wrapper = mount(Harness)

    expect(wrapper.get('img[alt="Safe asset card thumbnail"]').classes()).toContain('blur-sm')
    expect(wrapper.get('[data-asset-card-title-link]').classes()).not.toContain('blur-sm')
  })

  it('blurs the Assets card preview image when Civitai sends numeric nsfwLevel metadata', () => {
    const model = {
      id: 103,
      name: 'Numeric nsfwLevel asset card',
      type: 'Checkpoint',
      creator: { username: 'previewer' },
      stats: {},
      nsfw: false,
      modelVersions: [
        {
          id: 203,
          name: 'v1',
          images: [{ url: 'https://example.test/nsfw-level.jpg', type: 'image', nsfw: false, nsfwLevel: 4 }],
          files: [{ id: 303, name: 'model.safetensors', type: 'Model', primary: true }],
        },
      ],
    }
    const view = {
      loading: ref(false),
      error: ref(''),
      searched: ref(true),
      activeQuery: ref(''),
      activeModelId: ref(''),
      activeModelVersionId: ref(''),
      activeUsername: ref(''),
      hiddenModelCount: computed(() => 0),
      openDownloadMenuKey: ref(''),
      visibleModels: computed(() => [model]),
      hasRenderableState: computed(() => true),
      resultSummary: computed(() => '1 shown'),
      currentPage: ref(1),
      canGoPrevious: computed(() => false),
      canGoNext: computed(() => false),
      pageCount: computed(() => 1),
      pageLabel: computed(() => 'Page 1'),
      blurNsfwContent: ref(true),
      formatNumber: (value?: number) => String(value ?? 0),
      firstVersion: () => model.modelVersions[0],
      isVideoPreview: () => false,
      thumbnailMediaFor: () => model.modelVersions[0].images[0],
      versionLabel: () => 'v1',
      modelVersionLabel: () => 'v1',
      creatorLabel: () => 'previewer',
      favoriteCountFor: () => 0,
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
      modelUrl: () => 'https://civitai.com/models/103',
      blacklistModel: vi.fn(),
      creatorFilterHref: () => '',
      goToPage: vi.fn(),
      openImageModal: vi.fn(),
    } as unknown as AssetsViewContext
    const Harness = defineComponent({
      components: { AssetsResults },
      setup() {
        provideAssetsView(view)
      },
      template: '<AssetsResults />',
    })

    const wrapper = mount(Harness)

    expect(wrapper.get('img[alt="Numeric nsfwLevel asset card thumbnail"]').classes()).toContain('blur-sm')
    expect(wrapper.get('[data-asset-card-title-link]').classes()).not.toContain('blur-sm')
  })

  it('blurs the Library card title but not a safe preview image when only the model is NSFW', () => {
    const wrapper = mount(LibraryModelCard, {
      props: {
        blurNsfwContent: true,
        item: {
          id: 'download:1',
          itemKind: 'checkpoint',
          librarySource: 'downloaded',
          modelId: 1,
          modelName: 'NSFW library card',
          modelType: 'Checkpoint',
          modelNsfw: true,
          modelMetadata: { nsfw: true },
          versionId: 2,
          versionName: 'v1',
          fileName: 'library.safetensors',
          previewUrl: '/library-preview.png',
          previewPaths: [{ url: '/library-preview.png', mediaType: 'image', nsfw: false }] as LibraryPreviewPath[],
          updatedAt: 10,
        },
      },
    })

    expect(wrapper.get('img[alt="NSFW library card preview"]').classes()).not.toContain('blur-sm')
    expect(wrapper.get('[data-library-card-title]').classes()).toContain('blur-sm')
  })

  it('blurs the Home picker preview image but not the title when only the preview media is NSFW', () => {
    const wrapper = mount(HomeAssetPickerCard, {
      props: {
        blurNsfwContent: true,
        option: {
          label: 'Safe picker card',
          value: 'safe-picker.safetensors',
          modelNsfw: false,
        },
        previewMedia: { url: '/picker-preview.png', mediaType: 'image', nsfw: 'Soft' } as AssetPickerPreviewMedia,
        previewIndex: 0,
        previewCount: 1,
        baseModelLabel: '',
        hasNsfw: false,
      },
    })

    expect(wrapper.get('img[alt="Safe picker card preview"]').classes()).toContain('blur-sm')
    expect(wrapper.get('[data-asset-picker-title]').classes()).not.toContain('blur-sm')
  })
})
