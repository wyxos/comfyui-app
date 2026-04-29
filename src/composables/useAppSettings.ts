export type AppSettings = {
  includeNsfw: boolean
}

type AppSettingsResponse = {
  ok?: boolean
  includeNsfw?: boolean
  message?: string
}

async function parseAppSettingsResponse(response: Response): Promise<AppSettings> {
  const payload = (await response.json().catch(() => null)) as AppSettingsResponse | null

  if (!response.ok || payload?.ok !== true) {
    throw new Error(payload?.message ?? `Settings request failed (${response.status}).`)
  }

  return {
    includeNsfw: payload.includeNsfw === true,
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

export async function saveAppSettings(settings: AppSettings): Promise<AppSettings> {
  return parseAppSettingsResponse(
    await fetch('/api/settings/app', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({
        includeNsfw: settings.includeNsfw,
      }),
    }),
  )
}
