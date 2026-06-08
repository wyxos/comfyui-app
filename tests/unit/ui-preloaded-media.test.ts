// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import UiPreloadedMedia from '../../src/components/ui/UiPreloadedMedia.vue'

describe('UiPreloadedMedia', () => {
  it('shows an image loading state before revealing the loaded image', async () => {
    const wrapper = mount(UiPreloadedMedia, {
      props: {
        src: '/preview.png',
        alt: 'Preview image',
        label: 'Loading preview',
        mediaClass: 'h-full w-full',
      },
    })

    expect(wrapper.get('[data-test="media-loading"]').isVisible()).toBe(true)
    expect(wrapper.get('img').classes()).toContain('opacity-0')

    await wrapper.get('img').trigger('load')

    expect(wrapper.find('[data-test="media-loading"]').exists()).toBe(false)
    expect(wrapper.get('img').classes()).toContain('opacity-100')
  })

  it('shows a video loading state until metadata is ready', async () => {
    const wrapper = mount(UiPreloadedMedia, {
      props: {
        src: '/preview.mp4',
        isVideo: true,
        label: 'Loading preview video',
        mediaClass: 'h-full w-full',
      },
    })

    expect(wrapper.get('[data-test="media-loading"]').isVisible()).toBe(true)
    expect(wrapper.get('video').classes()).toContain('opacity-0')

    await wrapper.get('video').trigger('loadedmetadata')

    expect(wrapper.find('[data-test="media-loading"]').exists()).toBe(false)
    expect(wrapper.get('video').classes()).toContain('opacity-100')
  })
})
