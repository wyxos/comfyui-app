import { civitaiDownloads } from '../config.mjs'
import { readJsonBody, sendError, sendJson, streamFile } from '../http.mjs'
import {
  clearDismissibleDownloads,
  createDownloadsPanelResponse,
  createDownloadsSummaryResponse,
  ensureDownloadsLoaded,
  scheduleDownloadsPersist,
  serializeDownload,
  serializeDownloadPanelItem,
  serializeDownloadsResponse,
} from '../downloads/state.mjs'
import {
  cleanPreviewOutputs,
  refreshCompletedDownloadPreviews,
  refreshMissingDownloadModelMetadataInBackground,
  safeUnlink,
  statFileIfExists,
} from '../downloads/metadata.mjs'
import { markCivitaiDownloadComplete } from '../downloads/transfer.mjs'
import { enqueueCivitaiDownload, processDownloadQueue } from '../downloads/queue.mjs'
import { parseInteger } from '../civitai-query.mjs'

export async function handleDownloadsList(response) {
  await ensureDownloadsLoaded()
  refreshMissingDownloadModelMetadataInBackground(civitaiDownloads.values())
  return sendJson(response, 200, serializeDownloadsResponse())
}

export async function handleDownloadsSummary(response) {
  await ensureDownloadsLoaded()
  return sendJson(response, 200, createDownloadsSummaryResponse(civitaiDownloads.values()))
}

export async function handleDownloadsPanel(response) {
  await ensureDownloadsLoaded()
  return sendJson(response, 200, createDownloadsPanelResponse(civitaiDownloads.values()))
}

export async function handleDownloadStatus(url, response) {
  await ensureDownloadsLoaded()

  const requestedId = url.searchParams.get('id')?.trim() ?? ''
  const modelId = parseInteger(url.searchParams.get('modelId'))
  const versionId = parseInteger(url.searchParams.get('versionId'))
  let download = requestedId ? civitaiDownloads.get(requestedId) : null

  if (!download && modelId) {
    const matches = [...civitaiDownloads.values()]
      .filter((item) => {
        if (parseInteger(item.modelId) !== modelId) {
          return false
        }

        return !versionId || parseInteger(item.versionId) === versionId
      })
      .sort((left, right) => (right.updatedAt ?? 0) - (left.updatedAt ?? 0))

    download = matches[0] ?? null
  }

  return sendJson(response, 200, {
    ok: true,
    item: download ? serializeDownloadPanelItem(download) : null,
  })
}

export async function handlePostDownload(request, response) {
  let body
  try {
    body = await readJsonBody(request)
  } catch {
    return sendError(response, 400, 'invalid-json', 'Request body must be valid JSON.')
  }

  try {
    const download = await enqueueCivitaiDownload(body)
    return sendJson(response, 200, {
      ok: true,
      item: serializeDownload(download),
    })
  } catch (error) {
    const statusCode = ['invalid-download', 'unsupported-file-type', 'unsupported-model-type'].includes(error?.code)
      ? 400
      : 500

    return sendError(
      response,
      statusCode,
      error?.code ?? 'download-queue-failed',
      error instanceof Error ? error.message : 'Could not queue the download.',
    )
  }
}

export async function handleClearDownloads(response, { compact = false } = {}) {
  const cleared = await clearDismissibleDownloads()
  return sendJson(response, 200, {
    ok: true,
    cleared,
    ...(compact ? createDownloadsPanelResponse(civitaiDownloads.values()) : serializeDownloadsResponse()),
  })
}

async function removeDownloadedModelFiles(download) {
  if (download.state === 'downloading' || download.state === 'queued') {
    const error = new Error('Active downloads must be paused or cancelled before their files can be removed.')
    error.code = 'download-active'
    throw error
  }

  download.abortController?.abort()
  await safeUnlink(download.partialPath)
  await safeUnlink(download.targetPath)
  await safeUnlink(download.sidecarPath)
  await safeUnlink(download.previewPath)

  if (download.targetPath) {
    await cleanPreviewOutputs(download)
  }

  if (Array.isArray(download.previewPaths)) {
    await Promise.all(download.previewPaths.map((preview) => safeUnlink(preview?.path)))
  }

  download.previewPath = null
  download.previewUrl = null
  download.previewPaths = []
}

