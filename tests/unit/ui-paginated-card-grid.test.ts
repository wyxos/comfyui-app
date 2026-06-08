// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { describe, expect, it } from 'vitest'

import UiPaginatedCardGrid from '../../src/components/ui/UiPaginatedCardGrid.vue'

describe('UiPaginatedCardGrid', () => {
  it('supports cursor pagination controls and forwards scroll container attributes', async () => {
    const wrapper = mount(UiPaginatedCardGrid, {
      attrs: {
        'data-assets-results-scroll': '',
      },
      props: {
        itemsPresent: true,
        rangeLabel: '24 shown',
        currentPage: 1,
        pageCount: 1,
        pageText: 'Page 1',
        canGoPrevious: false,
        canGoNext: true,
      },
      slots: {
        default: '<article>Model card</article>',
      },
    })

    expect(wrapper.find('[data-assets-results-scroll]').exists()).toBe(true)
    expect(wrapper.text()).toContain('24 shown')
    expect(wrapper.text()).toContain('Page 1')
    expect(wrapper.find('article').text()).toBe('Model card')
    expect((wrapper.get('input[aria-label="Page number"]').element as HTMLInputElement).value).toBe('1')

    const buttons = wrapper.findAll('button')
    expect(buttons[0].attributes('disabled')).toBeDefined()
    expect(buttons[1].attributes('disabled')).toBeUndefined()

    await buttons[1].trigger('click')
    expect(wrapper.emitted('go-to-page')).toEqual([[2]])
  })

  it('supports direct page entry and mouse side-button pagination', async () => {
    const wrapper = mount(UiPaginatedCardGrid, {
      props: {
        itemsPresent: true,
        rangeLabel: '81-120 of 160',
        currentPage: 3,
        pageCount: 5,
        canGoPrevious: true,
        canGoNext: true,
      },
      slots: {
        default: '<article>Model card</article>',
      },
    })

    const content = wrapper.get('section')
    const forwardEvent = new MouseEvent('auxclick', { button: 4, bubbles: true, cancelable: true })
    content.element.dispatchEvent(forwardEvent)
    await nextTick()
    await content.trigger('mousedown', { button: 3 })

    const pageInput = wrapper.get('input[aria-label="Page number"]')
    ;(pageInput.element as HTMLInputElement).value = '5'
    await pageInput.trigger('input')
    await pageInput.trigger('keydown', { key: 'Enter' })

    expect(forwardEvent.defaultPrevented).toBe(true)
    expect(wrapper.emitted('go-to-page')).toEqual([[4], [2], [5]])
  })

  it('allows direct entry beyond the known next cursor page', async () => {
    const wrapper = mount(UiPaginatedCardGrid, {
      props: {
        itemsPresent: true,
        rangeLabel: '121-160 shown',
        currentPage: 4,
        pageCount: 5,
        canGoPrevious: true,
        canGoNext: true,
        pageCountExact: false,
      },
      slots: {
        default: '<article>Model card</article>',
      },
    })

    const pageInput = wrapper.get('input[aria-label="Page number"]')
    ;(pageInput.element as HTMLInputElement).value = '10'
    await pageInput.trigger('input')
    await pageInput.trigger('keydown', { key: 'Enter' })

    expect(wrapper.emitted('go-to-page')).toEqual([[10]])
  })
})
