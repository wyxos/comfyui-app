// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import AssetPreviewAtlasReactionWidget from '../../src/components/asset-preview/AssetPreviewAtlasReactionWidget.vue'

describe('AssetPreviewAtlasReactionWidget', () => {
  it('shows only a spinner while Atlas is checking the image state', () => {
    const wrapper = mount(AssetPreviewAtlasReactionWidget, {
      props: {
        checking: true,
      },
    })

    expect(wrapper.find('[data-test="asset-preview-atlas-checking"]').exists()).toBe(true)
    expect(wrapper.findAll('[data-test="asset-preview-atlas-reaction-button"]')).toHaveLength(0)
  })

  it('shows a spinner in the reaction button being submitted', () => {
    const wrapper = mount(AssetPreviewAtlasReactionWidget, {
      props: {
        status: { exists: true, reaction: null },
        pending: true,
        pendingReactionType: 'like',
      },
    })

    expect(wrapper.get('button[aria-label="Like in Atlas"]').find('[data-test="asset-preview-atlas-reaction-spinner"]').exists()).toBe(true)
    expect(wrapper.get('button[aria-label="Favorite in Atlas"]').find('[data-test="asset-preview-atlas-reaction-spinner"]').exists()).toBe(false)
  })

  it('renders Atlas download progress from the media status', () => {
    const wrapper = mount(AssetPreviewAtlasReactionWidget, {
      props: {
        status: {
          exists: true,
          reaction: 'love',
          download: {
            requested: true,
            status: 'downloading',
            progress_percent: 42,
          },
        },
      },
    })

    const progress = wrapper.get('[data-test="asset-preview-atlas-download-progress"]')
    expect(progress.attributes('aria-valuenow')).toBe('42')
    expect(progress.text()).toContain('Downloading')
    expect(progress.text()).toContain('42%')
  })

  it('shows completed progress when the file is downloaded even if a stale transfer failed', () => {
    const wrapper = mount(AssetPreviewAtlasReactionWidget, {
      props: {
        status: {
          exists: true,
          downloaded: true,
          downloaded_at: '2026-06-18T05:00:00Z',
          download: {
            requested: true,
            status: 'failed',
            progress_percent: 0,
            downloaded_at: '2026-06-18T05:00:00Z',
          },
        },
      },
    })

    const progress = wrapper.get('[data-test="asset-preview-atlas-download-progress"]')
    expect(progress.attributes('aria-valuenow')).toBe('100')
    expect(progress.text()).toContain('Complete · 100%')
  })
})
