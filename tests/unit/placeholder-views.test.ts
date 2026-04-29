// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import GuidelinesView from '../../src/views/GuidelinesView.vue'

describe('placeholder and reference views', () => {
  it('renders the design guidelines route', () => {
    const wrapper = mount(GuidelinesView, {
      global: {
        stubs: {
          RouterLink: {
            template: '<a><slot /></a>',
          },
        },
      },
    })

    expect(wrapper.text()).toContain('Comfy Companion design system direction')
    expect(wrapper.text()).toContain('#001B2E')
  })
})
