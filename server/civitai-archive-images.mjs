import { civitaiImagesUrl } from './config.mjs'
import { normalizePlainObject, safeTrim } from './shared.mjs'
import { getStoredCivitaiApiKey } from './settings.mjs'

function hasUsableMeta(image) {
  const meta = normalizePlainObject(image?.meta)
  return Object.keys(meta).length > 0
}

export function extractCivitaiImageId(image) {
  if (image?.id !== undefined && image.id !== null && image.id !== '') {
    return image.id
  }

  try {
    const fileName = new URL(safeTrim(image?.remoteUrl ?? image?.url)).pathname.split('/').pop() ?? ''
    const match = fileName.match(/^(\d+)(?:\.[a-z0-9]+)?$/i)
    return match ? Number(match[1]) : null
  } catch {
    return null
  }
}

async function archiveImageHeaders() {
  const headers = { Accept: 'application/json' }
  const apiKey = await getStoredCivitaiApiKey()
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`
  }
  return headers
}

export async function hydrateArchiveImageMetadata(images, { fetchImpl = fetch } = {}) {
  const hydrated = []

  for (const image of images) {
    const imageId = extractCivitaiImageId(image)
    const imageWithId = imageId ? { ...image, id: imageId } : image
    if (!imageId || hasUsableMeta(imageWithId)) {
      hydrated.push(imageWithId)
      continue
    }

    const upstreamUrl = new URL(civitaiImagesUrl.toString())
    upstreamUrl.searchParams.set('imageId', String(imageId))
    upstreamUrl.searchParams.set('limit', '1')

    try {
      const response = await fetchImpl(upstreamUrl, {
        headers: await archiveImageHeaders(),
        redirect: 'follow',
      })
      if (!response.ok) {
        hydrated.push(imageWithId)
        continue
      }

      const payload = await response.json()
      const detail = payload?.items?.find((item) => String(item?.id) === String(imageId)) ?? payload?.items?.[0]
      hydrated.push(detail?.meta ? { ...imageWithId, meta: normalizePlainObject(detail.meta) } : imageWithId)
    } catch {
      hydrated.push(imageWithId)
    }
  }

  return hydrated
}
