// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
import { computed, defineComponent, h, ref, type Component } from 'vue'
import { describe, expect, it, vi } from 'vitest'

import HomeAssetsTab from '../../src/views/home/HomeAssetsTab.vue'
import HomeCheckpointControlNetPicker from '../../src/views/home/HomeCheckpointControlNetPicker.vue'
import HomeCheckpointLoraPicker from '../../src/views/home/HomeCheckpointLoraPicker.vue'
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

function mountWithHomeView(
  component: Component,
  context: Record<string, unknown>,
  props: Record<string, unknown> = {},
  options: { stubHomeLoraSelectionCard?: boolean } = {},
) {
  const shouldStubHomeLoraSelectionCard = options.stubHomeLoraSelectionCard ?? true
  const Wrapper = defineComponent({
    setup() {
      provideHomeView(context as never)

      return () => h(component, props)
    },
  })

  return mount(Wrapper, {
    global: {
      stubs: {
        AssetPreviewModal: true,
        HomeAssetPickerModal: true,
        HomeCheckpointCard: defineComponent({
          props: { checkpoint: { type: Object, required: true } },
          setup(props) {
            return () => h('article', { 'data-testid': 'checkpoint-card' }, String(props.checkpoint.displayName))
          },
        }),
        HomeControlNetInstanceCard: defineComponent({
          setup() {
            return () => h('article', { 'data-testid': 'controlnet-card' }, 'ControlNet card')
          },
        }),
        ...(shouldStubHomeLoraSelectionCard
          ? {
              HomeLoraSelectionCard: defineComponent({
                props: { lora: { type: Object, required: true } },
                setup(props) {
                  return () => h('article', { 'data-testid': 'lora-card' }, String(props.lora.name))
                },
              }),
            }
          : {}),
        UiTooltip: defineComponent({
          props: { content: { type: String, default: '' } },
          setup(props, { slots }) {
            return () => h('span', { 'data-tooltip-content': props.content }, slots.default?.())
          },
        }),
      },
    },
  })
}

