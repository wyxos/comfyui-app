import { existsSync } from 'node:fs'
import { createServer } from 'node:http'
import { comfyUrl, defaultRuntimeAdapters, host, indexPath, port, refreshConfigFromEnv, runtimeAdapters } from './config.mjs'
import { resolveAsset, sendError, sendJson, streamFile } from './http.mjs'
import { comfySocketConnected, connectComfySocket, resetComfySocketRuntimeState } from './comfy-socket.mjs'
import {
  handleCheckpointList,
  handleCivitaiImagesProxy,
  handleCivitaiModelsProxy,
  handleControlNetList,
  handleLoraList,
  handlePutModelMetadata,
} from './handlers/core.mjs'
import {
  handleClearDownloads,
  handleDownloadAction,
  handleDownloadGalleryPreview,
  handleDownloadPreview,
  handleDownloadStatus,
  handleDownloadsList,
  handleDownloadsPanel,
  handleDownloadsSummary,
  handlePostDownload,
  handleRepairDownloadPreviews,
} from './handlers/downloads.mjs'
import {
  handleCancelWatchedDownload,
  handleCheckWatchedDownloads,
  handlePostWatchedDownload,
  handleWatchedDownloadsList,
} from './handlers/watched-downloads.mjs'
import { handleGenerationOptions } from './handlers/generation-options.mjs'
import {
  handleDeleteCivitaiSettings,
  handleGetAppSettings,
  handleGetCivitaiSettings,
  handlePutAppSettings,
  handlePutCivitaiSettings,
} from './handlers/settings.mjs'
import { handleGenerate } from './handlers/generate.mjs'
import { handleControlNetPreview, handleModelPreview } from './handlers/previews-prompts.mjs'
import {
  handleCancelJob,
  handleCancelQueuedJobs,
  handleDeleteJob,
  handleInputImageUpload,
  handleJobStatus,
  handleJobsList,
  handleOpenParentFolder,
  handleViewProxy,
} from './handlers/jobs-files.mjs'
import { resetDownloadsRuntimeState } from './downloads/state.mjs'
import { resetDownloadQueueRuntimeState } from './downloads/queue.mjs'
import { resetWatchedDownloadsRuntimeState, startWatchedDownloadPoller, stopWatchedDownloadPoller } from './downloads/watched.mjs'
import { resetComfyModelDirsFromEnv } from './model-paths.mjs'
import { resetModelMetadataRuntimeState } from './model-metadata.mjs'
import { resetJobStoreRuntimeState } from './job-store.mjs'

