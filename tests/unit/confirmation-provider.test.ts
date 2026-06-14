// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick } from 'vue'
import { beforeEach, describe, expect, it } from 'vitest'

describe('ConfirmationProvider', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('renders confirmation content above the overlay so dialog buttons remain clickable', async () => {
    const { default: ConfirmationProvider } = await import('../../src/components/ConfirmationProvider.vue')
    const { useConfirmDialog } = await import('../../src/composables/useConfirmDialog')
    const Trigger = defineComponent({
      setup() {
        const confirm = useConfirmDialog()

        return () =>
          h('button', {
            type: 'button',
            onClick: () => {
              void confirm({
                title: 'Keep hash-mismatched file?',
                description: 'Confirm this action.',
                confirmLabel: 'Keep anyway',
                destructive: true,
              })
            },
          }, 'Open confirmation')
      },
    })
    const Host = defineComponent({
      setup() {
        return () =>
          h(ConfirmationProvider, null, {
            default: () => h(Trigger),
          })
      },
    })
    const wrapper = mount(Host, { attachTo: document.body })

    await wrapper.get('button').trigger('click')
    await nextTick()

    const overlay = Array.from(document.body.querySelectorAll('div'))
      .find((element) => element.classList.contains('backdrop-blur-sm'))
    const content = Array.from(document.body.querySelectorAll('div'))
      .find((element) => element.classList.contains('left-1/2') && element.textContent?.includes('Keep anyway'))

    expect(overlay?.classList.contains('z-50')).toBe(true)
    expect(content?.classList.contains('z-[60]')).toBe(true)
    expect(content?.classList.contains('pointer-events-auto')).toBe(true)
  })
})
