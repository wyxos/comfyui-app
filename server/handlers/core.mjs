import { civitaiModelsUrl, civitaiModelVersionsUrl, comfyUrl } from '../config.mjs'
import { safeTrim, tryParseJson } from '../shared.mjs'
import { readJsonBody, sendError, sendJson } from '../http.mjs'
import { comfyFetchJson } from '../comfy-client.mjs'
import { getStoredCivitaiApiKey } from '../settings.mjs'
import { enrichCheckpointOptions, enrichControlNetOptions, enrichLoraOptions } from '../model-options.mjs'
import { buildCivitaiModelsQueryParams, parseInteger } from '../civitai-query.mjs'
import { getComfyCheckpointDir, getComfyControlNetDir, getComfyLoraDir } from '../model-paths.mjs'
import { readLoraTriggerWords } from '../model-trigger-words.mjs'
import { writeManualModelCompatibilityMetadata } from '../model-metadata.mjs'
import { extractOllamaModels, extractPromptRejectionMessage, getPreferredOllamaModel, ollamaFetchJson } from '../ollama.mjs'
import { extractCheckpointList, extractControlNetList, extractDefaultLoraStrength, extractLoraList, getPreferredCheckpoint } from '../comfy-options.mjs'
import { serializeControlNetPreprocessors } from '../controlnet-options.mjs'
import { comfySocketConnected } from '../comfy-socket.mjs'
import { handleCivitaiImagesProxyWithFallback } from '../civitai-image-page.mjs'

export async function handleCheckpointList(response) {
  try {
    const objectInfo = await comfyFetchJson('/object_info/CheckpointLoaderSimple')
    const checkpoints = await enrichCheckpointOptions(extractCheckpointList(objectInfo))

    return sendJson(response, 200, {
      ok: true,
      checkpoints,
      defaultCheckpoint: getPreferredCheckpoint(checkpoints),
      comfyUrl: comfyUrl.toString(),
      websocketConnected: comfySocketConnected,
    })
  } catch (error) {
    if (error?.payload?.error || error?.payload?.node_errors) {
      return sendError(
        response,
        400,
        'comfyui-rejected',
        extractPromptRejectionMessage(error.payload),
        error.payload,
      )
    }

    return sendError(
      response,
      502,
      'comfyui-unreachable',
      'Could not load checkpoints from ComfyUI.',
      error.payload ?? error.message,
    )
  }
}

export async function handleLoraList(response) {
  try {
    const objectInfo = await comfyFetchJson('/object_info/LoraLoader')
    const loraNames = extractLoraList(objectInfo)
    const loras = await enrichLoraOptions(await Promise.all(
      loraNames.map(async (lora) => ({
        ...lora,
        triggerWords: await readLoraTriggerWords(lora.name),
      })),
    ))

    return sendJson(response, 200, {
      ok: true,
      loras,
      defaultStrength: extractDefaultLoraStrength(objectInfo),
    })
  } catch (error) {
    if (error?.statusCode === 404) {
      return sendJson(response, 200, {
        ok: true,
        loras: [],
        defaultStrength: 1,
      })
    }

    return sendError(
      response,
      502,
      'comfyui-unreachable',
      'Could not load LoRAs from ComfyUI.',
      error.payload ?? error.message,
    )
  }
}

export async function handleControlNetList(response) {
  try {
    const objectInfo = await comfyFetchJson('/object_info/ControlNetLoader')
    const controlNets = await enrichControlNetOptions(extractControlNetList(objectInfo))

    return sendJson(response, 200, {
      ok: true,
      controlNets,
      preprocessors: serializeControlNetPreprocessors(),
    })
  } catch (error) {
    if (error?.statusCode === 404) {
      return sendJson(response, 200, {
        ok: true,
        controlNets: [],
        preprocessors: serializeControlNetPreprocessors(),
      })
    }

    return sendError(
      response,
      502,
      'comfyui-unreachable',
      'Could not load ControlNet models from ComfyUI.',
      error.payload ?? error.message,
    )
  }
}

