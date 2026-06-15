import { civitaiModelsUrl } from './config.mjs'
import { fetchCivitaiJsonWithCache } from './civitai-cache.mjs'
import { parseInteger } from './civitai-query.mjs'
import { safeTrim } from './shared.mjs'
import { getStoredCivitaiApiKey } from './settings.mjs'

function parseCivitaiLookupId(value) {
  if (typeof value === 'string' && !/^\d+$/.test(value.trim())) {
    return null
  }

  const parsed = parseInteger(value)
  return parsed && Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
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

async function fetchCivitaiJsonForHydration(upstreamUrl, request = null) {
  let apiKey
  try {
    apiKey = await getStoredCivitaiApiKey()
  } catch {
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
    if (!abortController.signal.aborted) {
      abortController.abort()
    }
  }

  request?.once('aborted', abortProxyRequest)

  try {
    const upstreamResponse = await fetchCivitaiJsonWithCache(upstreamUrl, {
      authScope: apiKey ? 'auth' : 'public',
      headers,
      signal: abortController.signal,
    })
    if (!upstreamResponse.ok) {
      return null
    }

    const payload = upstreamResponse.payload
    return payload && typeof payload === 'object' ? payload : null
  } catch {
    return null
  } finally {
    request?.off('aborted', abortProxyRequest)
  }
}

function shouldHydrateModelFromVersion(model) {
  return (
    !safeTrim(model?.creator?.username) ||
    safeTrim(model?.type) === 'Unknown' ||
    safeTrim(model?.name) === `Civitai model ${model?.id}`
  )
}

function mergeHydratedCivitaiModel(versionModel, hydratedModel) {
  if (!hydratedModel || typeof hydratedModel !== 'object') {
    return versionModel
  }

  return {
    ...hydratedModel,
    id: versionModel.id,
    name: safeTrim(hydratedModel.name) || versionModel.name,
    type: safeTrim(hydratedModel.type) || versionModel.type,
    nsfw: hydratedModel.nsfw === true || versionModel.nsfw === true,
    creator: hydratedModel.creator ?? versionModel.creator,
    stats: hydratedModel.stats ?? versionModel.stats,
    tags: Array.isArray(hydratedModel.tags) ? hydratedModel.tags : versionModel.tags,
    modelVersions: versionModel.modelVersions,
  }
}

export async function modelFromCivitaiVersionWithHydration(version, request = null) {
  const versionModel = modelFromCivitaiVersion(version)
  if (!versionModel || !shouldHydrateModelFromVersion(versionModel)) {
    return versionModel
  }

  const modelUrl = new URL(`${civitaiModelsUrl.toString().replace(/\/$/, '')}/${versionModel.id}`)
  const hydratedModel = await fetchCivitaiJsonForHydration(modelUrl, request)
  return mergeHydratedCivitaiModel(versionModel, hydratedModel)
}
