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
  it('does not blur the Assets card title when only legacy model safety is NSFW', () => {
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
      blurNsfwModels: ref(true),
      blurNsfwMediaLevel: ref(4),
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
    expect(wrapper.get('[data-asset-card-title-link]').classes()).not.toContain('blur-sm')
  })

  it('blurs the Assets card preview image from current nsfwLevel metadata', () => {
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
          images: [{ url: 'https://example.test/nsfw.jpg', type: 'image', nsfw: true, nsfwLevel: 8 }],
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
      blurNsfwModels: ref(true),
      blurNsfwMediaLevel: ref(4),
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

  it('blurs the Assets card preview image when Civitai sends nsfwLevel 4 metadata', () => {
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
      blurNsfwModels: ref(true),
      blurNsfwMediaLevel: ref(4),
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

  it('does not blur the Assets card preview image below the selected media threshold', () => {
    const model = {
      id: 104,
      name: 'Threshold asset card',
      type: 'Checkpoint',
      creator: { username: 'previewer' },
      stats: {},
      nsfw: false,
      modelVersions: [
        {
          id: 204,
          name: 'v1',
          images: [{ url: 'https://example.test/r-level.jpg', type: 'image', nsfw: false, nsfwLevel: 4 }],
          files: [{ id: 304, name: 'model.safetensors', type: 'Model', primary: true }],
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
      blurNsfwModels: ref(true),
      blurNsfwMediaLevel: ref(8),
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
      modelUrl: () => 'https://civitai.com/models/104',
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

    expect(wrapper.get('img[alt="Threshold asset card thumbnail"]').classes()).not.toContain('blur-sm')
    expect(wrapper.get('[data-asset-card-title-link]').classes()).not.toContain('blur-sm')
  })

  it('does not blur the Library card title when only legacy model safety is NSFW', () => {
    const wrapper = mount(LibraryModelCard, {
      props: {
        blurNsfwModels: true,
        blurNsfwMediaLevel: 4,
        item: {
          id: 'download:1',
          itemKind: 'checkpoint',
          librarySource: 'downloaded',
          modelId: 1,
          modelName: 'Legacy safety library card',
          modelType: 'Checkpoint',
          modelNsfw: true,
          modelMetadata: { nsfw: true },
          versionId: 2,
          versionName: 'v1',
          fileName: 'library.safetensors',
          previewUrl: '/library-preview.png',
          previewPaths: [{ url: '/library-preview.png', mediaType: 'image', nsfw: true, nsfwLevel: 1 }] as LibraryPreviewPath[],
          updatedAt: 10,
        },
      },
    })

    expect(wrapper.get('img[alt="Legacy safety library card preview"]').classes()).not.toContain('blur-sm')
    expect(wrapper.get('[data-library-card-title]').classes()).not.toContain('blur-sm')
    expect(wrapper.text()).not.toContain('NSFW')
  })

  it('blurs the Library card preview from previewImage nsfwLevel when the local preview path is stale', () => {
    const wrapper = mount(LibraryModelCard, {
      props: {
        blurNsfwModels: true,
        blurNsfwMediaLevel: 4,
        item: {
          id: 'download:stale-local-preview',
          itemKind: 'lora',
          librarySource: 'downloaded',
          modelId: 2393653,
          modelName: 'Library stale local preview card',
          modelType: 'LORA',
          modelNsfw: true,
          modelMetadata: { nsfw: true, safetySchemaVersion: 2 },
          versionId: 2843020,
          versionName: 'v3.0 AP3',
          fileName: 'TheMilkMan_AnimaP_v03-000020.safetensors',
          previewUrl: '/api/civitai/downloads/2393653__2843020__2729189/preview',
          previewImage: {
            id: 126885360,
            url: 'https://image.civitai.com/mock/original=true/126885360.jpeg',
            hash: 'UFJ@RY.m?a#R0zO?56ni4.OD^+s;00RjIUM|',
            type: 'image',
            nsfwLevel: 8,
          },
          previewPaths: [{
            id: 126885360,
            url: '/api/civitai/downloads/2393653__2843020__2729189/previews/0',
            mediaType: 'image',
            hash: 'UFJ@RY.m?a#R0zO?56ni4.OD^+s;00RjIUM|',
            nsfwLevel: null,
          }] as LibraryPreviewPath[],
          updatedAt: 10,
        },
      },
    })

    expect(wrapper.get('img[alt="Library stale local preview card preview"]').classes()).toContain('blur-sm')
  })

  it('does not blur the Home picker preview image from legacy preview safety alone', () => {
    const wrapper = mount(HomeAssetPickerCard, {
      props: {
        blurNsfwModels: true,
        blurNsfwMediaLevel: 4,
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

    expect(wrapper.get('img[alt="Safe picker card preview"]').classes()).not.toContain('blur-sm')
    expect(wrapper.get('[data-asset-picker-title]').classes()).not.toContain('blur-sm')
  })
})