export function createCompanionServer({ connectWebSocket = true } = {}) {
  const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? `${host}:${port}`}`)

  if (url.pathname === '/health') {
    return sendJson(response, 200, {
      ok: true,
      app: 'comfyui-companion-app',
      built: existsSync(indexPath),
      host,
      port,
      comfyUrl: comfyUrl.toString(),
      websocketConnected: comfySocketConnected,
    })
  }

  if (url.pathname === '/api/checkpoints' && request.method === 'GET') {
    return handleCheckpointList(response)
  }

  if (url.pathname === '/api/loras' && request.method === 'GET') {
    return handleLoraList(response)
  }

  if (url.pathname === '/api/controlnets' && request.method === 'GET') {
    return handleControlNetList(response)
  }

  if (url.pathname === '/api/generation-options' && request.method === 'GET') {
    return handleGenerationOptions(response)
  }

  if (url.pathname === '/api/settings/civitai' && request.method === 'GET') {
    return handleGetCivitaiSettings(response)
  }

  if (url.pathname === '/api/settings/civitai' && request.method === 'PUT') {
    return handlePutCivitaiSettings(request, response)
  }

  if (url.pathname === '/api/settings/civitai' && request.method === 'DELETE') {
    return handleDeleteCivitaiSettings(response)
  }

  if (url.pathname === '/api/settings/app' && request.method === 'GET') {
    return handleGetAppSettings(response)
  }

  if (url.pathname === '/api/settings/app' && request.method === 'PUT') {
    return handlePutAppSettings(request, response)
  }

  if (url.pathname === '/api/civitai/models' && request.method === 'GET') {
    return handleCivitaiModelsProxy(url, response, request)
  }

  if (url.pathname === '/api/civitai/images' && request.method === 'GET') {
    return handleCivitaiImagesProxy(url, response, request)
  }

  if (url.pathname === '/api/civitai/downloads' && request.method === 'GET') {
    return handleDownloadsList(response)
  }

  if (url.pathname === '/api/civitai/downloads/summary' && request.method === 'GET') {
    return handleDownloadsSummary(response)
  }

  if (url.pathname === '/api/civitai/downloads/panel' && request.method === 'GET') {
    return handleDownloadsPanel(response)
  }

  if (url.pathname === '/api/civitai/downloads/status' && request.method === 'GET') {
    return handleDownloadStatus(url, response)
  }

  if (url.pathname === '/api/civitai/watched-downloads' && request.method === 'GET') {
    return handleWatchedDownloadsList(response)
  }

  if (url.pathname === '/api/civitai/watched-downloads' && request.method === 'POST') {
    return handlePostWatchedDownload(request, response)
  }

  if (url.pathname === '/api/civitai/watched-downloads/check' && request.method === 'POST') {
    return handleCheckWatchedDownloads(request, response)
  }

  if (url.pathname.startsWith('/api/civitai/watched-downloads/') && request.method === 'DELETE') {
    const downloadId = decodeURIComponent(url.pathname.slice('/api/civitai/watched-downloads/'.length))
    return handleCancelWatchedDownload(downloadId, response)
  }

  if (url.pathname === '/api/civitai/downloads' && request.method === 'POST') {
    return handlePostDownload(request, response)
  }

  if (url.pathname === '/api/civitai/downloads/repair-previews' && request.method === 'POST') {
    return handleRepairDownloadPreviews(response)
  }

  if (url.pathname === '/api/civitai/downloads/clear' && request.method === 'POST') {
    return handleClearDownloads(response, { compact: url.searchParams.get('view') === 'panel' })
  }

  if (url.pathname.startsWith('/api/civitai/downloads/') && url.pathname.endsWith('/preview') && request.method === 'GET') {
    const downloadId = decodeURIComponent(url.pathname.slice('/api/civitai/downloads/'.length, -'/preview'.length))
    return handleDownloadPreview(downloadId, response)
  }

  if (url.pathname.startsWith('/api/civitai/downloads/') && url.pathname.includes('/previews/') && request.method === 'GET') {
    const [downloadId, index] = url.pathname
      .slice('/api/civitai/downloads/'.length)
      .split('/previews/')
      .map((part) => decodeURIComponent(part))
    return handleDownloadGalleryPreview(downloadId, index, response)
  }

  if (url.pathname.startsWith('/api/civitai/downloads/') && request.method === 'POST') {
    const [downloadId, action] = url.pathname.slice('/api/civitai/downloads/'.length).split('/').map((part) => decodeURIComponent(part))
    if (downloadId === 'clear' && !action) {
      return handleClearDownloads(response)
    }

    if (downloadId === 'repair-previews' && !action) {
      return handleRepairDownloadPreviews(response)
    }

    return handleDownloadAction(downloadId, action, response, { compact: url.searchParams.get('view') === 'panel' })
  }

  if (url.pathname === '/api/model-preview' && request.method === 'GET') {
    return handleModelPreview(url, response)
  }

  if (url.pathname === '/api/model-metadata' && request.method === 'PUT') {
    return handlePutModelMetadata(url, request, response)
  }

  if (url.pathname === '/api/controlnet-preview' && request.method === 'POST') {
    return handleControlNetPreview(request, response)
  }

  if (url.pathname === '/api/generate' && request.method === 'POST') {
    return handleGenerate(request, response)
  }

  if (url.pathname === '/api/upload-input-image' && request.method === 'POST') {
    return handleInputImageUpload(request, response)
  }

  if (url.pathname === '/api/jobs' && request.method === 'GET') {
    return handleJobsList(url, response)
  }

  if (url.pathname === '/api/jobs/queued/cancel' && request.method === 'POST') {
    return handleCancelQueuedJobs(response)
  }

  if (url.pathname.startsWith('/api/jobs/') && url.pathname.endsWith('/cancel') && request.method === 'POST') {
    const promptId = url.pathname.slice('/api/jobs/'.length, -'/cancel'.length)
    return handleCancelJob(promptId, response)
  }

  if (url.pathname.startsWith('/api/jobs/') && request.method === 'DELETE') {
    const promptId = url.pathname.slice('/api/jobs/'.length)
    return handleDeleteJob(promptId, url, response)
  }

  if (url.pathname.startsWith('/api/jobs/') && request.method === 'GET') {
    const promptId = url.pathname.slice('/api/jobs/'.length)
    return handleJobStatus(promptId, response)
  }

  if (url.pathname === '/api/view' && request.method === 'GET') {
    return handleViewProxy(url, response)
  }

  if (url.pathname === '/api/open-parent-folder' && request.method === 'POST') {
    return handleOpenParentFolder(request, response)
  }

  if (!existsSync(indexPath)) {
    return sendError(
      response,
      503,
      'dist-missing',
      'Frontend build output was not found. Run npm run build in the app root.',
    )
  }

  const assetPath = await resolveAsset(url.pathname)
  if (!assetPath) {
    response.writeHead(404)
    response.end('Not found')
    return
  }

  streamFile(response, assetPath)
  })

  if (connectWebSocket) {
    server.once('listening', connectComfySocket)
  }

  return server
}

export function configureCompanionServerForTests(adapters = {}) {
  resetJobStoreRuntimeState()
  refreshConfigFromEnv()
  resetComfyModelDirsFromEnv()
  resetDownloadsRuntimeState()
  resetDownloadQueueRuntimeState()
  resetWatchedDownloadsRuntimeState()
  resetComfySocketRuntimeState()
  resetModelMetadataRuntimeState()
  Object.assign(runtimeAdapters, adapters)

  return () => {
    Object.assign(runtimeAdapters, defaultRuntimeAdapters)
  }
}

export function startCompanionServer(options = {}) {
  const server = createCompanionServer(options)
  server.listen(port, host, () => {
    console.log(`Comfy Companion listening on http://${host}:${port}`)
    startWatchedDownloadPoller()
  })
  server.once('close', stopWatchedDownloadPoller)
  return server
}
