// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
import { defineComponent, h, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'

import HomeLoraSelectionCard from '../../src/views/home/HomeLoraSelectionCard.vue'
import { provideHomeView } from '../../src/views/home/homeViewContext'
import type { HomeCheckpointEntry, HomeLoraSelection } from '../../src/views/home/useHomeView'

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
  loras: [],
  controlNets: [],
}

function createContext(overrides: Record<string, unknown> = {}) {
  return {
    getLoraTriggerWords: () => [],
    isLoraTriggerWordEnabled: () => false,
    toggleLoraTriggerWord: vi.fn(),
    enableAllLoraTriggerWords: vi.fn(),
    disableAllLoraTriggerWords: vi.fn(),
    getLoraTriggerWordWeightLabel: () => '1',
    stepLoraTriggerWordWeight: vi.fn(),
    getLoraTriggerWordsLabel: () => 'Trigger words unavailable in local metadata.',
    getLoraPreviewUrl: () => null,
    getLoraPreviewMediaType: () => null,
    isVideoPreview: () => false,
    getLoraDisplayName: (name: string) => name,
    getLoraCompatibilityStatus: () => 'compatible',
    getLoraCompatibilityLabel: () => 'Compatible',
    getLoraCompatibilityMetadata: () => null,
    toggleCheckpointLora: vi.fn(),
    setCheckpointLoraStrength: vi.fn(),
    toggleLoraAllCompatible: vi.fn(),
    removeCheckpointLora: vi.fn(),
    assetPreviewDownloadActions: {
      queuingDownloadKey: ref(''),
      downloadForVersion: () => null,
      downloadStatusLabel: () => '',
      queueAssetDownload: vi.fn(),
      deleteAssetDownload: vi.fn(),
      modelDownloadKey: () => '',
      startPolling: vi.fn(),
      stopPolling: vi.fn(),
    },
    applyGenerationMetadataFromSource: vi.fn(),
    saveModelSafetyOverride: vi.fn(),
    ...overrides,
  }
}

function mountCard(lora: HomeLoraSelection, context: Record<string, unknown> = {}) {
  const Wrapper = defineComponent({
    setup() {
      provideHomeView(createContext(context) as never)

      return () => h(HomeLoraSelectionCard, { checkpoint, lora })
    },
  })

  return mount(Wrapper, {
    global: {
      stubs: {
        AssetPreviewModal: true,
        UiTooltip: defineComponent({
          props: { content: { type: String, default: '' } },
          setup(props, { slots }) {
            return () => h('span', { 'data-tooltip-content': props.content }, slots.default?.())
          },
        }),
      },
    },
  }).findComponent(HomeLoraSelectionCard)
}

describe('HomeLoraSelectionCard', () => {
  it('renders selected trigger words without a redundant check icon', () => {
    const lora: HomeLoraSelection = {
      name: 'collared-shirt-lora.safetensors',
      enabled: true,
      strength: '1',
      enabledTriggerWords: ['collared shirt'],
    }
    const wrapper = mountCard(lora, {
      getLoraTriggerWords: () => ['collared shirt'],
      isLoraTriggerWordEnabled: (_lora: HomeLoraSelection, triggerWord: string) =>
        lora.enabledTriggerWords?.includes(triggerWord) ?? false,
    })

    const triggerToggle = wrapper.get('button[aria-pressed="true"]')

    expect(triggerToggle.text()).toContain('collared shirt')
    expect(triggerToggle.text()).toContain('1')
    expect(triggerToggle.find('svg').exists()).toBe(false)
    expect(wrapper.find('button[aria-label="Decrease collared shirt trigger strength"]').exists()).toBe(true)
    expect(wrapper.find('button[aria-label="Increase collared shirt trigger strength"]').exists()).toBe(true)
  })

  it('groups LoRA metadata separately from compact row controls', () => {
    const lora: HomeLoraSelection = {
      name: 'collared-shirt-lora.safetensors',
      enabled: true,
      strength: '0.75',
      applyToAllCompatible: true,
    }
    const wrapper = mountCard(lora, {
      getLoraDisplayName: () => 'Collared Shirt',
      getLoraCompatibilityMetadata: () => ({ modelId: 12345, versionId: 67890 }),
    })

    const controls = wrapper.get('[aria-label="LoRA controls for collared-shirt-lora.safetensors"]')

    expect(wrapper.text()).toContain('Collared Shirt')
    expect(wrapper.text()).toContain('collared-shirt-lora.safetensors')
    expect(controls.get('a[aria-label="Open Collared Shirt on Civitai"]').exists()).toBe(true)
    expect(controls.get('button[aria-label="Apply collared-shirt-lora.safetensors to all compatible checkpoints"]').attributes('role')).toBe('switch')
    expect(controls.get('input[type="number"]').element).toHaveProperty('value', '0.75')
    expect(controls.get('button[aria-label="Disable collared-shirt-lora.safetensors"]').attributes('role')).toBe('switch')
    expect(controls.get('button[aria-label="Remove collared-shirt-lora.safetensors"]').exists()).toBe(true)
  })
})
