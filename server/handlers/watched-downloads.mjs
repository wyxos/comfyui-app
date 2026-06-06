import { readJsonBody, sendError, sendJson } from '../http.mjs'
import {
  addWatchedCivitaiDownload,
  cancelWatchedCivitaiDownload,
  checkWatchedDownloads,
  createWatchedDownloadsResponse,
  ensureWatchedDownloadsLoaded,
  serializeWatchedDownload,
} from '../downloads/watched.mjs'

export async function handleWatchedDownloadsList(response) {
  await ensureWatchedDownloadsLoaded()
  return sendJson(response, 200, createWatchedDownloadsResponse())
}

export async function handlePostWatchedDownload(request, response) {
  let body
  try {
    body = await readJsonBody(request)
  } catch {
    return sendError(response, 400, 'invalid-json', 'Request body must be valid JSON.')
  }

  try {
    const item = await addWatchedCivitaiDownload(body)
    return sendJson(response, 200, {
      ok: true,
      item: serializeWatchedDownload(item),
    })
  } catch (error) {
    const statusCode = ['invalid-watch', 'unsupported-file-type', 'unsupported-model-type'].includes(error?.code)
      ? 400
      : 500

    return sendError(
      response,
      statusCode,
      error?.code ?? 'watch-download-failed',
      error instanceof Error ? error.message : 'Could not watch the Civitai version.',
    )
  }
}

export async function handleCheckWatchedDownloads(request, response) {
  let body
  try {
    body = await readJsonBody(request)
  } catch {
    return sendError(response, 400, 'invalid-json', 'Request body must be valid JSON.')
  }

  try {
    const result = await checkWatchedDownloads({ force: body?.force === true })
    return sendJson(response, 200, result)
  } catch (error) {
    return sendError(
      response,
      500,
      'watched-download-check-failed',
      error instanceof Error ? error.message : 'Could not check watched downloads.',
    )
  }
}

export async function handleCancelWatchedDownload(downloadId, response) {
  const item = await cancelWatchedCivitaiDownload(downloadId)
  if (!item) {
    return sendError(response, 404, 'watched-download-not-found', 'Watched download was not found.')
  }

  return sendJson(response, 200, {
    ok: true,
    item: serializeWatchedDownload(item),
  })
}
