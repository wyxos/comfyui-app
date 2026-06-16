import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { configDir, settingsPath } from './config.mjs'
import { NSFW_BLUR_LEVELS, normalizePlainObject, safeTrim } from './shared.mjs'

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

export function normalizeAtlasUrl(value) {
  const trimmed = safeTrim(value)
  if (!trimmed) {
    return ''
  }

  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`

  try {
    const url = new URL(candidate)
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) {
      return ''
    }

    url.hash = ''
    url.search = ''
    url.pathname = url.pathname.replace(/\/+$/, '')
    return url.toString().replace(/\/$/, '')
  } catch {
    return ''
  }
}

export function serializeAtlasSettings(settings) {
  const atlasSettings = normalizePlainObject(settings.atlas)
  const atlasUrl = normalizeAtlasUrl(atlasSettings.baseUrl)
  const apiKey = safeTrim(atlasSettings.apiKey)

  return {
    atlasUrl,
    atlasConfigured: Boolean(atlasUrl),
    atlasKeyConfigured: Boolean(apiKey),
    atlasKeyPreview: buildCivitaiKeyPreview(apiKey),
  }
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

export function normalizeBlurNsfwContent(value) {
  if (value === undefined || value === null) {
    return true
  }

  if (typeof value === 'boolean') {
    return value
  }

  if (typeof value === 'number') {
    return value > 0
  }

  if (typeof value === 'string') {
    return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase())
  }

  return true
}

export function normalizeBlurNsfwModels(value, legacyValue) {
  if (value === undefined || value === null) {
    return normalizeBlurNsfwContent(legacyValue)
  }

  return normalizeBlurNsfwContent(value)
}

export function normalizeBlurNsfwMediaLevel(value, legacyValue) {
  if (value === undefined) {
    return normalizeBlurNsfwContent(legacyValue) ? 4 : null
  }

  if (value === null || value === false) {
    return null
  }

  const numericValue = typeof value === 'number'
    ? value
    : typeof value === 'string' && value.trim()
      ? Number(value)
      : Number.NaN

  return NSFW_BLUR_LEVELS.includes(numericValue) ? numericValue : 4
}

export function serializeAppSettings(settings) {
  const preferences = normalizePlainObject(settings.preferences)

  return {
    ok: true,
    includeNsfw: normalizeIncludeNsfw(preferences.includeNsfw),
    blurNsfwModels: normalizeBlurNsfwModels(preferences.blurNsfwModels, preferences.blurNsfwContent),
    blurNsfwMediaLevel: normalizeBlurNsfwMediaLevel(preferences.blurNsfwMediaLevel, preferences.blurNsfwContent),
    ...serializeAtlasSettings(settings),
  }
}

export async function getAppSettings() {
  return serializeAppSettings(await readSettings())
}

export async function saveAppSettings(patch) {
  const settings = await readSettings()
  const preferences = normalizePlainObject(settings.preferences)
  const atlasSettings = normalizePlainObject(settings.atlas)
  settings.preferences = {
    ...preferences,
    includeNsfw: patch?.includeNsfw === undefined
      ? normalizeIncludeNsfw(preferences.includeNsfw)
      : normalizeIncludeNsfw(patch.includeNsfw),
    blurNsfwModels: patch?.blurNsfwModels === undefined
      ? normalizeBlurNsfwModels(preferences.blurNsfwModels, preferences.blurNsfwContent)
      : normalizeBlurNsfwModels(patch.blurNsfwModels, preferences.blurNsfwContent),
    blurNsfwMediaLevel: patch?.blurNsfwMediaLevel === undefined
      ? normalizeBlurNsfwMediaLevel(preferences.blurNsfwMediaLevel, preferences.blurNsfwContent)
      : normalizeBlurNsfwMediaLevel(patch.blurNsfwMediaLevel, preferences.blurNsfwContent),
  }
  delete settings.preferences.blurNsfwContent

  const nextAtlasUrl = patch?.atlasUrl === undefined
    ? normalizeAtlasUrl(atlasSettings.baseUrl)
    : normalizeAtlasUrl(patch.atlasUrl)
  const nextAtlasKey = patch?.atlasApiKey === undefined
    ? safeTrim(atlasSettings.apiKey)
    : safeTrim(patch.atlasApiKey)

  if (nextAtlasUrl || nextAtlasKey) {
    settings.atlas = {
      ...atlasSettings,
      baseUrl: nextAtlasUrl,
    }
    if (patch?.atlasApiKey !== undefined) {
      if (nextAtlasKey) {
        settings.atlas.apiKey = nextAtlasKey
      } else {
        delete settings.atlas.apiKey
      }
    } else if (nextAtlasKey) {
      settings.atlas.apiKey = nextAtlasKey
    }
  } else {
    delete settings.atlas
  }

  await writeSettings(settings)
  return serializeAppSettings(settings)
}

export async function getStoredAtlasSettings() {
  const settings = await readSettings()
  const atlasSettings = normalizePlainObject(settings.atlas)

  return {
    baseUrl: normalizeAtlasUrl(atlasSettings.baseUrl),
    apiKey: safeTrim(atlasSettings.apiKey),
  }
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
