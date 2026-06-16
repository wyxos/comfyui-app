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
  blurNsfwModels?: boolean
  blurNsfwMediaLevel?: number | null
  atlasUrl?: string
  atlasKeyConfigured?: boolean
  atlasKeyPreview?: string | null
  getFailureMessage?: string
  saveFailureMessage?: string
}

function installSettingsFetch(options: SettingsFetchOptions = {}) {
  let configured = options.configured ?? false
  let keyPreview = options.keyPreview ?? null
  let includeNsfw = options.includeNsfw ?? false
  let blurNsfwModels = options.blurNsfwModels ?? true
  let blurNsfwMediaLevel = options.blurNsfwMediaLevel ?? 4
  let atlasUrl = options.atlasUrl ?? ''
  let atlasKeyConfigured = options.atlasKeyConfigured ?? false
  let atlasKeyPreview = options.atlasKeyPreview ?? null

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input)
    const method = init?.method?.toUpperCase() ?? 'GET'

    if (options.getFailureMessage && method === 'GET') {
      return jsonResponse({ ok: false, message: options.getFailureMessage }, 500)
    }

    if (path === '/api/settings/app' && method === 'GET') {
      return jsonResponse({
        ok: true,
        includeNsfw,
        blurNsfwModels,
        blurNsfwMediaLevel,
        atlasUrl,
        atlasConfigured: Boolean(atlasUrl),
        atlasKeyConfigured,
        atlasKeyPreview,
      })
    }

    if (path === '/api/settings/app' && method === 'PUT') {
      const body = JSON.parse(String(init?.body ?? '{}')) as {
        includeNsfw?: boolean
        blurNsfwModels?: boolean
        blurNsfwMediaLevel?: number | null
        atlasUrl?: string
        atlasApiKey?: string
      }
      includeNsfw = body.includeNsfw === true
      blurNsfwModels = body.blurNsfwModels === true
      blurNsfwMediaLevel = body.blurNsfwMediaLevel ?? null
      if (body.atlasUrl !== undefined) {
        atlasUrl = body.atlasUrl === 'atlas.test' ? 'https://atlas.test' : body.atlasUrl
      }
      if (body.atlasApiKey !== undefined) {
        atlasKeyConfigured = Boolean(body.atlasApiKey)
        atlasKeyPreview = body.atlasApiKey ? 'Saved, ending in 1234' : null
      }
      return jsonResponse({
        ok: true,
        includeNsfw,
        blurNsfwModels,
        blurNsfwMediaLevel,
        atlasUrl,
        atlasConfigured: Boolean(atlasUrl),
        atlasKeyConfigured,
        atlasKeyPreview,
      })
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

  it('loads and persists the NSFW toggle and split blur defaults', async () => {
    const fetchMock = installSettingsFetch({ includeNsfw: false, blurNsfwModels: true, blurNsfwMediaLevel: 4 })

    const wrapper = mount(SettingsView)
    await flushPromises()

    expect(wrapper.text()).toContain('NSFW toggles default to off.')
    expect(wrapper.text()).toContain('NSFW model name blur is on.')
    expect(wrapper.text()).toContain('Image/video blur starts at R.')

    await wrapper.get('input[aria-label="Default NSFW toggles on"]').setValue(true)
    await flushPromises()

    expect(fetchMock).toHaveBeenLastCalledWith('/api/settings/app', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({ includeNsfw: true, blurNsfwModels: true, blurNsfwMediaLevel: 4 }),
    })
    expect(wrapper.text()).toContain('NSFW toggles default to on.')

    await wrapper.get('input[aria-label="Blur NSFW model names"]').setValue(false)
    await flushPromises()

    expect(fetchMock).toHaveBeenLastCalledWith('/api/settings/app', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({ includeNsfw: true, blurNsfwModels: false, blurNsfwMediaLevel: 4 }),
    })
    expect(wrapper.text()).toContain('NSFW model name blur is off.')

    await wrapper.get('select[aria-label="Blur image and video previews at or above"]').setValue('8')
    await flushPromises()

    expect(fetchMock).toHaveBeenLastCalledWith('/api/settings/app', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({ includeNsfw: true, blurNsfwModels: false, blurNsfwMediaLevel: 8 }),
    })
    expect(wrapper.text()).toContain('Image/video blur starts at X.')
  })

  it('saves Atlas URL and API key through app settings', async () => {
    const fetchMock = installSettingsFetch()

    const wrapper = mount(SettingsView)
    await flushPromises()

    expect(wrapper.text()).toContain('Atlas integration is off.')
    expect(wrapper.text()).toContain('Not configured')

    const keyInputs = wrapper.findAll('input[placeholder="Paste API key to save or replace"]')
    expect(keyInputs).toHaveLength(2)
    const atlasKeyInput = keyInputs[1]!
    await wrapper.get('input[placeholder="https://atlas.example.test"]').setValue('atlas.test')
    await atlasKeyInput.setValue('atlas-secret-1234')
    await wrapper.findAll('form')[1]?.trigger('submit')
    await flushPromises()

    expect(fetchMock).toHaveBeenLastCalledWith('/api/settings/app', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({
        includeNsfw: false,
        blurNsfwModels: true,
        blurNsfwMediaLevel: 4,
        atlasUrl: 'atlas.test',
        atlasApiKey: 'atlas-secret-1234',
      }),
    })
    expect(wrapper.text()).toContain('Atlas integration is on.')
    expect(wrapper.text()).toContain('Saved, ending in 1234')
    expect((atlasKeyInput.element as HTMLInputElement).value).toBe('')
  })
})
