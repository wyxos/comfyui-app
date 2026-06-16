import { vi } from 'vitest'
import {
  checkpointName,
  createMockDownload,
  createMockJob,
  createMockModel,
  defaultCheckpoints,
  defaultControlNetPreprocessors,
  defaultControlNets,
  defaultLoras,
  failureFor,
  jsonResponse,
  parseRequestBody,
} from './mockApiData'
import type { FetchCall, MockApiOptions, MockDownload, MockJob, MockModel } from './mockApiData'
import { mockCivitaiModelPreviews } from './mockCivitaiModelPreviews'
import { createMockSettingsApiState, handleMockSettingsApi, isMockAtlasConfigured } from './mockSettingsApi'
import { handleMockWatchedDownloads } from './mockWatchedDownloads'
import { installMockDownloadEventsSocket } from './mockDownloadEventsSocket'

export { createMockDownload, createMockJob, createMockModel } from './mockApiData'

const onePixelPng =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lp2wngAAAABJRU5ErkJggg=='

function mockImageResponse() {
  const bytes = Uint8Array.from(atob(onePixelPng), (char) => char.charCodeAt(0))
  return new Response(bytes, {
    status: 200,
    headers: { 'Content-Type': 'image/png' },
  })
}

function modelImages(models: MockModel[]) {
  return models.flatMap((model) => {
    const versions = Array.isArray(model.modelVersions) ? model.modelVersions : []
    return versions.flatMap((version) => {
      if (!version || typeof version !== 'object' || !('images' in version)) {
        return []
      }

      return Array.isArray(version.images) ? version.images : []
    })
  })
}

