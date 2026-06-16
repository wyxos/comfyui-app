import { jsonResponse, type MockApiOptions } from './mockApiData'

type MockSettingsApiState = {
  civitaiConfigured: boolean
  includeNsfwDefault: boolean
  blurNsfwContentDefault: boolean
  atlasUrl: string
  atlasKeyConfigured: boolean
}

export function createMockSettingsApiState(options: MockApiOptions): MockSettingsApiState {
  return {
    civitaiConfigured: options.civitaiConfigured ?? false,
    includeNsfwDefault: options.includeNsfwDefault ?? false,
    blurNsfwContentDefault: options.blurNsfwContentDefault ?? true,
    atlasUrl: '',
    atlasKeyConfigured: false,
  }
}

export function handleMockSettingsApi(
  state: MockSettingsApiState,
  pathname: string,
  method: string,
  body: unknown,
) {
  if (pathname === '/api/settings/civitai' && method === 'GET') {
    return jsonResponse({
      ok: true,
      configured: state.civitaiConfigured,
      keyPreview: state.civitaiConfigured ? 'Saved, ending in 1234' : null,
    })
  }

  if (pathname === '/api/settings/civitai' && method === 'PUT') {
    state.civitaiConfigured = true
    return jsonResponse({
      ok: true,
      configured: true,
      keyPreview: 'Saved, ending in 1234',
    })
  }

  if (pathname === '/api/settings/civitai' && method === 'DELETE') {
    state.civitaiConfigured = false
    return jsonResponse({
      ok: true,
      configured: false,
      keyPreview: null,
    })
  }

  if (pathname === '/api/settings/app' && method === 'GET') {
    return jsonResponse(appSettingsPayload(state))
  }

  if (pathname === '/api/settings/app' && method === 'PUT') {
    const payload = body as Record<string, unknown> | null
    state.includeNsfwDefault = Boolean(payload?.includeNsfw)
    state.blurNsfwContentDefault = payload?.blurNsfwContent !== false
    if (typeof payload?.atlasUrl === 'string') {
      state.atlasUrl = payload.atlasUrl
    }
    if (typeof payload?.atlasApiKey === 'string') {
      state.atlasKeyConfigured = Boolean(payload.atlasApiKey)
    }

    return jsonResponse(appSettingsPayload(state))
  }

  return null
}

function appSettingsPayload(state: MockSettingsApiState) {
  return {
    ok: true,
    includeNsfw: state.includeNsfwDefault,
    blurNsfwContent: state.blurNsfwContentDefault,
    atlasUrl: state.atlasUrl,
    atlasConfigured: Boolean(state.atlasUrl),
    atlasKeyConfigured: state.atlasKeyConfigured,
    atlasKeyPreview: state.atlasKeyConfigured ? 'Saved, ending in 1234' : null,
  }
}