function resolveMetadataModelType(value) {
  const normalized = safeTrim(value).toLowerCase()
  if (normalized === 'checkpoint') {
    return { label: 'Checkpoint', getRootPath: getComfyCheckpointDir }
  }

  if (normalized === 'lora') {
    return { label: 'LORA', getRootPath: getComfyLoraDir }
  }

  if (normalized === 'controlnet' || normalized === 'control-net') {
    return { label: 'ControlNet', getRootPath: getComfyControlNetDir }
  }

  return null
}

export async function handlePutModelMetadata(url, request, response) {
  const modelName = safeTrim(url.searchParams.get('name'))
  const modelType = resolveMetadataModelType(url.searchParams.get('type'))
  if (!modelName || !modelType) {
    return sendError(
      response,
      400,
      'invalid-model-metadata-request',
      'Provide a model type and model name for metadata updates.',
    )
  }

  let body
  try {
    body = await readJsonBody(request)
  } catch {
    return sendError(response, 400, 'invalid-request', 'Request body must be valid JSON.')
  }

  try {
    const { metadata, path } = await writeManualModelCompatibilityMetadata({
      rootPath: await modelType.getRootPath(),
      modelName,
      modelType: modelType.label,
      payload: body?.metadata ?? body,
    })

    return sendJson(response, 200, {
      ok: true,
      metadata,
      path,
    })
  } catch (error) {
    if (error?.code === 'invalid-model-name') {
      return sendError(response, 400, 'invalid-model-name', error.message)
    }

    return sendError(
      response,
      500,
      'model-metadata-write-failed',
      'Could not save model compatibility metadata.',
      error.message,
    )
  }
}

export async function handleOllamaModels(response) {
  try {
    const payload = await ollamaFetchJson('/api/tags', {
      method: 'GET',
    })
    const models = extractOllamaModels(payload)

    return sendJson(response, 200, {
      ok: true,
      models,
      defaultModel: getPreferredOllamaModel(models),
    })
  } catch (error) {
    return sendError(
      response,
      502,
      'ollama-unreachable',
      'Could not load Ollama models.',
      error.payload ?? error.message,
    )
  }
}

