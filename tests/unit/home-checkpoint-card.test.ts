// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
import { defineComponent, h, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'

import HomeCheckpointCard from '../../src/views/home/HomeCheckpointCard.vue'
import { provideHomeView } from '../../src/views/home/homeViewContext'
import type { HomeCheckpointEntry } from '../../src/views/home/useHomeView'

const checkpoint: HomeCheckpointEntry = {
  name: 'waiIllustriousSDXL_v160.safetensors',
  enabled: true,
  family: 'sdxl',
  displayName: 'WAI Illustrious SDXL',
  downloaded: true,
  previewUrl: null,
  previewMediaType: null,
  compatibility: { baseModel: 'Illustrious', baseModelKey: 'illustrious' },
  loraPicker: '',
  loras: [
    {
      name: 'GyaruJK-Negurie-V10.safetensors',
      enabled: true,
      strength: '1',
    },
  ],
  controlNets: [
    {
      id: 'controlnet-1',
      enabled: true,
      model: 'lineart.safetensors',
      preprocessor: 'lineart',
      lineartPolarity: 'black-lines',
      previewResolution: '1024',
      strength: '1',
      startPercent: '0',
      endPercent: '1',
      inputImageName: '',
      inputImageDisplayName: '',
      inputImagePreviewUrl: '',
      inputImageWidth: null,
      inputImageHeight: null,
      isDragging: false,
      isUploading: false,
      uploadError: '',
      previewImageUrl: '',
      previewImageName: '',
      previewImageSubfolder: '',
      previewImageType: 'output',
      isGeneratingPreview: false,
      previewError: '',
      isCopyingPreview: false,
      previewCopyNotice: '',
      previewCopyError: '',
    },
  ],
}

function mountCheckpointCard(contextOverrides: Record<string, unknown> = {}) {
  const context = {
    isVideoPreview: () => false,
    removeSelectedCheckpoint: vi.fn(),
    toggleSelectedCheckpoint: vi.fn(),
    assetPreviewDownloadActions: {
      queuingDownloadKey: ref(''),
      downloadForVersion: vi.fn(() => null),
      downloadStatusLabel: vi.fn(() => ''),
      queueAssetDownload: vi.fn(),
      deleteAssetDownload: vi.fn(),
      modelDownloadKey: vi.fn(() => ''),
      startPolling: vi.fn(),
      stopPolling: vi.fn(),
    },
    applyGenerationMetadataFromSource: vi.fn(),
    saveModelSafetyOverride: vi.fn(),
    loadingCheckpoints: ref(false),
    ...contextOverrides,
  }
  const Wrapper = defineComponent({
    setup() {
      provideHomeView(context as never)

      return () => h(HomeCheckpointCard, { checkpoint })
    },
  })

  return {
    context,
    wrapper: mount(Wrapper, {
      global: {
        stubs: {
          AssetPreviewModal: true,
          HomeCheckpointControlNetPicker: defineComponent({
            setup() {
              return () => h('section', { 'data-testid': 'controlnet-picker' }, 'ControlNet picker')
            },
          }),
          HomeCheckpointLoraPicker: defineComponent({
            setup() {
              return () => h('section', { 'data-testid': 'lora-picker' }, 'LoRA picker')
            },
          }),
          UiTooltip: defineComponent({
            props: { content: { type: String, default: '' } },
            setup(props, { slots }) {
              return () => h('span', { 'data-tooltip-content': props.content }, slots.default?.())
            },
          }),
        },
      },
    }),
  }
}

describe('Home checkpoint card', () => {
  it('starts expanded and toggles the asset pickers from the header', async () => {
    const { wrapper } = mountCheckpointCard()
    const collapseButton = wrapper.find('[aria-label="Collapse checkpoint assets"]')
    const detailsId = collapseButton.attributes('aria-controls')
    const details = () => wrapper.find(`#${detailsId}`)

    expect(details().attributes('style') ?? '').not.toContain('display: none')

    await collapseButton.trigger('click')

    expect(details().attributes('style')).toContain('display: none')

    await wrapper.find('[aria-label="Expand checkpoint assets"]').trigger('click')

    expect(details().attributes('style') ?? '').not.toContain('display: none')
    expect(wrapper.find('[data-testid="lora-picker"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="controlnet-picker"]').exists()).toBe(true)
  })

  it('keeps counts and existing actions visible while collapsed', async () => {
    const { context, wrapper } = mountCheckpointCard()

    await wrapper.find('[aria-label="Collapse checkpoint assets"]').trigger('click')
    await wrapper.find('[aria-label="Disable waiIllustriousSDXL_v160.safetensors"]').trigger('click')
    await wrapper.find('[aria-label="Remove waiIllustriousSDXL_v160.safetensors"]').trigger('click')

    expect(wrapper.text()).toContain('1 LoRA')
    expect(wrapper.text()).toContain('1 ControlNet')
    expect(context.toggleSelectedCheckpoint).toHaveBeenCalledWith('waiIllustriousSDXL_v160.safetensors')
    expect(context.removeSelectedCheckpoint).toHaveBeenCalledWith('waiIllustriousSDXL_v160.safetensors')
  })

  it('omits redundant enabled and downloaded status copy from the header', () => {
    const { wrapper } = mountCheckpointCard()

    expect(wrapper.text()).not.toContain('Enabled')
    expect(wrapper.text()).not.toContain('Downloaded')
  })

  it('keeps the checkpoint thumbnail slot occupied while checkpoint metadata loads', () => {
    const { wrapper } = mountCheckpointCard({
      loadingCheckpoints: ref(true),
    })

    const placeholder = wrapper.get('[aria-label="Loading waiIllustriousSDXL_v160.safetensors preview"]')

    expect(placeholder.attributes('role')).toBe('status')
    expect(placeholder.classes()).toContain('h-14')
    expect(placeholder.classes()).toContain('w-14')
  })
})