function createLoraSelectionCardContext(overrides: Record<string, unknown> = {}) {
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
    removeCheckpointLora: vi.fn(),
    toggleLoraAllCompatible: vi.fn(),
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

describe('Home assets tab', () => {
  it('renders Add checkpoint below the selected checkpoint list without the redundant field label', () => {
    const wrapper = mountWithHomeView(HomeAssetsTab, {
      checkpoints: ref([{ name: checkpoint.name }]),
      formTab: ref('assets'),
      loadingCheckpoints: ref(false),
      selectedCheckpointEntries: ref([checkpoint]),
      checkpointOptions: ref([{ label: 'Another checkpoint', value: 'another.safetensors' }]),
      checkpointPickerPlaceholder: computed(() => 'Add checkpoint'),
      addSelectedCheckpoint: vi.fn(),
      clearSelectedCheckpoints: vi.fn(),
      setAllSelectedCheckpointsEnabled: vi.fn(),
    })

    expect(wrapper.find('.field-label').exists()).toBe(false)
    expect(wrapper.html().indexOf('WAI Illustrious SDXL')).toBeLessThan(
      wrapper.html().indexOf('aria-label="Add checkpoint"'),
    )
  })

  it('uses one switch for selected checkpoint bulk enable state', async () => {
    const setAllSelectedCheckpointsEnabled = vi.fn()
    const wrapper = mountWithHomeView(HomeAssetsTab, {
      checkpoints: ref([{ name: checkpoint.name }]),
      formTab: ref('assets'),
      loadingCheckpoints: ref(false),
      selectedCheckpointEntries: ref([checkpoint]),
      checkpointOptions: ref([{ label: 'Another checkpoint', value: 'another.safetensors' }]),
      checkpointPickerPlaceholder: computed(() => 'Add checkpoint'),
      addSelectedCheckpoint: vi.fn(),
      clearSelectedCheckpoints: vi.fn(),
      setAllSelectedCheckpointsEnabled,
    })

    expect(wrapper.findAll('button').some((button) => button.text() === 'All on')).toBe(false)
    expect(wrapper.findAll('button').some((button) => button.text() === 'All off')).toBe(false)

    const allCheckpointsSwitch = wrapper.get('button[aria-label="Disable all checkpoints"]')

    expect(allCheckpointsSwitch.attributes('role')).toBe('switch')
    expect(allCheckpointsSwitch.attributes('aria-checked')).toBe('true')

    await allCheckpointsSwitch.trigger('click')

    expect(setAllSelectedCheckpointsEnabled).toHaveBeenCalledWith(false)
  })
})

describe('Home checkpoint asset pickers', () => {
  it('renders Add LoRA below the selected LoRA list', () => {
    const wrapper = mountWithHomeView(HomeCheckpointLoraPicker, {
      loras: ref([{ name: 'another-lora.safetensors' }]),
      loadingLoras: ref(false),
      loraLoadingError: ref(''),
      getCheckpointLoraOptions: () => [{ label: 'Another LoRA', value: 'another-lora.safetensors' }],
      getCheckpointLoraPickerPlaceholder: () => 'Add LoRA',
      addCheckpointLora: vi.fn(),
      clearCheckpointLoras: vi.fn(),
      setAllCheckpointLorasEnabled: vi.fn(),
    }, { checkpoint }).findComponent(HomeCheckpointLoraPicker)

    expect(wrapper.html().indexOf('data-testid="lora-card"')).toBeLessThan(
      wrapper.html().indexOf('aria-label="Add LoRA for waiIllustriousSDXL_v160.safetensors"'),
    )
  })

  it('uses one switch for checkpoint LoRA bulk enable state', async () => {
    const setAllCheckpointLorasEnabled = vi.fn()
    const wrapper = mountWithHomeView(HomeCheckpointLoraPicker, {
      loras: ref([{ name: 'another-lora.safetensors' }]),
      loadingLoras: ref(false),
      loraLoadingError: ref(''),
      getCheckpointLoraOptions: () => [{ label: 'Another LoRA', value: 'another-lora.safetensors' }],
      getCheckpointLoraPickerPlaceholder: () => 'Add LoRA',
      addCheckpointLora: vi.fn(),
      clearCheckpointLoras: vi.fn(),
      setAllCheckpointLorasEnabled,
    }, { checkpoint }).findComponent(HomeCheckpointLoraPicker)

    expect(wrapper.findAll('button').some((button) => button.text() === 'All on')).toBe(false)
    expect(wrapper.findAll('button').some((button) => button.text() === 'All off')).toBe(false)

    const allLorasSwitch = wrapper.get('button[aria-label="Disable all LoRAs for WAI Illustrious SDXL"]')

    expect(allLorasSwitch.attributes('role')).toBe('switch')
    expect(allLorasSwitch.attributes('aria-checked')).toBe('true')

    await allLorasSwitch.trigger('click')

    expect(setAllCheckpointLorasEnabled).toHaveBeenCalledWith(checkpoint.name, false)
  })

  it('renders Add ControlNet below the selected ControlNet list', () => {
    const wrapper = mountWithHomeView(HomeCheckpointControlNetPicker, {
      controlNets: ref([{ name: 'another-controlnet.safetensors' }]),
      loadingControlNets: ref(false),
      controlNetLoadingError: ref(''),
      getCheckpointControlNetOptions: () => [
        { label: 'Another ControlNet', value: 'another-controlnet.safetensors' },
      ],
      getCheckpointControlNetPickerPlaceholder: () => 'Add ControlNet',
      getControlNetCompatibilityLabel: () => 'Compatible',
      addCheckpointControlNet: vi.fn(),
      clearCheckpointControlNets: vi.fn(),
      setAllCheckpointControlNetsEnabled: vi.fn(),
    }, { checkpoint }).findComponent(HomeCheckpointControlNetPicker)

    expect(wrapper.html().indexOf('data-testid="controlnet-card"')).toBeLessThan(
      wrapper.html().indexOf('aria-label="Add ControlNet for waiIllustriousSDXL_v160.safetensors"'),
    )
  })

  it('uses one switch for checkpoint ControlNet bulk enable state', async () => {
    const setAllCheckpointControlNetsEnabled = vi.fn()
    const wrapper = mountWithHomeView(HomeCheckpointControlNetPicker, {
      controlNets: ref([{ name: 'another-controlnet.safetensors' }]),
      loadingControlNets: ref(false),
      controlNetLoadingError: ref(''),
      getCheckpointControlNetOptions: () => [
        { label: 'Another ControlNet', value: 'another-controlnet.safetensors' },
      ],
      getCheckpointControlNetPickerPlaceholder: () => 'Add ControlNet',
      getControlNetCompatibilityLabel: () => 'Compatible',
      addCheckpointControlNet: vi.fn(),
      clearCheckpointControlNets: vi.fn(),
      setAllCheckpointControlNetsEnabled,
    }, { checkpoint }).findComponent(HomeCheckpointControlNetPicker)

    expect(wrapper.findAll('button').some((button) => button.text() === 'All on')).toBe(false)
    expect(wrapper.findAll('button').some((button) => button.text() === 'All off')).toBe(false)

    const allControlNetsSwitch = wrapper.get(
      'button[aria-label="Disable all ControlNets for WAI Illustrious SDXL"]',
    )

    expect(allControlNetsSwitch.attributes('role')).toBe('switch')
    expect(allControlNetsSwitch.attributes('aria-checked')).toBe('true')

    await allControlNetsSwitch.trigger('click')

    expect(setAllCheckpointControlNetsEnabled).toHaveBeenCalledWith(checkpoint.name, false)
  })
})

describe('Home LoRA selection card', () => {
  it('uses one switch to enable or disable all trigger words while keeping weight controls', async () => {
    const lora: HomeLoraSelection = {
      name: 'GyaruJK-Negurie-V10.safetensors',
      enabled: true,
      strength: '1',
      enabledTriggerWords: ['portrait'],
    }
    const triggerWords = ['portrait', 'smile']
    const enableAllLoraTriggerWords = vi.fn()
    const disableAllLoraTriggerWords = vi.fn()
    const wrapper = mountWithHomeView(HomeLoraSelectionCard, createLoraSelectionCardContext({
      getLoraTriggerWords: () => triggerWords,
      isLoraTriggerWordEnabled: (_lora: HomeLoraSelection, triggerWord: string) =>
        lora.enabledTriggerWords?.includes(triggerWord) ?? false,
      enableAllLoraTriggerWords,
      disableAllLoraTriggerWords,
    }), { checkpoint, lora }, { stubHomeLoraSelectionCard: false }).findComponent(HomeLoraSelectionCard)

    expect(wrapper.text()).not.toContain('All on')
    expect(wrapper.text()).not.toContain('All off')

    const allTriggerWordsSwitch = wrapper.get(
      'button[aria-label="Enable all trigger words for GyaruJK-Negurie-V10.safetensors"]',
    )

    expect(allTriggerWordsSwitch.attributes('role')).toBe('switch')
    expect(allTriggerWordsSwitch.attributes('aria-checked')).toBe('false')
    expect(wrapper.find('button[aria-label="Decrease portrait trigger strength"]').exists()).toBe(true)
    expect(wrapper.find('button[aria-label="Increase portrait trigger strength"]').exists()).toBe(true)

    await allTriggerWordsSwitch.trigger('click')

    expect(enableAllLoraTriggerWords).toHaveBeenCalledWith(lora)
    expect(disableAllLoraTriggerWords).not.toHaveBeenCalled()

    const enabledLora: HomeLoraSelection = {
      ...lora,
      enabledTriggerWords: triggerWords,
    }
    const enabledWrapper = mountWithHomeView(HomeLoraSelectionCard, createLoraSelectionCardContext({
      getLoraTriggerWords: () => triggerWords,
      isLoraTriggerWordEnabled: (_lora: HomeLoraSelection, triggerWord: string) =>
        enabledLora.enabledTriggerWords?.includes(triggerWord) ?? false,
      enableAllLoraTriggerWords,
      disableAllLoraTriggerWords,
    }), { checkpoint, lora: enabledLora }, { stubHomeLoraSelectionCard: false }).findComponent(
      HomeLoraSelectionCard,
    )

    const disableAllTriggerWordsSwitch = enabledWrapper.get(
      'button[aria-label="Disable all trigger words for GyaruJK-Negurie-V10.safetensors"]',
    )

    expect(disableAllTriggerWordsSwitch.attributes('aria-checked')).toBe('true')

    await disableAllTriggerWordsSwitch.trigger('click')

    expect(disableAllLoraTriggerWords).toHaveBeenCalledWith(enabledLora)
  })

  it('keeps the all trigger words switch disabled when the LoRA is disabled', async () => {
    const lora: HomeLoraSelection = {
      name: 'GyaruJK-Negurie-V10.safetensors',
      enabled: false,
      strength: '1',
      enabledTriggerWords: ['portrait', 'smile'],
    }
    const enableAllLoraTriggerWords = vi.fn()
    const disableAllLoraTriggerWords = vi.fn()
    const wrapper = mountWithHomeView(HomeLoraSelectionCard, createLoraSelectionCardContext({
      getLoraTriggerWords: () => ['portrait', 'smile'],
      isLoraTriggerWordEnabled: (_lora: HomeLoraSelection, triggerWord: string) =>
        lora.enabledTriggerWords?.includes(triggerWord) ?? false,
      enableAllLoraTriggerWords,
      disableAllLoraTriggerWords,
    }), { checkpoint, lora }, { stubHomeLoraSelectionCard: false }).findComponent(HomeLoraSelectionCard)

    const allTriggerWordsSwitch = wrapper.get(
      'button[aria-label="Enable all trigger words for GyaruJK-Negurie-V10.safetensors"]',
    )

    expect(allTriggerWordsSwitch.attributes('disabled')).toBeDefined()
    expect(allTriggerWordsSwitch.attributes('aria-checked')).toBe('false')

    await allTriggerWordsSwitch.trigger('click')

    expect(enableAllLoraTriggerWords).not.toHaveBeenCalled()
    expect(disableAllLoraTriggerWords).not.toHaveBeenCalled()
  })

  it('uses a Civitai icon link beside compatible LoRA titles instead of a redundant compatibility badge', () => {
    const lora: HomeLoraSelection = {
      name: 'GyaruJK-Negurie-V10.safetensors',
      enabled: true,
      strength: '1',
    }
    const wrapper = mountWithHomeView(HomeLoraSelectionCard, createLoraSelectionCardContext({
      getLoraDisplayName: () => '"The Gyaru JK at Train Station" by Negurie · v1.0',
      getLoraCompatibilityStatus: () => 'compatible',
      getLoraCompatibilityLabel: () => 'Compatible with Illustrious',
      getLoraCompatibilityMetadata: () => ({
        modelId: 12345,
        versionId: 67890,
        baseModel: 'Illustrious',
        baseModelKey: 'illustrious',
      }),
    }), { checkpoint, lora }, { stubHomeLoraSelectionCard: false })

    const civitaiLink = wrapper
      .findAll('a')
      .find((link) =>
        link.attributes('aria-label') ===
        'Open "The Gyaru JK at Train Station" by Negurie · v1.0 on Civitai',
      )

    expect(civitaiLink?.attributes('href')).toBe('https://civitai.com/models/12345?modelVersionId=67890')
    expect(wrapper.text()).not.toContain('Compatible with Illustrious')
  })

  it('uses one trigger-word switch instead of All on and All off buttons', async () => {
    const lora: HomeLoraSelection = {
      name: 'GyaruJK-Negurie-V10.safetensors',
      enabled: true,
      strength: '1',
    }
    const enableAllLoraTriggerWords = vi.fn()
    const disableAllLoraTriggerWords = vi.fn()
    const wrapper = mountWithHomeView(HomeLoraSelectionCard, {
      getLoraTriggerWords: () => ['tag one', 'tag two'],
      isLoraTriggerWordEnabled: () => true,
      toggleLoraTriggerWord: vi.fn(),
      enableAllLoraTriggerWords,
      disableAllLoraTriggerWords,
      getLoraTriggerWordWeightLabel: () => '1',
      stepLoraTriggerWordWeight: vi.fn(),
      getLoraTriggerWordsLabel: () => 'Trigger words: tag one, tag two',
      getLoraPreviewUrl: () => null,
      getLoraPreviewMediaType: () => null,
      isVideoPreview: () => false,
      getLoraDisplayName: () => 'Gyaru',
      getLoraCompatibilityStatus: () => 'compatible',
      getLoraCompatibilityLabel: () => 'Compatible with Illustrious',
      getLoraCompatibilityMetadata: () => null,
      toggleCheckpointLora: vi.fn(),
      setCheckpointLoraStrength: vi.fn(),
      removeCheckpointLora: vi.fn(),
      toggleLoraAllCompatible: vi.fn(),
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
    }, { checkpoint, lora }, { stubHomeLoraSelectionCard: false })

    expect(wrapper.findAll('button').some((button) => button.text() === 'All on')).toBe(false)
    expect(wrapper.findAll('button').some((button) => button.text() === 'All off')).toBe(false)

    const switchControl = wrapper.find('[aria-label="Disable all trigger words for Gyaru"]')
    expect(switchControl.attributes('role')).toBe('switch')
    expect(switchControl.attributes('aria-checked')).toBe('true')

    await switchControl.trigger('click')

    expect(disableAllLoraTriggerWords).toHaveBeenCalledWith(lora)
    expect(enableAllLoraTriggerWords).not.toHaveBeenCalled()
  })
})
