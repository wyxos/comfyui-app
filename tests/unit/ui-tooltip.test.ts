// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { describe, expect, it } from 'vitest'

import UiTooltip from '../../src/components/ui/UiTooltip.vue'

describe('UiTooltip', () => {
  it('opens on hover and closes on leave', async () => {
    const wrapper = mount(UiTooltip, {
      attachTo: document.body,
      props: {
        content: 'Hover tooltip content',
      },
      slots: {
        default: '<button type="button">Hover trigger</button>',
      },
    })

    await wrapper.get('div').trigger('mouseenter')
    await nextTick()

    expect(document.body.textContent).toContain('Hover tooltip content')

    await wrapper.get('div').trigger('mouseleave')
    await nextTick()

    expect(document.body.textContent).not.toContain('Hover tooltip content')
  })
})