export function installMockApi(options: MockApiOptions = {}) {
  const settingsState = createMockSettingsApiState(options)
  let jobs: MockJob[] = [...(options.jobs ?? [])]
  let downloads: MockDownload[] = [...(options.downloads ?? [])]
  let watchedDownloads: MockDownload[] = [...(options.watchedDownloads ?? [])]
  let models = [...(options.models ?? [createMockModel()])]
  let inputImageUploadCount = 0
  const failures = options.failures ?? {}
  const waits = options.waits ?? {}
  const calls: FetchCall[] = []

  function downloadCounts() {
    return {
      queued: downloads.filter((download) => download.state === 'queued').length,
      downloading: downloads.filter((download) => download.state === 'downloading').length,
      paused: downloads.filter((download) => download.state === 'paused').length,
      complete: downloads.filter((download) => download.state === 'complete').length,
      error: downloads.filter((download) => download.state === 'error').length,
      cancelled: downloads.filter((download) => download.state === 'cancelled').length,
      deleted: downloads.filter((download) => download.state === 'deleted').length,
      active: downloads.filter((download) => ['queued', 'downloading', 'paused'].includes(download.state)).length,
      attention: downloads.filter((download) =>
        ['error', 'cancelled'].includes(download.state) && !download.dismissedAt,
      ).length,
      visibleComplete: downloads.filter((download) => download.state === 'complete' && !download.dismissedAt).length,
    }
  }

  function panelDownloadItems() {
    return downloads.map((download) => ({
      id: download.id,
      state: download.state,
      modelId: download.modelId,
      modelName: download.modelName,
      modelType: download.modelType,
      versionId: download.versionId,
      versionName: download.versionName,
      baseModel: download.baseModel,
      fileName: download.fileName,
      fileSizeKb: download.fileSizeKb,
      bytesDownloaded: download.bytesDownloaded,
      totalBytes: download.totalBytes,
      progressPercent: download.progressPercent,
      dismissedAt: download.dismissedAt,
      deletedAt: download.deletedAt,
      createdAt: download.createdAt,
      startedAt: download.startedAt,
      finishedAt: download.finishedAt,
      error: download.error,
      updatedAt: download.updatedAt,
    }))
  }

  const downloadEvents = installMockDownloadEventsSocket(() => {
    const counts = downloadCounts()
    return {
      downloads: { ok: true, items: downloads, counts },
      panel: { ok: true, items: panelDownloadItems(), counts },
      summary: { ok: true, counts },
    }
  })

  function broadcastDownloadSnapshot() {
    downloadEvents.broadcast()
  }

  const watchedDownloadsStore = { get: () => watchedDownloads, set: (nextDownloads: MockDownload[]) => { watchedDownloads = nextDownloads } }

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://companion.test')
    const method = init?.method?.toUpperCase() ?? 'GET'
    const body = await parseRequestBody(init)
    calls.push({ path: url.pathname, method, body, search: new URLSearchParams(url.searchParams) })
    await (waits[`${method} ${url.pathname}`] ?? waits[url.pathname] ?? Promise.resolve())

    const failure = failureFor(failures, method, url.pathname)
    if (failure) {
      return jsonResponse(failure.payload ?? { ok: false, message: 'Mock API failure.' }, failure.status ?? 500)
    }

    if (url.pathname === '/api/checkpoints' && method === 'GET') {
      return jsonResponse({
        ok: true,
        checkpoints: options.checkpoints ?? defaultCheckpoints(),
        defaultCheckpoint: checkpointName,
        comfyUrl: 'http://127.0.0.1:8000/',
        websocketConnected: true,
      })
    }

    if (url.pathname === '/api/loras' && method === 'GET') {
      return jsonResponse({
        ok: true,
        loras: options.loras ?? defaultLoras(),
        defaultStrength: 0.65,
      })
    }

    if (url.pathname === '/api/controlnets' && method === 'GET') {
      return jsonResponse({
        ok: true,
        controlNets: options.controlNets ?? defaultControlNets(),
        preprocessors: defaultControlNetPreprocessors(),
      })
    }

    if (url.pathname === '/api/generation-options' && method === 'GET') {
      return jsonResponse({
        ok: true,
        samplers: ['dpmpp_2m', 'euler', 'euler_ancestral'],
        schedulers: ['karras', 'normal'],
        clipNames: ['qwen_3_06b_base.safetensors', 'custom-clip.safetensors'],
        vaeNames: ['wan_2.1_vae.safetensors', 'custom-vae.safetensors'],
        defaults: {
          sdxl: { samplerName: 'dpmpp_2m', scheduler: 'karras' },
          anima: {
            samplerName: 'euler',
            scheduler: 'normal',
            clipName: 'qwen_3_06b_base.safetensors',
            vaeName: 'wan_2.1_vae.safetensors',
          },
        },
      })
    }

    if (url.pathname === '/api/controlnet-preview' && method === 'POST') {
      return jsonResponse({
        ok: true,
        promptId: 'controlnet-preview-1',
        preprocessor: (body as Record<string, unknown> | null)?.preprocessor ?? 'lineart',
        lineartPolarity:
          (body as Record<string, unknown> | null)?.lineartPolarity ?? 'black-lines',
        resolution: (body as Record<string, unknown> | null)?.resolution ?? 512,
        preview: {
          filename: 'mock-controlnet-preview.png',
          subfolder: '',
          type: 'output',
          url: '/api/view?filename=mock-controlnet-preview.png&subfolder=&type=output',
        },
      })
    }

    if (url.pathname === '/api/jobs' && method === 'GET') {
      const runningJobs = jobs.filter((job) => job.state === 'running' || job.state === 'cancelling')
      const queuedJobs = jobs.filter((job) => job.state === 'queued')
      const historyJobs = jobs.filter((job) => !runningJobs.includes(job) && !queuedJobs.includes(job))
      const shouldPageHistory = url.searchParams.has('historyPage') || url.searchParams.has('historyLimit')
      const historyLimit = shouldPageHistory
        ? Number.parseInt(url.searchParams.get('historyLimit') ?? '10', 10) || 10
        : Math.max(1, historyJobs.length)
      const historyPage = Number.parseInt(url.searchParams.get('historyPage') ?? '1', 10) || 1
      const historyStart = Math.max(0, historyPage - 1) * historyLimit
      const pagedHistoryJobs = shouldPageHistory
        ? historyJobs.slice(historyStart, historyStart + historyLimit)
        : historyJobs

      return jsonResponse({
        ok: true,
        jobs: [...runningJobs, ...queuedJobs, ...pagedHistoryJobs],
        counts: {
          running: runningJobs.length,
          queued: queuedJobs.length,
          history: historyJobs.length,
        },
        history: {
          page: historyPage,
          pageSize: historyLimit,
          totalItems: historyJobs.length,
          totalPages: Math.max(1, Math.ceil(historyJobs.length / historyLimit)),
        },
        queue: {
          running: jobs.filter((job) => job.state === 'running').length,
          pending: jobs.filter((job) => job.state === 'queued').length,
          appRunning: jobs.filter((job) => job.state === 'running').length,
          appPending: jobs.filter((job) => job.state === 'queued').length,
          externalRunning: 0,
          externalPending: 0,
        },
      })
    }

    if (url.pathname === '/api/jobs/queued/cancel' && method === 'POST') {
      const cancelledJobs = jobs
        .filter((job) => job.state === 'queued')
        .map((job) => ({
          ...job,
          state: 'cancelled',
          cancelRequested: true,
          currentNodeLabel: 'Cancelled',
          queuePosition: null,
          queueNumber: null,
          updatedAt: Date.now(),
        }))
      const cancelledByPromptId = new Map(cancelledJobs.map((job) => [job.promptId, job]))
      jobs = jobs.map((job) => cancelledByPromptId.get(job.promptId) ?? job)

      return jsonResponse({
        ok: true,
        cancelled: cancelledJobs.length,
        promptIds: cancelledJobs.map((job) => job.promptId),
        jobs: cancelledJobs,
      })
    }

    const jobStatusMatch = url.pathname.match(/^\/api\/jobs\/([^/]+)$/)
    if (jobStatusMatch && method === 'GET') {
      const job = jobs.find((item) => item.promptId === decodeURIComponent(jobStatusMatch[1]))
      return job ? jsonResponse(job) : jsonResponse({ ok: false, message: 'Unknown job.' }, 404)
    }

    if (jobStatusMatch && method === 'DELETE') {
      const promptId = decodeURIComponent(jobStatusMatch[1])
      const job = jobs.find((item) => item.promptId === promptId)
      jobs = jobs.filter((item) => item.promptId !== promptId)
      return job
        ? jsonResponse({
            ok: true,
            promptId,
            comfyHistoryDeleted: true,
            deletedOutputs: url.searchParams.get('deleteOutputs')
              ? {
                  requested: job.outputs.length,
                  deleted: job.outputs.map((output) => output.fullPath).filter(Boolean),
                  missing: [],
                  failed: [],
                }
              : null,
          })
        : jsonResponse({ ok: false, message: 'Unknown job.' }, 404)
    }

    const cancelJobMatch = url.pathname.match(/^\/api\/jobs\/([^/]+)\/cancel$/)
    if (cancelJobMatch && method === 'POST') {
      const promptId = decodeURIComponent(cancelJobMatch[1])
      jobs = jobs.map((job) =>
        job.promptId === promptId
          ? {
              ...job,
              state: 'cancelling',
              cancelRequested: true,
              currentNodeLabel: 'Cancelling',
            }
          : job,
      )
      return jsonResponse(jobs.find((job) => job.promptId === promptId) ?? { ok: false, message: 'Unknown job.' })
    }

    if (url.pathname === '/api/generate' && method === 'POST') {
      const job = createMockJob((body ?? {}) as Record<string, unknown>, options.generateJobState ?? 'complete')
      jobs = [job, ...jobs.filter((item) => item.promptId !== job.promptId)]
      return jsonResponse({
        ok: true,
        promptId: job.promptId,
        promptIds: [job.promptId],
        promptVariants: job.promptVariants,
        state: 'queued',
        seed: job.seed,
      })
    }

    if (url.pathname === '/api/upload-input-image' && method === 'POST') {
      const fallbackInputImageName =
        inputImageUploadCount === 0 ? 'mock-upload.png' : `mock-upload-${inputImageUploadCount + 1}.png`
      const inputImageName = options.uploadInputImageNames?.[inputImageUploadCount] ?? fallbackInputImageName
      inputImageUploadCount += 1

      return jsonResponse({
        ok: true,
        inputImageName,
      })
    }

    if (url.pathname === '/api/open-parent-folder' && method === 'POST') {
      return jsonResponse({ ok: true, parentDirectory: 'C:\\mock' })
    }

    const settingsResponse = handleMockSettingsApi(settingsState, url.pathname, method, body)
    if (settingsResponse) {
      return settingsResponse
    }

    if (url.pathname === '/api/atlas/civitai/feed' && method === 'POST') {
      if (!isMockAtlasConfigured(settingsState)) {
        return jsonResponse({ ok: false, error: 'atlas-not-configured', message: 'Atlas integration is not configured.' }, 409)
      }

      return jsonResponse({ ok: true, configured: true, items: modelImages(models), metadata: { nextCursor: null } })
    }

    if (url.pathname === '/api/civitai/model-previews' && method === 'GET') {
      return jsonResponse({ ok: true, items: mockCivitaiModelPreviews(models, url) })
    }

    if (url.pathname === '/api/civitai/models' && method === 'GET') {
      const query = url.searchParams.get('query')?.toLowerCase() ?? ''
      const modelIds = (url.searchParams.get('ids') ?? '')
        .split(',')
        .map((id) => Number.parseInt(id.trim(), 10))
        .filter((id) => Number.isSafeInteger(id) && id > 0)
      const modelId = Number.parseInt(url.searchParams.get('modelId') ?? '', 10)
      const modelVersionId = Number.parseInt(
        url.searchParams.get('modelVersionId') ?? url.searchParams.get('versionId') ?? '',
        10,
      )
      const username = url.searchParams.get('username')?.toLowerCase() ?? ''
      const type = url.searchParams.get('types') ?? ''
      const filtered = models.filter((model) => {
        const matchesQuery = !query || String(model.name).toLowerCase().includes(query)
        const matchesModelId = !Number.isSafeInteger(modelId) || model.id === modelId
        const matchesModelIds = !modelIds.length || modelIds.includes(Number(model.id))
        const matchesModelVersionId =
          !Number.isSafeInteger(modelVersionId) ||
          (Array.isArray(model.modelVersions) && model.modelVersions.some((version) => version.id === modelVersionId))
        const matchesUsername = !username || String(model.creator?.username ?? '').toLowerCase() === username
        const matchesType = !type || model.type === type
        return matchesQuery && matchesModelId && matchesModelIds && matchesModelVersionId && matchesUsername && matchesType
      })

      return jsonResponse({
        items: filtered,
        metadata: {
          totalItems: filtered.length,
          totalPages: Math.max(1, Math.ceil(filtered.length / 20)),
          nextCursor: filtered.length > 1 && !url.searchParams.get('cursor') ? 'next-cursor' : null,
        },
      })
    }

    if (url.pathname === '/api/civitai/images' && method === 'GET') {
      const imageId = url.searchParams.get('imageId')
      const images = modelImages(models)
      const matchingImages = imageId
        ? images.filter((image) =>
            image && typeof image === 'object' && 'id' in image && String(image.id) === imageId,
          )
        : images

      return jsonResponse({
        items: matchingImages.length ? matchingImages : createMockModel().modelVersions[0].images,
        metadata: {
          totalItems: matchingImages.length || 1,
        },
      })
    }

    if (url.pathname === '/api/civitai/downloads/summary' && method === 'GET') {
      return jsonResponse({
        ok: true,
        counts: downloadCounts(),
      })
    }

    const watchedDownloadsResponse = handleMockWatchedDownloads(watchedDownloadsStore, url.pathname, method, body)
    if (watchedDownloadsResponse) {
      return watchedDownloadsResponse
    }

    if (url.pathname === '/api/civitai/downloads/panel' && method === 'GET') {
      return jsonResponse({
        ok: true,
        items: panelDownloadItems(),
        counts: downloadCounts(),
      })
    }

    if (url.pathname === '/api/civitai/downloads' && method === 'GET') {
      return jsonResponse({
        ok: true,
        items: downloads,
        counts: downloadCounts(),
      })
    }

    if (url.pathname === '/api/civitai/downloads' && method === 'POST') {
      const download = createMockDownload()
      downloads = [download]
      broadcastDownloadSnapshot()
      return jsonResponse({ ok: true, item: download })
    }

    const downloadActionMatch = url.pathname.match(/^\/api\/civitai\/downloads\/([^/]+)\/(pause|resume|cancel|delete-file|redownload)$/)
    if (downloadActionMatch && method === 'POST') {
      const [, downloadId, action] = downloadActionMatch
      downloads = downloads.map((download) =>
        download.id === decodeURIComponent(downloadId)
          ? {
              ...download,
              state:
                action === 'pause'
                  ? 'paused'
                  : action === 'resume' || action === 'redownload'
                    ? 'queued'
                    : action === 'delete-file'
                      ? 'deleted'
                      : 'cancelled',
              updatedAt: Date.now(),
            }
          : download,
      )
      broadcastDownloadSnapshot()
      return jsonResponse({ ok: true, item: downloads.find((download) => download.id === decodeURIComponent(downloadId)) })
    }

    if (url.pathname === '/api/civitai/downloads/clear' && method === 'POST') {
      downloads = downloads.map((download) => ({
        ...download,
        dismissedAt: Date.now(),
      }))
      broadcastDownloadSnapshot()
      return jsonResponse({ ok: true, items: downloads })
    }

    if (url.pathname === '/api/view' && method === 'GET') {
      return mockImageResponse()
    }

    return jsonResponse({ ok: false, message: `Unhandled mock endpoint: ${method} ${url.pathname}` }, 500)
  })

  vi.stubGlobal('fetch', fetchMock)

  return {
    calls,
    fetchMock,
    createMockJob,
    createMockModel,
    createMockDownload,
    get jobs() {
      return jobs
    },
    setJobs(nextJobs: MockJob[]) {
      jobs = nextJobs
    },
    get downloads() {
      return downloads
    },
    setDownloads(nextDownloads: MockDownload[]) {
      downloads = nextDownloads
    },
    get watchedDownloads() {
      return watchedDownloads
    },
    setWatchedDownloads(nextDownloads: MockDownload[]) {
      watchedDownloads = nextDownloads
    },
    get models() {
      return models
    },
    setModels(nextModels: MockModel[]) {
      models = nextModels
    },
  }
}
