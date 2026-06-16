import { civitaiModelsUrl } from '../config.mjs'
import { fetchCivitaiJsonWithCache } from '../civitai-cache.mjs'
import { sendError, sendJson } from '../http.mjs'
import { getStoredCivitaiApiKey } from '../settings.mjs'

const modelPreviewRequestLimit = 100

function parsePositiveIntegerList(searchParams, keys) {
  const values = []
  const seen = new Set()

  for (const key of keys) {
    for (const rawValue of searchParams.getAll(key)) {
      for (const rawEntry of rawValue.split(',')) {
        const entry = rawEntry.trim()
        if (!/^\d+$/.test(entry)) {
          continue
        }

        const value = Number.parseInt(entry, 10)
        if (!Number.isSafeInteger(value) || value <= 0 || seen.has(value)) {
          continue
        }

        seen.add(value)
        values.push(value)
      }
    }
  }

  return values.slice(0, modelPreviewRequestLimit)
}

function positiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0 ? value : null
}

function stringValue(value) {
  return typeof value === 'string' && value.trim() ? value : null
}

function optionalPreviewValue(value) {
  return value === null || value === undefined ? undefined : value
}

function serializePreview(image) {
  if (!image || typeof image !== 'object') {
    return null
  }

  const url = stringValue(image.url)
  if (!url) {
    return null
  }

  const preview = { url }
  for (const key of ['id', 'type', 'mediaType', 'nsfwLevel', 'width', 'height', 'hash']) {
    const value = optionalPreviewValue(image[key])
    if (value !== undefined) {
      preview[key] = value
    }
  }

  return preview
}

function serializeVersionPreviews(model, version, requestedVersionIds) {
  const modelId = positiveInteger(model?.id)
  const versionId = positiveInteger(version?.id)
  if (!modelId || !versionId) {
    return null
  }

  if (requestedVersionIds.size && !requestedVersionIds.has(versionId)) {
    return null
  }

  return {
    modelId,
    versionId,
    previews: Array.isArray(version.images)
      ? version.images.map((image) => serializePreview(image)).filter(Boolean)
      : [],
  }
}

function serializeModelPreviews(model, requestedVersionIds) {
  if (!model || typeof model !== 'object' || !Array.isArray(model.modelVersions)) {
    return []
  }

  return model.modelVersions
    .map((version) => serializeVersionPreviews(model, version, requestedVersionIds))
    .filter(Boolean)
}

async function fetchCivitaiPreviewPayload(upstreamUrl, request, response) {
  let apiKey
  try {
    apiKey = await getStoredCivitaiApiKey()
  } catch (error) {
    sendError(
      response,
      500,
      'settings-read-failed',
      'Could not read Civitai settings.',
      error.message,
    )
    return null
  }

  const headers = {
    Accept: 'application/json',
  }

  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`
  }

  const abortController = new AbortController()
  const abortPreviewRequest = () => {
    if (!abortController.signal.aborted && !response.writableEnded) {
      abortController.abort()
    }
  }

  request?.once('aborted', abortPreviewRequest)
  response.once('close', abortPreviewRequest)

  try {
    const upstreamResponse = await fetchCivitaiJsonWithCache(upstreamUrl, {
      authScope: apiKey ? 'auth' : 'public',
      headers,
      signal: abortController.signal,
    })

    if (!upstreamResponse.ok) {
      sendError(
        response,
        upstreamResponse.status >= 500 ? 502 : upstreamResponse.status,
        'civitai-request-failed',
        `Civitai returned ${upstreamResponse.status}.`,
        upstreamResponse.text ? upstreamResponse.payload ?? upstreamResponse.text.slice(0, 1000) : null,
      )
      return null
    }

    const payload = upstreamResponse.payload
    if (!payload || typeof payload !== 'object') {
      sendError(
        response,
        502,
        'civitai-invalid-response',
        'Could not load Civitai model previews.',
        upstreamResponse.text.slice(0, 1000),
      )
      return null
    }

    return payload
  } catch (error) {
    if (abortController.signal.aborted) {
      return null
    }

    sendError(
      response,
      502,
      'civitai-unreachable',
      'Could not load Civitai model previews.',
      error.message,
    )
    return null
  } finally {
    request?.off('aborted', abortPreviewRequest)
    response.off('close', abortPreviewRequest)
  }
}

export async function handleCivitaiModelPreviews(url, response, request) {
  const modelIds = parsePositiveIntegerList(url.searchParams, ['modelIds', 'modelId', 'ids'])
  if (!modelIds.length) {
    return sendError(
      response,
      400,
      'invalid-civitai-model-preview-request',
      'Provide at least one Civitai model id.',
    )
  }

  const requestedVersionIds = new Set(parsePositiveIntegerList(url.searchParams, [
    'versionIds',
    'versionId',
    'modelVersionIds',
    'modelVersionId',
  ]))
  const upstreamUrl = new URL(civitaiModelsUrl.toString())
  upstreamUrl.searchParams.set('ids', modelIds.join(','))
  upstreamUrl.searchParams.set('limit', String(modelIds.length))
  upstreamUrl.searchParams.set('nsfw', 'true')

  const payload = await fetchCivitaiPreviewPayload(upstreamUrl, request, response)
  if (!payload || response.writableEnded) {
    return
  }

  const items = Array.isArray(payload.items)
    ? payload.items.flatMap((model) => serializeModelPreviews(model, requestedVersionIds))
    : []

  return sendJson(response, 200, {
    ok: true,
    items,
  })
}
