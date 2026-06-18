import { readFile, stat } from 'node:fs/promises'
import { basename } from 'node:path'

import { extractCivitaiImageId } from '../server/civitai-archive-images.mjs'
import { getArchiveSidecarPath } from '../server/civitai-archive-paths.mjs'
import { civitaiDownloads, refreshConfigFromEnv } from '../server/config.mjs'
import { ensureDownloadsLoaded, resetDownloadsRuntimeState } from '../server/downloads/state.mjs'
import { imageListNsfwLevelDetectedValue, normalizePlainObject, safeTrim } from '../server/shared.mjs'

function increment(map, key) {
  map[key] = (map[key] ?? 0) + 1
}

function asPositiveInteger(value) {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.trunc(value)
  }
  const parsed = Number.parseInt(safeTrim(value), 10)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}

function firstText(...values) {
  for (const value of values) {
    const text = safeTrim(value)
    if (text) return text
  }
  return ''
}

function firstHttpUrl(...values) {
  for (const value of values) {
    const text = safeTrim(value)
    if (!text) continue

    try {
      const url = new URL(text)
      if (url.protocol === 'http:' || url.protocol === 'https:') {
        return url.toString()
      }
    } catch {}
  }
  return ''
}

function arrayValue(value) {
  return Array.isArray(value) ? value : []
}

async function fileExists(filePath) {
  if (!safeTrim(filePath)) return false
  try {
    const stats = await stat(filePath)
    return stats.isFile()
  } catch {
    return false
  }
}

async function readJsonFileIfExists(filePath) {
  if (!safeTrim(filePath)) return null
  try {
    return JSON.parse(await readFile(filePath, 'utf8'))
  } catch {
    return null
  }
}

async function readDownloadSidecar(download) {
  const candidates = [
    safeTrim(download?.sidecarPath),
    download?.targetPath ? getArchiveSidecarPath(download.targetPath) : '',
  ].filter(Boolean)
  const seen = new Set()

  for (const candidate of candidates) {
    const key = candidate.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)

    const payload = await readJsonFileIfExists(candidate)
    if (payload) return payload
  }
  return null
}

function previewMediaType(source, url) {
  const explicitType = safeTrim(source?.mediaType ?? source?.type).toLowerCase()
  if (explicitType.includes('video')) return 'video'

  try {
    const extension = new URL(url).pathname.split('.').pop()?.toLowerCase() ?? ''
    return ['mp4', 'webm', 'mov', 'm4v'].includes(extension) ? 'video' : 'image'
  } catch {
    return 'image'
  }
}

function normalizePreview(source) {
  const imageId = asPositiveInteger(extractCivitaiImageId(source))
  if (!imageId) {
    return { skipped: true, reason: 'missing-preview-image-id' }
  }

  const url = firstHttpUrl(source?.remoteUrl, source?.originalUrl, source?.sourceUrl, source?.url, source?.localUrl)
  if (!url) {
    return { skipped: true, reason: 'missing-preview-url' }
  }

  return {
    id: imageId,
    url,
    type: previewMediaType(source, url),
    nsfwLevel: source?.nsfwLevel ?? null,
    width: asPositiveInteger(source?.width),
    height: asPositiveInteger(source?.height),
    hash: safeTrim(source?.hash),
    postId: source?.postId ?? null,
    username: safeTrim(source?.username),
    meta: normalizePlainObject(source?.meta),
  }
}

export function atlasDownloadedPreviewKey(preview) {
  if (preview.id) return `id:${preview.id}`
  if (preview.hash) return `hash:${preview.hash.toLowerCase()}`
  return `url:${preview.url}`
}

function normalizePreviewList(download, sidecar, summary) {
  const sources = [
    ...arrayValue(sidecar?.previewImages),
    ...arrayValue(sidecar?.previewPaths),
    ...arrayValue(download?.previewImages),
    ...arrayValue(download?.previewPaths),
    download?.previewImage,
  ].filter(Boolean)
  const previews = []
  const seen = new Set()

  for (const source of sources) {
    const preview = normalizePreview(source)
    if (preview.skipped) {
      summary.skippedPreviews += 1
      increment(summary.skipReasons, preview.reason)
      continue
    }

    const key = atlasDownloadedPreviewKey(preview)
    if (seen.has(key)) continue
    seen.add(key)
    previews.push(preview)
  }
  return previews
}

