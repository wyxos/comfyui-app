import { readJsonBody, sendError, sendJson } from '../http.mjs'
import { getStoredAtlasSettings } from '../settings.mjs'

function atlasEndpoint(baseUrl, pathname) {
  return new URL(pathname, baseUrl).toString()
}

async function readBody(request, response) {
  try {
    return await readJsonBody(request)
  } catch {
    sendError(response, 400, 'invalid-json', 'Request body must be valid JSON.')
    return null
  }
}

async function proxyAtlasRequest(response, pathname, body, { method = 'POST', notConfiguredPayload = null } = {}) {
  let atlasSettings
  try {
    atlasSettings = await getStoredAtlasSettings()
  } catch (error) {
    return sendError(
      response,
      500,
      'atlas-settings-read-failed',
      'Could not read Atlas settings.',
      error instanceof Error ? error.message : null,
    )
  }

  if (!atlasSettings.baseUrl) {
    if (notConfiguredPayload) {
      return sendJson(response, 200, notConfiguredPayload)
    }

    return sendError(response, 409, 'atlas-not-configured', 'Atlas integration is not configured.')
  }

  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json; charset=utf-8',
  }
  if (atlasSettings.apiKey) {
    headers['X-Atlas-Api-Key'] = atlasSettings.apiKey
  }

  let atlasResponse
  try {
    atlasResponse = await fetch(atlasEndpoint(atlasSettings.baseUrl, pathname), {
      method,
      headers,
      body: JSON.stringify(body ?? {}),
    })
  } catch (error) {
    return sendError(
      response,
      502,
      'atlas-request-failed',
      'Atlas did not respond.',
      error instanceof Error ? error.message : null,
    )
  }

  const payload = await atlasResponse.json().catch(() => null)
  if (!atlasResponse.ok) {
    return sendJson(response, atlasResponse.status, {
      ok: false,
      configured: true,
      error: 'atlas-request-failed',
      message: payload?.message ?? `Atlas returned ${atlasResponse.status}.`,
      details: payload,
    })
  }

  return sendJson(response, 200, {
    configured: true,
    ...(payload && typeof payload === 'object' ? payload : { ok: true }),
  })
}

export async function handleAtlasCivitaiStatus(request, response) {
  const body = await readBody(request, response)
  if (body === null) {
    return
  }

  return proxyAtlasRequest(response, '/api/extension/civitai/status', body, {
    notConfiguredPayload: {
      ok: true,
      configured: false,
      items: [],
    },
  })
}

export async function handleAtlasCivitaiReaction(request, response) {
  const body = await readBody(request, response)
  if (body === null) {
    return
  }

  return proxyAtlasRequest(response, '/api/extension/civitai/reactions', body)
}

export async function handleAtlasCivitaiFeed(request, response) {
  const body = await readBody(request, response)
  if (body === null) {
    return
  }

  const modelId = Number.parseInt(String(body.modelId ?? body.model_id ?? ''), 10)
  const modelVersionId = Number.parseInt(String(body.modelVersionId ?? body.model_version_id ?? ''), 10)
  const limit = Number.parseInt(String(body.limit ?? 20), 10)
  const cursor = typeof body.cursor === 'string' ? body.cursor.trim() : ''
  const sort = typeof body.sort === 'string' && body.sort.trim() ? body.sort.trim() : 'Newest'

  if (!Number.isSafeInteger(modelId) || modelId <= 0) {
    return sendError(response, 400, 'invalid-atlas-feed-model-id', 'modelId must be a positive integer.')
  }

  if (body.modelVersionId !== undefined && body.modelVersionId !== null && body.modelVersionId !== ''
    && (!Number.isSafeInteger(modelVersionId) || modelVersionId <= 0)) {
    return sendError(response, 400, 'invalid-atlas-feed-version-id', 'modelVersionId must be a positive integer.')
  }

  const payload = {
    model_id: modelId,
    sort,
    limit: Number.isSafeInteger(limit) && limit > 0 ? Math.min(limit, 200) : 20,
    ...(Number.isSafeInteger(modelVersionId) && modelVersionId > 0 ? { model_version_id: modelVersionId } : {}),
    ...(typeof body.modelType === 'string' && body.modelType.trim() ? { model_type: body.modelType.trim() } : {}),
    ...(body.nsfw === true ? { nsfw: true } : {}),
    ...(cursor ? { cursor } : {}),
  }

  return proxyAtlasRequest(response, '/api/extension/civitai/feed', payload)
}

export async function handleAtlasCivitaiOpenModel(request, response) {
  const body = await readBody(request, response)
  if (body === null) {
    return
  }

  const modelId = Number.parseInt(String(body.modelId ?? body.model_id ?? ''), 10)
  const modelVersionId = Number.parseInt(String(body.modelVersionId ?? body.model_version_id ?? ''), 10)
  const payload = {
    model_id: modelId,
    ...(Number.isSafeInteger(modelVersionId) && modelVersionId > 0 ? { model_version_id: modelVersionId } : {}),
    ...(body.nsfw === true ? { nsfw: true } : {}),
  }

  if (!Number.isSafeInteger(modelId) || modelId <= 0) {
    return sendError(response, 400, 'invalid-atlas-model-id', 'modelId must be a positive integer.')
  }

  return proxyAtlasRequest(response, '/api/extension/browse-tabs/civitai-model', payload)
}

export async function handleAtlasFileDelete(request, response, fileId) {
  const normalizedFileId = Number.parseInt(String(fileId ?? ''), 10)
  if (!Number.isSafeInteger(normalizedFileId) || normalizedFileId <= 0) {
    return sendError(response, 400, 'invalid-atlas-file-id', 'fileId must be a positive integer.')
  }

  const body = await readBody(request, response)
  if (body === null) {
    return
  }

  return proxyAtlasRequest(response, `/api/extension/files/${normalizedFileId}`, body, {
    method: 'DELETE',
  })
}
