import { civitaiImagesUrl } from './config.mjs'
import { buildCivitaiImagesQueryParams, parseInteger } from './civitai-query.mjs'
import { sendError, sendJson } from './http.mjs'
import { getStoredCivitaiApiKey } from './settings.mjs'
import { safeTrim, tryParseJson } from './shared.mjs'

const civitaiImagePageUrl = new URL('https://civitai.com/images/')

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
}

function parseCivitaiLookupId(value) {
  if (typeof value === 'string' && !/^\d+$/.test(value.trim())) {
    return null
  }

  const parsed = parseInteger(value)
  return parsed && Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}

function civitaiSingleImageMetadata(items) {
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

function buildCivitaiHeaders(apiKey) {
  const headers = {
    Accept: 'application/json',
  }

  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`
  }

  return headers
}

async function fetchCivitaiImagesPayload(sourceParams, apiKey, signal) {
  const upstreamUrl = new URL(civitaiImagesUrl.toString())
  upstreamUrl.search = buildCivitaiImagesQueryParams(sourceParams).toString()

  const upstreamResponse = await fetch(upstreamUrl, {
    headers: buildCivitaiHeaders(apiKey),
    signal,
  })
  const text = await upstreamResponse.text()

  return {
    upstreamResponse,
    payload: tryParseJson(text),
    text,
  }
}

function extractNextDataPayload(html) {
  const match = safeTrim(html).match(/<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i)
  if (!match?.[1]) {
    return null
  }

  return tryParseJson(match[1])
}

function imageQueryData(nextData, queryName) {
  const queries = nextData?.props?.pageProps?.trpcState?.json?.queries
  if (!Array.isArray(queries)) {
    return null
  }

  const query = queries.find((candidate) => safeTrim(candidate?.queryHash).includes(`"image","${queryName}"`))
  return isPlainObject(query?.state?.data) ? query.state.data : null
}

function normalizeMetaObject(value) {
  return isPlainObject(value) ? value : null
}

function usableMetaObject(value) {
  const meta = normalizeMetaObject(value)
  return meta && Object.keys(meta).length ? meta : null
}

function imageMetaFromItem(image) {
  if (!isPlainObject(image)) {
    return null
  }

  const metadata = isPlainObject(image.metadata) ? image.metadata : null
  return usableMetaObject(image.meta) ?? usableMetaObject(metadata?.meta)
}

function normalizeCivitaiPageImage(imageId, image, generationData) {
  const metadata = isPlainObject(image?.metadata) ? image.metadata : null
  const meta = usableMetaObject(generationData?.meta)
    ?? usableMetaObject(image?.meta)
    ?? usableMetaObject(metadata?.meta)
  if (!isPlainObject(image) && !meta) {
    return null
  }

  const mimeType = safeTrim(image?.mimeType).toLowerCase()
  const imageType = safeTrim(image?.type) || (mimeType.startsWith('video/') ? 'video' : 'image')

  return {
    ...image,
    id: parseCivitaiLookupId(image?.id) ?? imageId,
    url: safeTrim(image?.url),
    width: parseInteger(image?.width) ?? undefined,
    height: parseInteger(image?.height) ?? undefined,
    hash: image?.hash ?? null,
    type: imageType,
    nsfw: image?.nsfw,
    nsfwLevel: image?.nsfwLevel ?? null,
    postId: parseCivitaiLookupId(image?.postId) ?? undefined,
    meta: meta ?? null,
  }
}

function civitaiPageImageFromNextData(nextData, imageId) {
  const image = imageQueryData(nextData, 'get')
  const generationData = imageQueryData(nextData, 'getGenerationData')

  return normalizeCivitaiPageImage(imageId, image, generationData)
}

async function fetchCivitaiImagePageFallback(imageId, signal) {
  const imageUrl = new URL(String(imageId), civitaiImagePageUrl)

  try {
    const pageResponse = await fetch(imageUrl, {
      headers: {
        Accept: 'text/html',
      },
      signal,
    })

    if (!pageResponse.ok) {
      return null
    }

    return civitaiPageImageFromNextData(extractNextDataPayload(await pageResponse.text()), imageId)
  } catch (error) {
    if (signal.aborted) {
      throw error
    }

    return null
  }
}

async function resolveCivitaiApiKey(response) {
  try {
    return await getStoredCivitaiApiKey()
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
}

function shouldFetchImagePageFallback(imageId, payload) {
  if (!imageId || !Array.isArray(payload?.items)) {
    return false
  }

  if (payload.items.length === 0) {
    return true
  }

  const matchingItem = payload.items.find((item) => parseCivitaiLookupId(item?.id) === imageId)
    ?? (payload.items.length === 1 ? payload.items[0] : null)

  return !imageMetaFromItem(matchingItem)
}

function mergeCivitaiPageImageFallback(imageId, items, fallbackImage) {
  if (!Array.isArray(items) || items.length === 0) {
    return [fallbackImage]
  }

  const fallbackMeta = imageMetaFromItem(fallbackImage)
  let merged = false
  const nextItems = items.map((item, index) => {
    if (!isPlainObject(item)) {
      return item
    }

    const itemId = parseCivitaiLookupId(item.id)
    const matchesRequestedImage = itemId === imageId || (!itemId && items.length === 1 && index === 0)
    if (!matchesRequestedImage) {
      return item
    }

    merged = true
    return {
      ...fallbackImage,
      ...item,
      id: itemId ?? imageId,
      meta: imageMetaFromItem(item) ?? fallbackMeta ?? null,
    }
  })

  return merged ? nextItems : [fallbackImage, ...items]
}

export async function handleCivitaiImagesProxyWithFallback(url, response, request = null) {
  const imageId = parseCivitaiLookupId(url.searchParams.get('imageId'))
  const apiKey = await resolveCivitaiApiKey(response)
  if (response.writableEnded) {
    return
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
    const { upstreamResponse, payload, text } = await fetchCivitaiImagesPayload(
      url.searchParams,
      apiKey,
      abortController.signal,
    )

    if (!upstreamResponse.ok) {
      return sendError(
        response,
        upstreamResponse.status >= 500 ? 502 : upstreamResponse.status,
        'civitai-request-failed',
        `Civitai returned ${upstreamResponse.status}.`,
        text ? payload ?? text.slice(0, 1000) : null,
      )
    }

    if (!payload || typeof payload !== 'object') {
      return sendError(
        response,
        502,
        'civitai-invalid-response',
        'Could not load Civitai images.',
        text.slice(0, 1000),
      )
    }

    if (shouldFetchImagePageFallback(imageId, payload)) {
      const image = await fetchCivitaiImagePageFallback(imageId, abortController.signal)
      if (image) {
        const apiReturnedItems = Array.isArray(payload.items) && payload.items.length > 0
        const items = mergeCivitaiPageImageFallback(imageId, payload.items, image)
        return sendJson(response, 200, {
          ...payload,
          items,
          metadata: apiReturnedItems ? payload.metadata : civitaiSingleImageMetadata(items),
        })
      }
    }

    return sendJson(response, 200, payload)
  } catch (error) {
    if (abortController.signal.aborted) {
      return
    }

    return sendError(
      response,
      502,
      'civitai-unreachable',
      'Could not load Civitai images.',
      error.message,
    )
  } finally {
    request?.off('aborted', abortProxyRequest)
    response.off('close', abortProxyRequest)
  }
}