function markDownloadReadyForRedownload(download) {
  download.state = 'queued'
  download.error = null
  download.dismissedAt = null
  download.deletedAt = null
  download.bytesDownloaded = 0
  download.progressPercent = 0
  download.startedAt = null
  download.finishedAt = null
  download.updatedAt = Date.now()
}

export async function handleDownloadAction(downloadId, action, response, { compact = false } = {}) {
  await ensureDownloadsLoaded()
  const download = civitaiDownloads.get(downloadId)
  if (!download) {
    return sendError(response, 404, 'download-not-found', 'Download was not found.')
  }

  if (action === 'pause') {
    if (download.state === 'downloading') {
      download.state = 'paused'
      download.abortController?.abort()
    } else if (download.state === 'queued') {
      download.state = 'paused'
    }
  } else if (action === 'resume') {
    if (download.state === 'paused' || download.state === 'error' || download.state === 'cancelled') {
      try {
        if (!(await markCivitaiDownloadComplete(download))) {
          download.state = 'queued'
          download.error = null
          void processDownloadQueue()
        }
      } catch {
        download.state = 'queued'
        download.error = null
        void processDownloadQueue()
      }
    }
  } else if (action === 'cancel') {
    download.state = 'cancelled'
    download.abortController?.abort()
    await safeUnlink(download.partialPath)
  } else if (action === 'repair-previews') {
    await refreshCompletedDownloadPreviews(download)
  } else if (action === 'delete-file') {
    try {
      await removeDownloadedModelFiles(download)
    } catch (error) {
      if (error?.code === 'download-active') {
        return sendError(response, 409, 'download-active', error.message)
      }

      throw error
    }

    download.state = 'deleted'
    download.error = null
    download.deletedAt = Date.now()
    download.bytesDownloaded = 0
    download.progressPercent = 0
  } else if (action === 'redownload') {
    try {
      await removeDownloadedModelFiles(download)
    } catch (error) {
      if (error?.code === 'download-active') {
        return sendError(response, 409, 'download-active', error.message)
      }

      throw error
    }

    markDownloadReadyForRedownload(download)
    void processDownloadQueue()
  } else {
    return sendError(response, 404, 'unknown-download-action', 'Download action was not found.')
  }

  download.updatedAt = Date.now()
  scheduleDownloadsPersist(true)
  return sendJson(response, 200, {
    ok: true,
    item: compact ? serializeDownloadPanelItem(download) : serializeDownload(download),
  })
}

export async function handleDownloadPreview(downloadId, response) {
  await ensureDownloadsLoaded()
  const download = civitaiDownloads.get(downloadId)
  if (!download?.previewPath || !(await statFileIfExists(download.previewPath))) {
    return sendError(response, 404, 'preview-not-found', 'Download preview was not found.')
  }

  return streamFile(response, download.previewPath)
}

export async function handleDownloadGalleryPreview(downloadId, index, response) {
  await ensureDownloadsLoaded()
  const download = civitaiDownloads.get(downloadId)
  const previewIndex = parseInteger(index)
  const preview = previewIndex === null ? null : download?.previewPaths?.[previewIndex]
  if (!preview?.path || !(await statFileIfExists(preview.path))) {
    return sendError(response, 404, 'preview-not-found', 'Download preview was not found.')
  }

  return streamFile(response, preview.path)
}

export async function handleRepairDownloadPreviews(response) {
  await ensureDownloadsLoaded()
  const completedDownloads = [...civitaiDownloads.values()].filter((download) => download.state === 'complete')
  const repaired = []

  for (const download of completedDownloads) {
    await refreshCompletedDownloadPreviews(download)
    repaired.push(serializeDownload(download))
  }

  return sendJson(response, 200, {
    ok: true,
    repaired: repaired.length,
    items: repaired,
  })
}
