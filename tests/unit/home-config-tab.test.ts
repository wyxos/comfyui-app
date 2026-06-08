// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
import { computed, defineComponent, h, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'

import HomeConfigTab from '../../src/views/home/HomeConfigTab.vue'
import { provideHomeView } from '../../src/views/home/homeViewContext'

function mountConfigTab(options: { hasAnimaCheckpointSelected?: boolean } = {}) {
  const seed = ref('')
  const context = {
    width: ref('704'),
    height: ref('960'),
    seed,
    steps: ref('24'),
    cfg: ref('6'),
    samplerName: ref(''),
    scheduler: ref(''),
    clipName: ref(''),
    vaeName: ref(''),
    maintainAspectRatio: ref(false),
    aspectRatioSliderValue: ref('0'),
    aspectRatioLabel: computed(() => '704 x 960'),
    formTab: ref('config'),
    lastGeneratedSeed: ref(null),
    stepsPlaceholder: ref('24'),
    cfgPlaceholder: ref('6'),
    samplerPlaceholder: ref('dpmpp_2m'),
    schedulerPlaceholder: ref('karras'),
    clipNamePlaceholder: ref('qwen_3_06b_base.safetensors'),
    vaeNamePlaceholder: ref('wan_2.1_vae.safetensors'),
    samplerSelectOptions: ref(['dpmpp_2m']),
    schedulerSelectOptions: ref(['karras']),
    clipNameSelectOptions: ref(['qwen_3_06b_base.safetensors']),
    vaeNameSelectOptions: ref(['wan_2.1_vae.safetensors']),
    hasAnimaCheckpointSelected: ref(options.hasAnimaCheckpointSelected ?? false),
    loadingGenerationOptions: ref(false),
    generationOptionsError: ref(''),
    lastGeneratedSeedTooltip: ref('No generated seed yet'),
    sizeValidation: computed(() => ({ message: '704 x 960. Whole numbers only, minimum 64 px.' })),
    sizeValidationClass: computed(() => 'text-primary-foreground/52'),
    setAspectRatioLock: vi.fn(),
    setAspectRatioSliderValue: vi.fn(),
    resetAspectRatioScale: vi.fn(),
    useLastGeneratedSeed: vi.fn(),
    swapSizeValues: vi.fn(),
  }
  const Wrapper = defineComponent({
    setup() {
      provideHomeView(context as never)

      return () => h(HomeConfigTab)
    },
  })

  const wrapper = mount(Wrapper, {
    attachTo: document.body,
    global: {
      stubs: {
        UiSlider: true,
        UiTooltip: defineComponent({
          props: {
            content: {
              type: String,
              default: '',
            },
          },
          setup(props, { slots }) {
            return () => h('span', { 'data-tooltip-content': props.content }, slots.default?.())
          },
        }),
      },
    },
  })

  return { seed, wrapper }
}

describe('HomeConfigTab', () => {
  it('adds purpose and impact tooltips to config field labels', () => {
    const { wrapper } = mountConfigTab({ hasAnimaCheckpointSelected: true })
    const labels = wrapper.findAll('[data-testid="config-field-label"]')

    expect(labels.map((label) => label.text())).toEqual([
      'Size',
      'Scale',
      'Seed',
      'Steps',
      'CFG',
      'Sampler',
      'Scheduler',
      'Anima template',
      'CLIP name',
      'VAE name',
    ])

    for (const label of labels) {
      const tooltip = label.element.closest('[data-tooltip-content]')
      const content = tooltip?.getAttribute('data-tooltip-content') ?? ''

      expect(label.attributes('tabindex')).toBe('0')
      expect(content).toContain('Purpose:')
      expect(content).toContain('Impact:')
    }
  })

  it('labels blank seeds as random and entered seeds as fixed', async () => {
    const { seed, wrapper } = mountConfigTab()
    const seedMode = () => wrapper.get('[data-testid="seed-mode-label"]')

    expect(seedMode().text()).toBe('Random')

    seed.value = '2147483647'
    await wrapper.vm.$nextTick()

    expect(seedMode().text()).toBe('Fixed')

    seed.value = ''
    await wrapper.vm.$nextTick()

    expect(seedMode().text()).toBe('Random')
  })
})
