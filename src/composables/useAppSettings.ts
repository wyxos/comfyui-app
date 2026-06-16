export type AppSettings = {
  includeNsfw: boolean
  blurNsfwContent: boolean
  atlasUrl: string
  atlasConfigured: boolean
  atlasKeyConfigured: boolean
  atlasKeyPreview: string | null
  atlasApiKey?: string
}

type AppSettingsResponse = {
  ok?: boolean
  includeNsfw?: boolean
  blurNsfwContent?: boolean
  atlasUrl?: string | null
  atlasConfigured?: boolean
  atlasKeyConfigured?: boolean
  atlasKeyPreview?: string | null
  message?: string
}

type SaveAppSettingsPayload = {
  includeNsfw: boolean
  blurNsfwContent: boolean
  atlasUrl?: string
  atlasApiKey?: string
}

async function parseAppSettingsResponse(response: Response): Promise<AppSettings> {
  const payload = (await response.json().catch(() => null)) as AppSettingsResponse | null

  if (!response.ok || payload?.ok !== true) {
    throw new Error(payload?.message ?? `Settings request failed (${response.status}).`)
  }

  return {
    includeNsfw: payload.includeNsfw === true,
    blurNsfwContent: payload.blurNsfwContent !== false,
    atlasUrl: typeof payload.atlasUrl === 'string' ? payload.atlasUrl : '',
    atlasConfigured: payload.atlasConfigured === true || Boolean(payload.atlasUrl),
    atlasKeyConfigured: payload.atlasKeyConfigured === true,
    atlasKeyPreview: typeof payload.atlasKeyPreview === 'string' ? payload.atlasKeyPreview : null,
  }
}

export async function fetchAppSettings(): Promise<AppSettings> {
  return parseAppSettingsResponse(
    await fetch('/api/settings/app', {
      headers: {
        Accept: 'application/json',
      },
    }),
  )
}

export async function saveAppSettings(settings: SaveAppSettingsPayload): Promise<AppSettings> {
  return parseAppSettingsResponse(
    await fetch('/api/settings/app', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({
        includeNsfw: settings.includeNsfw,
        blurNsfwContent: settings.blurNsfwContent,
        ...(settings.atlasUrl !== undefined ? { atlasUrl: settings.atlasUrl } : {}),
        ...(settings.atlasApiKey !== undefined ? { atlasApiKey: settings.atlasApiKey } : {}),
      }),
    }),
  )
}
