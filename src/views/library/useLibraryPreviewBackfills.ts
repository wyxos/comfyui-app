import { ref } from 'vue'
import {
  previewNeedsBackfill,
  previewFor,
  type LibraryModelItem,
  type LibraryPreviewPath,
} from './libraryModelHelpers'

type LibraryPreviewBackfillResponse = {
  ok?: boolean
  message?: string
  items?: Array<{
    modelId?: number | null
    versionId?: number | null
    previews?: LibraryPreviewPath[]
  }>
}

function modelVersionKey(modelId: number, versionId: number) {
  return `${modelId}:${versionId}`
}

function positiveLibraryId(value: number | null | undefined) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null
}

function previewBackfillKeyFor(item: LibraryModelItem) {
  const modelId = positiveLibraryId(item.modelId)
  const versionId = positiveLibraryId(item.versionId)
  return modelId && versionId ? modelVersionKey(modelId, versionId) : ''
}

function normalizedBackfilledPreviews(previews: unknown): LibraryPreviewPath[] {
  if (!Array.isArray(previews)) {
    return []
  }

  return previews.flatMap((preview) => {
    if (!preview || typeof preview !== 'object') {
      return []
    }

    const previewRecord = preview as Record<string, unknown>
    if (typeof previewRecord.url !== 'string' || !previewRecord.url.trim()) {
      return []
    }

    return [{
      id: previewRecord.id as LibraryPreviewPath['id'],
      url: previewRecord.url,
      type: previewRecord.type as LibraryPreviewPath['type'],
      mediaType: previewRecord.mediaType as LibraryPreviewPath['mediaType'],
      nsfwLevel: previewRecord.nsfwLevel as LibraryPreviewPath['nsfwLevel'],
      width: previewRecord.width as LibraryPreviewPath['width'],
      height: previewRecord.height as LibraryPreviewPath['height'],
      hash: previewRecord.hash as LibraryPreviewPath['hash'],
    }]
  })
}

function previewString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function previewIdentity(value: unknown) {
  if (value === null || value === undefined) {
    return ''
  }

  const normalized = String(value).trim()
  return normalized ? normalized.toLowerCase() : ''
}

function matchingBackfillIndex(
  preview: LibraryPreviewPath,
  previews: LibraryPreviewPath[],
  usedIndexes: Set<number>,
  fallbackIndex: number,
) {
  const id = previewIdentity(preview.id)
  const hash = previewIdentity(preview.hash)
  const url = previewString(preview.url)

  for (const [index, candidate] of previews.entries()) {
    if (usedIndexes.has(index)) {
      continue
    }

    if (id && id === previewIdentity(candidate.id)) {
      return index
    }

    if (hash && hash === previewIdentity(candidate.hash)) {
      return index
    }

    if (url && url === previewString(candidate.url)) {
      return index
    }
  }

  return fallbackIndex < previews.length && !usedIndexes.has(fallbackIndex) ? fallbackIndex : -1
}

function mergePreviewMetadata(preview: LibraryPreviewPath, backfill: LibraryPreviewPath | null): LibraryPreviewPath {
  if (!backfill) {
    return preview
  }

  return {
    ...preview,
    id: preview.id ?? backfill.id,
    type: preview.type ?? backfill.type,
    mediaType: preview.mediaType ?? backfill.mediaType ?? backfill.type,
    nsfwLevel: preview.nsfwLevel ?? backfill.nsfwLevel,
    width: preview.width ?? backfill.width,
    height: preview.height ?? backfill.height,
    hash: preview.hash ?? backfill.hash,
  }
}

function mergedPreviewPaths(item: LibraryModelItem, previews: LibraryPreviewPath[]) {
  const existingPreviews = item.previewPaths ?? []
  if (!existingPreviews.length) {
    return previews
  }

  const usedIndexes = new Set<number>()
  const merged = existingPreviews.map((preview, index) => {
    const backfillIndex = matchingBackfillIndex(preview, previews, usedIndexes, index)
    const backfill = backfillIndex >= 0 ? previews[backfillIndex] : null
    if (backfillIndex >= 0) {
      usedIndexes.add(backfillIndex)
    }

    return mergePreviewMetadata(preview, backfill)
  })

  return [
    ...merged,
    ...previews.filter((_, index) => !usedIndexes.has(index)),
  ]
}

