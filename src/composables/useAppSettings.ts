export type NsfwMediaBlurLevel = 4 | 8 | 16 | 32 | null

export type AppSettings = {
  includeNsfw: boolean
  blurNsfwModels: boolean
  blurNsfwMediaLevel: NsfwMediaBlurLevel
  atlasUrl: string
  atlasConfigured: boolean
  atlasKeyConfigured: boolean
  atlasKeyPreview: string | null
  atlasApiKey?: string
}

type AppSettingsResponse = {
  ok?: boolean
  includeNsfw?: boolean
  blurNsfwModels?: boolean
  blurNsfwMediaLevel?: number | null
  atlasUrl?: string | null
  atlasConfigured?: boolean
  atlasKeyConfigured?: boolean
  atlasKeyPreview?: string | null
  message?: string
}

type SaveAppSettingsPayload = {
  includeNsfw: boolean
  blurNsfwModels: boolean
  blurNsfwMediaLevel: NsfwMediaBlurLevel
  atlasUrl?: string
  atlasApiKey?: string
}

function parseNsfwMediaBlurLevel(value: unknown): NsfwMediaBlurLevel {
  return value === 4 || value === 8 || value === 16 || value === 32 ? value : null
}

async function parseAppSettingsResponse(response: Response): Promise<AppSettings> {
  const payload = (await response.json().catch(() => null)) as AppSettingsResponse | null

  if (!response.ok || payload?.ok !== true) {
    throw new Error(payload?.message ?? `Settings request failed (${response.status}).`)
  }

  return {
    includeNsfw: payload.includeNsfw === true,
    blurNsfwModels: payload.blurNsfwModels !== false,
    blurNsfwMediaLevel: parseNsfwMediaBlurLevel(payload.blurNsfwMediaLevel),
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
        blurNsfwModels: settings.blurNsfwModels,
        blurNsfwMediaLevel: settings.blurNsfwMediaLevel,
        ...(settings.atlasUrl !== undefined ? { atlasUrl: settings.atlasUrl } : {}),
        ...(settings.atlasApiKey !== undefined ? { atlasApiKey: settings.atlasApiKey } : {}),
      }),
    }),
  )
}
