import { tryParseJson } from './shared.mjs'

const maxEntries = 200
const freshTtlMs = 5 * 60 * 1000
const staleOnRateLimitTtlMs = 60 * 60 * 1000
const cache = new Map()

function cacheKey(upstreamUrl, authScope) {
  return `${authScope}:${upstreamUrl.toString()}`
}

function isObjectPayload(payload) {
  return payload && typeof payload === 'object'
}

function cacheAge(entry) {
  return Date.now() - entry.cachedAt
}

function isFresh(entry) {
  return cacheAge(entry) <= freshTtlMs
}

function isUsableStale(entry) {
  return cacheAge(entry) <= staleOnRateLimitTtlMs
}

function cacheResult(key, result) {
  if (!isObjectPayload(result.payload)) {
    return
  }

  cache.set(key, {
    cachedAt: Date.now(),
    contentType: result.contentType,
    payload: result.payload,
    text: result.text,
  })

  while (cache.size > maxEntries) {
    const oldestKey = cache.keys().next().value
    if (oldestKey === undefined) {
      return
    }
    cache.delete(oldestKey)
  }
}

function cachedResult(entry, stale = false) {
  return {
    ok: true,
    status: 200,
    contentType: entry.contentType,
    payload: entry.payload,
    text: entry.text,
    fromCache: true,
    stale,
  }
}

export function resetCivitaiCacheRuntimeState() {
  cache.clear()
}

export async function fetchCivitaiJsonWithCache(upstreamUrl, {
  authScope = 'public',
  fetchImpl = fetch,
  headers = { Accept: 'application/json' },
  signal,
} = {}) {
  const key = cacheKey(upstreamUrl, authScope)
  const entry = cache.get(key)
  if (entry && isFresh(entry)) {
    return cachedResult(entry)
  }

  const upstreamResponse = await fetchImpl(upstreamUrl, {
    headers,
    signal,
  })
  const text = await upstreamResponse.text()
  const payload = tryParseJson(text)
  const contentType = upstreamResponse.headers.get('content-type') ?? 'application/json; charset=utf-8'

  if (upstreamResponse.ok) {
    const result = {
      ok: true,
      status: upstreamResponse.status,
      contentType,
      payload,
      text,
      fromCache: false,
      stale: false,
    }
    cacheResult(key, result)
    return result
  }

  if (upstreamResponse.status === 429 && entry && isUsableStale(entry)) {
    return cachedResult(entry, true)
  }

  return {
    ok: false,
    status: upstreamResponse.status,
    contentType,
    payload,
    text,
    fromCache: false,
    stale: false,
  }
}
