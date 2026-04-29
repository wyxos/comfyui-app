import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { configDir, settingsPath } from './config.mjs'
import { normalizePlainObject, safeTrim } from './shared.mjs'

export async function readSettings() {
  let rawSettings
  try {
    rawSettings = await readFile(settingsPath, 'utf8')
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return {}
    }

    throw error
  }

  try {
    return normalizePlainObject(JSON.parse(rawSettings))
  } catch (error) {
    const parseError = new Error('Settings file is not valid JSON.')
    parseError.code = 'invalid-settings-json'
    parseError.cause = error
    throw parseError
  }
}

export async function writeSettings(settings) {
  await mkdir(configDir, { recursive: true })
  await writeFile(settingsPath, `${JSON.stringify(normalizePlainObject(settings), null, 2)}\n`, 'utf8')
}

export function buildCivitaiKeyPreview(apiKey) {
  const trimmedKey = safeTrim(apiKey)
  if (!trimmedKey) {
    return null
  }

  if (trimmedKey.length < 8) {
    return 'Configured'
  }

  return `Saved, ending in ${trimmedKey.slice(-4).padStart(4, '*')}`
}

export function serializeCivitaiSettings(apiKey) {
  const trimmedKey = safeTrim(apiKey)

  return {
    ok: true,
    configured: Boolean(trimmedKey),
    keyPreview: buildCivitaiKeyPreview(trimmedKey),
  }
}

export function normalizeIncludeNsfw(value) {
  if (typeof value === 'boolean') {
    return value
  }

  if (typeof value === 'number') {
    return value > 0
  }

  if (typeof value === 'string') {
    return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase())
  }

  return false
}

export function serializeAppSettings(settings) {
  const preferences = normalizePlainObject(settings.preferences)

  return {
    ok: true,
    includeNsfw: normalizeIncludeNsfw(preferences.includeNsfw),
  }
}

export async function getAppSettings() {
  return serializeAppSettings(await readSettings())
}

export async function saveAppSettings(patch) {
  const settings = await readSettings()
  const preferences = normalizePlainObject(settings.preferences)
  settings.preferences = {
    ...preferences,
    includeNsfw: normalizeIncludeNsfw(patch?.includeNsfw),
  }

  await writeSettings(settings)
  return serializeAppSettings(settings)
}

export async function getStoredCivitaiApiKey() {
  const settings = await readSettings()
  const civitaiSettings = normalizePlainObject(settings.civitai)
  return safeTrim(civitaiSettings.apiKey)
}

export async function saveCivitaiApiKey(apiKey) {
  const settings = await readSettings()
  const civitaiSettings = normalizePlainObject(settings.civitai)
  settings.civitai = {
    ...civitaiSettings,
    apiKey,
  }

  await writeSettings(settings)
}

export async function clearCivitaiApiKey() {
  const settings = await readSettings()
  const civitaiSettings = normalizePlainObject(settings.civitai)
  delete civitaiSettings.apiKey

  if (Object.keys(civitaiSettings).length) {
    settings.civitai = civitaiSettings
  } else {
    delete settings.civitai
  }

  await writeSettings(settings)
}
