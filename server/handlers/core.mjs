import { civitaiDownloads, civitaiImagesUrl, civitaiModelsUrl, comfyUrl } from '../config.mjs'
import { tryParseJson } from '../shared.mjs'
import { readJsonBody, sendError, sendJson, streamFile } from '../http.mjs'
import { comfyFetchJson } from '../comfy-client.mjs'
import { getStoredCivitaiApiKey } from '../settings.mjs'
import { clearDismissibleDownloads, ensureDownloadsLoaded, scheduleDownloadsPersist, serializeDownload, serializeDownloadsResponse } from '../downloads/state.mjs'
import { cleanPreviewOutputs, refreshCompletedDownloadPreviews, refreshMissingDownloadModelMetadataInBackground, safeUnlink, statFileIfExists } from '../downloads/metadata.mjs'
import { markCivitaiDownloadComplete } from '../downloads/transfer.mjs'
import { enqueueCivitaiDownload, processDownloadQueue } from '../downloads/queue.mjs'
import { enrichCheckpointOptions, enrichLoraOptions } from '../model-options.mjs'
import { buildCivitaiImagesQueryParams, buildCivitaiModelsQueryParams, parseInteger } from '../civitai-query.mjs'
import { readLoraTriggerWords } from '../model-paths.mjs'
import { extractOllamaModels, extractPromptRejectionMessage, getPreferredOllamaModel, ollamaFetchJson } from '../ollama.mjs'
import { extractCheckpointList, extractControlNetList, extractDefaultLoraStrength, extractLoraList, getPreferredCheckpoint } from '../comfy-options.mjs'
import { serializeControlNetPreprocessors } from '../controlnet-options.mjs'
import { comfySocketConnected } from '../comfy-socket.mjs'

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

    return sendJson(response, 200, {
      ok: true,
      controlNets: extractControlNetList(objectInfo),
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

export async function handleCivitaiModelsProxy(url, response, request) {
  const upstreamUrl = new URL(civitaiModelsUrl.toString())
  upstreamUrl.search = buildCivitaiModelsQueryParams(url.searchParams).toString()

  return proxyCivitaiRequest(upstreamUrl, response, 'Could not load Civitai models.', request)
}

export async function handleCivitaiImagesProxy(url, response, request) {
  const upstreamUrl = new URL(civitaiImagesUrl.toString())
  upstreamUrl.search = buildCivitaiImagesQueryParams(url.searchParams).toString()

  return proxyCivitaiRequest(upstreamUrl, response, 'Could not load Civitai images.', request)
}

export async function handleDownloadsList(response) {
  await ensureDownloadsLoaded()
  refreshMissingDownloadModelMetadataInBackground(civitaiDownloads.values())
  return sendJson(response, 200, serializeDownloadsResponse())
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

export async function handleClearDownloads(response) {
  const cleared = await clearDismissibleDownloads()
  return sendJson(response, 200, {
    ok: true,
    cleared,
    ...serializeDownloadsResponse(),
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

export async function handleDownloadAction(downloadId, action, response) {
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
    item: serializeDownload(download),
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
