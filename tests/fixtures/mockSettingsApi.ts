import { jsonResponse, type MockApiOptions } from './mockApiData'

export type MockSettingsApiState = {
  civitaiConfigured: boolean
  includeNsfwDefault: boolean
  blurNsfwModelsDefault: boolean
  blurNsfwMediaLevelDefault: number | null
  atlasUrl: string
  atlasKeyConfigured: boolean
}

export function isMockAtlasConfigured(state: MockSettingsApiState) {
  return Boolean(state.atlasUrl)
}

export function createMockSettingsApiState(options: MockApiOptions): MockSettingsApiState {
  return {
    civitaiConfigured: options.civitaiConfigured ?? false,
    includeNsfwDefault: options.includeNsfwDefault ?? false,
    blurNsfwModelsDefault: options.blurNsfwModelsDefault ?? true,
    blurNsfwMediaLevelDefault: options.blurNsfwMediaLevelDefault ?? 4,
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
    state.blurNsfwModelsDefault = payload?.blurNsfwModels !== false
    state.blurNsfwMediaLevelDefault = typeof payload?.blurNsfwMediaLevel === 'number'
      ? payload.blurNsfwMediaLevel
      : null
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
    blurNsfwModels: state.blurNsfwModelsDefault,
    blurNsfwMediaLevel: state.blurNsfwMediaLevelDefault,
    atlasUrl: state.atlasUrl,
    atlasConfigured: Boolean(state.atlasUrl),
    atlasKeyConfigured: state.atlasKeyConfigured,
    atlasKeyPreview: state.atlasKeyConfigured ? 'Saved, ending in 1234' : null,
  }
}