function modelTypeFrom(download, sidecar) {
  return firstText(download?.modelType, sidecar?.modelType, sidecar?.model?.type, sidecar?.modelMetadata?.type)
}

async function targetFromDownload(download, summary) {
  if (!(await fileExists(download?.targetPath))) {
    summary.skippedDownloads += 1
    increment(summary.skipReasons, 'missing-model-file')
    return null
  }

  const sidecar = await readDownloadSidecar(download)
  const model = normalizePlainObject(sidecar?.model)
  const modelMetadata = normalizePlainObject(sidecar?.modelMetadata)
  const modelVersion = normalizePlainObject(sidecar?.modelVersion)
  const modelId = asPositiveInteger(download?.modelId ?? sidecar?.modelId ?? model.id ?? modelMetadata.id)
  const versionId = asPositiveInteger(
    download?.versionId ?? sidecar?.versionId ?? sidecar?.modelVersionId ?? modelVersion.id,
  )

  if (!modelId || !versionId) {
    summary.skippedDownloads += 1
    increment(summary.skipReasons, !modelId ? 'missing-model-id' : 'missing-version-id')
    return null
  }

  const previews = normalizePreviewList(download, sidecar, summary)
  const nsfw = download?.nsfw === true ||
    sidecar?.modelNsfw === true ||
    model.nsfw === true ||
    imageListNsfwLevelDetectedValue(previews) === true

  return {
    asset: {
      id: modelId,
      name: firstText(download?.modelName, sidecar?.modelName, model.name, modelMetadata.name, `Model ${modelId}`),
      type: modelTypeFrom(download, sidecar),
      creator: normalizePlainObject(model.creator ?? modelMetadata.creator),
    },
    version: {
      id: versionId,
      name: firstText(download?.versionName, sidecar?.versionName, modelVersion.name, `Version ${versionId}`),
      baseModel: firstText(download?.baseModel, sidecar?.baseModel, modelVersion.baseModel),
      fileName: firstText(download?.fileName, sidecar?.fileName, basename(safeTrim(download?.targetPath))),
      nsfw,
      previews,
    },
  }
}

function addVersionPreview(version, preview) {
  const key = atlasDownloadedPreviewKey(preview)
  if (version.previewKeys.has(key)) return
  version.previewKeys.add(key)
  version.previews.push(preview)
}

function addTarget(assetsById, target) {
  let asset = assetsById.get(target.asset.id)
  if (!asset) {
    asset = { ...target.asset, versions: [], versionMap: new Map() }
    assetsById.set(target.asset.id, asset)
  }

  let version = asset.versionMap.get(target.version.id)
  if (!version) {
    version = { ...target.version, previews: [], previewKeys: new Set() }
    asset.versionMap.set(version.id, version)
    asset.versions.push(version)
  }

  for (const preview of target.version.previews) {
    addVersionPreview(version, preview)
  }
}

function stripInternalMaps(assets) {
  return assets.map((asset) => ({
    id: asset.id,
    name: asset.name,
    type: asset.type,
    creator: asset.creator,
    versions: asset.versions.map((version) => ({
      id: version.id,
      name: version.name,
      baseModel: version.baseModel,
      fileName: version.fileName,
      nsfw: version.nsfw,
      previews: version.previews,
    })),
  }))
}

export async function collectDownloadedAtlasTargets() {
  refreshConfigFromEnv()
  resetDownloadsRuntimeState()
  await ensureDownloadsLoaded()

  const summary = {
    downloadCount: civitaiDownloads.size,
    completedDownloadCount: 0,
    skippedDownloads: 0,
    skippedPreviews: 0,
    skipReasons: {},
  }
  const assetsById = new Map()

  for (const download of civitaiDownloads.values()) {
    if (download?.state !== 'complete') continue
    summary.completedDownloadCount += 1

    const target = await targetFromDownload(download, summary)
    if (target) addTarget(assetsById, target)
  }

  const assets = stripInternalMaps([...assetsById.values()])
  summary.assetCount = assets.length
  summary.versionCount = assets.reduce((total, asset) => total + asset.versions.length, 0)
  summary.previewCount = assets.reduce(
    (assetTotal, asset) => assetTotal + asset.versions.reduce((versionTotal, version) => {
      return versionTotal + version.previews.length
    }, 0),
    0,
  )

  return { assets, summary }
}
