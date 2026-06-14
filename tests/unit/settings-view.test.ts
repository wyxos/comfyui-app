// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'

import SettingsView from '../../src/views/SettingsView.vue'

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
  })
}

type SettingsFetchOptions = {
  configured?: boolean
  keyPreview?: string | null
  includeNsfw?: boolean
  blurNsfwContent?: boolean
  getFailureMessage?: string
  saveFailureMessage?: string
}

function installSettingsFetch(options: SettingsFetchOptions = {}) {
  let configured = options.configured ?? false
  let keyPreview = options.keyPreview ?? null
  let includeNsfw = options.includeNsfw ?? false
  let blurNsfwContent = options.blurNsfwContent ?? true

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input)
    const method = init?.method?.toUpperCase() ?? 'GET'

    if (options.getFailureMessage && method === 'GET') {
      return jsonResponse({ ok: false, message: options.getFailureMessage }, 500)
    }

    if (path === '/api/settings/app' && method === 'GET') {
      return jsonResponse({ ok: true, includeNsfw, blurNsfwContent })
    }

    if (path === '/api/settings/app' && method === 'PUT') {
      const body = JSON.parse(String(init?.body ?? '{}')) as { includeNsfw?: boolean, blurNsfwContent?: boolean }
      includeNsfw = body.includeNsfw === true
      blurNsfwContent = body.blurNsfwContent === true
      return jsonResponse({ ok: true, includeNsfw, blurNsfwContent })
    }

    if (path === '/api/settings/civitai' && method === 'GET') {
      return jsonResponse({ ok: true, configured, keyPreview })
    }

    if (path === '/api/settings/civitai' && method === 'PUT') {
      if (options.saveFailureMessage) {
        return jsonResponse({ ok: false, message: options.saveFailureMessage }, 500)
      }

      configured = true
      keyPreview = 'Saved, ending in 1234'
      return jsonResponse({ ok: true, configured, keyPreview })
    }

    if (path === '/api/settings/civitai' && method === 'DELETE') {
      configured = false
      keyPreview = null
      return jsonResponse({ ok: true, configured, keyPreview })
    }

    return jsonResponse({ ok: false, message: `Unhandled request: ${method} ${path}` }, 500)
  })

  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('SettingsView', () => {
  it('loads, saves, and clears the Civitai key through the settings API', async () => {
    const fetchMock = installSettingsFetch()

    const wrapper = mount(SettingsView)
    await flushPromises()

    expect(wrapper.text()).toContain('No Civitai API key saved yet.')
    expect(wrapper.text()).toContain('Not configured')

    await wrapper.get('input[type="password"]').setValue('  abcdef1234  ')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(fetchMock).toHaveBeenLastCalledWith('/api/settings/civitai', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({ apiKey: 'abcdef1234' }),
    })
    expect(wrapper.text()).toContain('Civitai API key saved to this machine.')
    expect(wrapper.text()).toContain('Saved, ending in 1234')
    expect((wrapper.get('input[type="password"]').element as HTMLInputElement).value).toBe('')

    await wrapper.get('button[type="button"]').trigger('click')
    await flushPromises()

    expect(fetchMock).toHaveBeenLastCalledWith('/api/settings/civitai', {
      method: 'DELETE',
    })
    expect(wrapper.text()).toContain('Civitai API key cleared from this machine.')
  })

  it('surfaces server-side settings errors', async () => {
    installSettingsFetch({ getFailureMessage: 'Settings file is invalid.' })

    const wrapper = mount(SettingsView)
    await flushPromises()

    expect(wrapper.text()).toContain('Settings file is invalid.')
  })

  it('clears the saved key when submitting a blank value', async () => {
    const fetchMock = installSettingsFetch({
      configured: true,
      keyPreview: 'Saved, ending in 1234',
    })

    const wrapper = mount(SettingsView)
    await flushPromises()

    expect(wrapper.text()).toContain('Saved, ending in 1234')

    await wrapper.get('input[type="password"]').setValue('   ')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(fetchMock).toHaveBeenLastCalledWith('/api/settings/civitai', {
      method: 'DELETE',
    })
    expect(wrapper.text()).toContain('Civitai API key cleared from this machine.')
  })

  it('surfaces save failures without discarding the typed key', async () => {
    installSettingsFetch({ saveFailureMessage: 'Could not write settings.' })

    const wrapper = mount(SettingsView)
    await flushPromises()

    await wrapper.get('input[type="password"]').setValue('abcdef1234')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(wrapper.text()).toContain('Could not write settings.')
    expect((wrapper.get('input[type="password"]').element as HTMLInputElement).value).toBe('abcdef1234')
  })

  it('loads and persists the NSFW toggle and blur defaults', async () => {
    const fetchMock = installSettingsFetch({ includeNsfw: false, blurNsfwContent: true })

    const wrapper = mount(SettingsView)
    await flushPromises()

    expect(wrapper.text()).toContain('NSFW toggles default to off.')
    expect(wrapper.text()).toContain('NSFW content blur is on.')

    await wrapper.get('input[aria-label="Default NSFW toggles on"]').setValue(true)
    await flushPromises()

    expect(fetchMock).toHaveBeenLastCalledWith('/api/settings/app', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({ includeNsfw: true, blurNsfwContent: true }),
    })
    expect(wrapper.text()).toContain('NSFW toggles default to on.')

    await wrapper.get('input[aria-label="Blur visible NSFW content"]').setValue(false)
    await flushPromises()

    expect(fetchMock).toHaveBeenLastCalledWith('/api/settings/app', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({ includeNsfw: true, blurNsfwContent: false }),
    })
    expect(wrapper.text()).toContain('NSFW content blur is off.')
  })
})
