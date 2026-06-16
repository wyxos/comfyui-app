import { readJsonBody, sendError, sendJson } from '../http.mjs'
import { NSFW_BLUR_LEVELS, safeTrim } from '../shared.mjs'
import {
  clearCivitaiApiKey,
  getAppSettings,
  getStoredCivitaiApiKey,
  saveAppSettings,
  saveCivitaiApiKey,
  serializeCivitaiSettings,
} from '../settings.mjs'

export async function handleGetCivitaiSettings(response) {
  try {
    return sendJson(response, 200, serializeCivitaiSettings(await getStoredCivitaiApiKey()))
  } catch (error) {
    return sendError(
      response,
      500,
      'settings-read-failed',
      'Could not read Civitai settings.',
      error.message,
    )
  }
}

export async function handlePutCivitaiSettings(request, response) {
  let body
  try {
    body = await readJsonBody(request)
  } catch {
    return sendError(response, 400, 'invalid-json', 'Request body must be valid JSON.')
  }

  if (typeof body.apiKey !== 'string') {
    return sendError(response, 400, 'invalid-api-key', 'apiKey must be a string.')
  }

  const apiKey = safeTrim(body.apiKey)

  try {
    if (apiKey) {
      await saveCivitaiApiKey(apiKey)
    } else {
      await clearCivitaiApiKey()
    }

    return sendJson(response, 200, serializeCivitaiSettings(apiKey))
  } catch (error) {
    return sendError(
      response,
      500,
      'settings-write-failed',
      'Could not save Civitai settings.',
      error.message,
    )
  }
}

export async function handleDeleteCivitaiSettings(response) {
  try {
    await clearCivitaiApiKey()
    return sendJson(response, 200, serializeCivitaiSettings(''))
  } catch (error) {
    return sendError(
      response,
      500,
      'settings-write-failed',
      'Could not clear Civitai settings.',
      error.message,
    )
  }
}

export async function handleGetAppSettings(response) {
  try {
    return sendJson(response, 200, await getAppSettings())
  } catch (error) {
    return sendError(
      response,
      500,
      'settings-read-failed',
      'Could not read app settings.',
      error.message,
    )
  }
}

export async function handlePutAppSettings(request, response) {
  let body
  try {
    body = await readJsonBody(request)
  } catch {
    return sendError(response, 400, 'invalid-json', 'Request body must be valid JSON.')
  }

  if (!body || typeof body.includeNsfw !== 'boolean') {
    return sendError(response, 400, 'invalid-include-nsfw', 'includeNsfw must be a boolean.')
  }

  if (body.blurNsfwModels !== undefined && typeof body.blurNsfwModels !== 'boolean') {
    return sendError(response, 400, 'invalid-blur-nsfw-models', 'blurNsfwModels must be a boolean.')
  }

  if (
    body.blurNsfwMediaLevel !== undefined &&
    body.blurNsfwMediaLevel !== null &&
    !NSFW_BLUR_LEVELS.includes(body.blurNsfwMediaLevel)
  ) {
    return sendError(
      response,
      400,
      'invalid-blur-nsfw-media-level',
      'blurNsfwMediaLevel must be null, 4, 8, 16, or 32.',
    )
  }

  if (body.atlasUrl !== undefined && typeof body.atlasUrl !== 'string') {
    return sendError(response, 400, 'invalid-atlas-url', 'atlasUrl must be a string.')
  }

  if (body.atlasApiKey !== undefined && typeof body.atlasApiKey !== 'string') {
    return sendError(response, 400, 'invalid-atlas-api-key', 'atlasApiKey must be a string.')
  }

  try {
    return sendJson(response, 200, await saveAppSettings({
      includeNsfw: body.includeNsfw,
      blurNsfwModels: body.blurNsfwModels,
      blurNsfwMediaLevel: body.blurNsfwMediaLevel,
      atlasUrl: body.atlasUrl,
      atlasApiKey: body.atlasApiKey,
    }))
  } catch (error) {
    return sendError(
      response,
      500,
      'settings-write-failed',
      'Could not save app settings.',
      error.message,
    )
  }
}