export function useLibraryPreviewBackfills() {
  const previewBackfills = ref<Record<string, LibraryPreviewPath[]>>({})
  const pendingPreviewBackfillKeys = new Set<string>()
  const failedPreviewBackfillKeys = new Set<string>()

  function withPreviewBackfill(item: LibraryModelItem): LibraryModelItem {
    if (item.librarySource !== 'downloaded' && item.librarySource !== 'watched') {
      return item
    }

    const key = previewBackfillKeyFor(item)
    const previews = key ? previewBackfills.value[key] : null
    const previewUrl = previewFor(item) || (previews?.find((preview) => preview.url)?.url ?? null)
    if (!previewUrl || !previews?.length) {
      return item
    }

    return {
      ...item,
      previewUrl,
      previewPaths: mergedPreviewPaths(item, previews),
    }
  }

  function shouldBackfillPreview(item: LibraryModelItem) {
    if (item.librarySource !== 'downloaded' && item.librarySource !== 'watched') {
      return false
    }

    const key = previewBackfillKeyFor(item)
    return Boolean(
      key &&
      previewNeedsBackfill(item) &&
      !previewBackfills.value[key]?.length &&
      !pendingPreviewBackfillKeys.has(key) &&
      !failedPreviewBackfillKeys.has(key),
    )
  }

  async function loadMissingLibraryPreviewBackfills(items: LibraryModelItem[]) {
    const requestedItems = new Map<string, { modelId: number; versionId: number }>()
    for (const item of items) {
      if (!shouldBackfillPreview(item)) {
        continue
      }

      const modelId = positiveLibraryId(item.modelId)
      const versionId = positiveLibraryId(item.versionId)
      if (!modelId || !versionId) {
        continue
      }

      requestedItems.set(modelVersionKey(modelId, versionId), { modelId, versionId })
    }

    if (!requestedItems.size) {
      return
    }

    const keys = Array.from(requestedItems.keys())
    keys.forEach((key) => pendingPreviewBackfillKeys.add(key))

    try {
      const modelIds = Array.from(new Set(Array.from(requestedItems.values()).map((item) => item.modelId)))
      const versionIds = Array.from(new Set(Array.from(requestedItems.values()).map((item) => item.versionId)))
      const params = new URLSearchParams({
        modelIds: modelIds.join(','),
        versionIds: versionIds.join(','),
      })
      const response = await fetch(`/api/civitai/model-previews?${params.toString()}`, {
        headers: { Accept: 'application/json' },
      })
      const payload = (await response.json()) as LibraryPreviewBackfillResponse
      if (!response.ok || payload.ok === false) {
        throw new Error(payload.message ?? `Civitai previews returned ${response.status}`)
      }

      const nextBackfills = { ...previewBackfills.value }
      const returnedKeys = new Set<string>()
      for (const item of payload.items ?? []) {
        const modelId = positiveLibraryId(item.modelId)
        const versionId = positiveLibraryId(item.versionId)
        if (!modelId || !versionId) {
          continue
        }

        const key = modelVersionKey(modelId, versionId)
        const previews = normalizedBackfilledPreviews(item.previews)
        returnedKeys.add(key)
        if (previews.length) {
          nextBackfills[key] = previews
        } else {
          failedPreviewBackfillKeys.add(key)
        }
      }

      keys
        .filter((key) => !returnedKeys.has(key))
        .forEach((key) => failedPreviewBackfillKeys.add(key))
      previewBackfills.value = nextBackfills
    } catch {
      keys.forEach((key) => failedPreviewBackfillKeys.add(key))
    } finally {
      keys.forEach((key) => pendingPreviewBackfillKeys.delete(key))
    }
  }

  return {
    loadMissingLibraryPreviewBackfills,
    withPreviewBackfill,
  }
}