export async function proxyCivitaiRequest(upstreamUrl, response, unavailableMessage, request = null) {
  let apiKey
  try {
    apiKey = await getStoredCivitaiApiKey()
  } catch (error) {
    return sendError(
      response,
      500,
      'settings-read-failed',
      'Could not read Civitai settings.',
      error.message,
    )
  }

  const headers = {
    Accept: 'application/json',
  }

  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`
  }

  const abortController = new AbortController()
  const abortProxyRequest = () => {
    if (!abortController.signal.aborted && !response.writableEnded) {
      abortController.abort()
    }
  }

  request?.once('aborted', abortProxyRequest)
  response.once('close', abortProxyRequest)

  try {
    const proxyResponse = await fetch(upstreamUrl, {
      headers,
      signal: abortController.signal,
    })
    const text = await proxyResponse.text()
    const contentType = proxyResponse.headers.get('content-type') ?? 'application/json; charset=utf-8'

    if (!proxyResponse.ok) {
      return sendError(
        response,
        proxyResponse.status >= 500 ? 502 : proxyResponse.status,
        'civitai-request-failed',
        `Civitai returned ${proxyResponse.status}.`,
        text ? tryParseJson(text) ?? text.slice(0, 1000) : null,
      )
    }

    response.writeHead(200, {
      'Content-Type': contentType.includes('application/json')
        ? 'application/json; charset=utf-8'
        : contentType,
      'Cache-Control': 'no-store',
    })
    response.end(text)
  } catch (error) {
    if (abortController.signal.aborted) {
      return
    }

    return sendError(
      response,
      502,
      'civitai-unreachable',
      unavailableMessage,
      error.message,
    )
  } finally {
    request?.off('aborted', abortProxyRequest)
    response.off('close', abortProxyRequest)
  }
}

async function fetchCivitaiJson(upstreamUrl, response, unavailableMessage, request = null) {
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
  const abortProxyRequest = () => {
    if (!abortController.signal.aborted && !response.writableEnded) {
      abortController.abort()
    }
  }

  request?.once('aborted', abortProxyRequest)
  response.once('close', abortProxyRequest)

  try {
    const upstreamResponse = await fetch(upstreamUrl, {
      headers,
      signal: abortController.signal,
    })
    const text = await upstreamResponse.text()

    if (!upstreamResponse.ok) {
      sendError(
        response,
        upstreamResponse.status >= 500 ? 502 : upstreamResponse.status,
        'civitai-request-failed',
        `Civitai returned ${upstreamResponse.status}.`,
        text ? tryParseJson(text) ?? text.slice(0, 1000) : null,
      )
      return null
    }

    const payload = tryParseJson(text)
    if (!payload || typeof payload !== 'object') {
      sendError(
        response,
        502,
        'civitai-invalid-response',
        unavailableMessage,
        text.slice(0, 1000),
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
      unavailableMessage,
      error.message,
    )
    return null
  } finally {
    request?.off('aborted', abortProxyRequest)
    response.off('close', abortProxyRequest)
  }
}

function parseCivitaiLookupId(value) {
  if (typeof value === 'string' && !/^\d+$/.test(value.trim())) {
    return null
  }

  const parsed = parseInteger(value)
  return parsed && Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}

function firstCivitaiLookupId(searchParams, keys) {
  for (const key of keys) {
    const parsed = parseCivitaiLookupId(searchParams.get(key))
    if (parsed) {
      return parsed
    }
  }

  return null
}

function civitaiSingleModelMetadata(items) {
  return {
    totalItems: items.length,
    currentPage: 1,
    pageSize: items.length,
    totalPages: items.length ? 1 : 0,
    nextCursor: null,
    nextPage: null,
    prevPage: null,
  }
}

function normalizeCivitaiVersionForModel(version) {
  if (!version || typeof version !== 'object') {
    return null
  }

  const versionId = parseCivitaiLookupId(version.id)
  if (!versionId) {
    return null
  }

  return {
    ...version,
    id: versionId,
  }
}

function modelFromCivitaiVersion(version) {
  const modelId = parseCivitaiLookupId(version?.modelId ?? version?.model?.id)
  const modelVersion = normalizeCivitaiVersionForModel(version)
  if (!modelId || !modelVersion) {
    return null
  }

  return {
    id: modelId,
    name: safeTrim(version?.model?.name) || `Civitai model ${modelId}`,
    type: safeTrim(version?.model?.type) || 'Unknown',
    nsfw: version?.model?.nsfw === true,
    creator: version?.model?.creator ?? null,
    stats: version?.model?.stats ?? version?.stats ?? undefined,
    tags: Array.isArray(version?.model?.tags) ? version.model.tags : [],
    modelVersions: [modelVersion],
  }
}

function sendCivitaiSingleModelResponse(response, model) {
  const items = model ? [model] : []
  return sendJson(response, 200, {
    items,
    metadata: civitaiSingleModelMetadata(items),
  })
}

export async function handleCivitaiModelsProxy(url, response, request) {
  const modelVersionId = firstCivitaiLookupId(url.searchParams, ['modelVersionId', 'versionId'])
  if (modelVersionId) {
    const versionUrl = new URL(`${civitaiModelVersionsUrl.toString().replace(/\/$/, '')}/${modelVersionId}`)
    const version = await fetchCivitaiJson(versionUrl, response, 'Could not load Civitai model version.', request)
    if (!version || response.writableEnded) {
      return
    }

    const model = modelFromCivitaiVersion(version)
    if (!model) {
      return sendError(
        response,
        502,
        'civitai-invalid-response',
        'Civitai did not return a model id for that model version.',
      )
    }

    return sendCivitaiSingleModelResponse(response, model)
  }

  const modelId = firstCivitaiLookupId(url.searchParams, ['modelId'])
  if (modelId) {
    const modelUrl = new URL(`${civitaiModelsUrl.toString().replace(/\/$/, '')}/${modelId}`)
    const model = await fetchCivitaiJson(modelUrl, response, 'Could not load Civitai model.', request)
    if (!model || response.writableEnded) {
      return
    }

    return sendCivitaiSingleModelResponse(response, model)
  }

  const upstreamUrl = new URL(civitaiModelsUrl.toString())
  upstreamUrl.search = buildCivitaiModelsQueryParams(url.searchParams).toString()

  return proxyCivitaiRequest(upstreamUrl, response, 'Could not load Civitai models.', request)
}

export async function handleCivitaiImagesProxy(url, response, request) {
  return handleCivitaiImagesProxyWithFallback(url, response, request)
}
