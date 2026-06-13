import { civitaiModelVersionsUrl } from '../config.mjs'
import { safeTrim, tryParseJson } from '../shared.mjs'
import { buildCivitaiRequestHeaders } from './metadata.mjs'

export function normalizedAvailability(value) {
  return safeTrim(value).toLowerCase()
}

export function parseCivitaiTimestamp(value) {
  const trimmed = safeTrim(value)
  if (!trimmed) {
    return null
  }

  const timestamp = Date.parse(trimmed)
  return Number.isFinite(timestamp) ? timestamp : null
}

export function earlyAccessEndsAtMs(version) {
  return parseCivitaiTimestamp(version?.earlyAccessEndsAt)
}

export function isCivitaiEarlyAccessLocked(version, now = Date.now()) {
  if (version?.covered === true) {
    return false
  }

  const earlyAccessEnd = earlyAccessEndsAtMs(version)
  if (earlyAccessEnd && earlyAccessEnd > now) {
    return true
  }

  return normalizedAvailability(version?.availability) === 'earlyaccess'
}

export function civitaiEarlyAccessStatus(version, now = Date.now()) {
  if (!isCivitaiEarlyAccessLocked(version, now)) {
    return ''
  }

  const earlyAccessEnd = earlyAccessEndsAtMs(version)
  if (earlyAccessEnd && earlyAccessEnd > now) {
    return `Early access locked until ${new Date(earlyAccessEnd).toISOString()}.`
  }

  return 'Early access locked'
}

export function isVersionDownloadable(version, now = Date.now()) {
  const availability = normalizedAvailability(version?.availability)
  return (
    !isCivitaiEarlyAccessLocked(version, now) &&
    (!availability || availability === 'public' || (availability === 'earlyaccess' && version?.covered === true))
  )
}

export async function fetchCivitaiVersion(versionId) {
  const upstreamUrl = new URL(`${civitaiModelVersionsUrl.toString().replace(/\/$/, '')}/${versionId}`)
  const response = await fetch(upstreamUrl, {
    headers: await buildCivitaiRequestHeaders('application/json'),
    redirect: 'follow',
  })
  const text = await response.text()
  if (!response.ok) {
    const error = new Error(`Civitai returned ${response.status}.`)
    error.statusCode = response.status
    error.payload = text ? tryParseJson(text) ?? text.slice(0, 1000) : null
    throw error
  }

  const payload = tryParseJson(text)
  if (!payload || typeof payload !== 'object') {
    throw new Error('Civitai returned an invalid model version response.')
  }

  return payload
}
