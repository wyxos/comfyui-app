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

export { createMockDownload, createMockJob, createMockModel } from './mockApiData'

export function installMockApi(options: MockApiOptions = {}) {
  let civitaiConfigured = options.civitaiConfigured ?? false
  let includeNsfwDefault = options.includeNsfwDefault ?? false
  let jobs: MockJob[] = [...(options.jobs ?? [])]
  let downloads: MockDownload[] = [...(options.downloads ?? [])]
  let models = [...(options.models ?? [createMockModel()])]
  let inputImageUploadCount = 0
  const failures = options.failures ?? {}
  const waits = options.waits ?? {}
  const calls: FetchCall[] = []

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

    if (url.pathname === '/api/controlnet-preview' && method === 'POST') {
      return jsonResponse({
        ok: true,
        promptId: 'controlnet-preview-1',
        preprocessor: (body as Record<string, unknown> | null)?.preprocessor ?? 'lineart',
        resolution: (body as Record<string, unknown> | null)?.resolution ?? 512,
        preview: {
          filename: 'mock-controlnet-preview.png',
          subfolder: '',
          type: 'output',
          url: '/api/view?filename=mock-controlnet-preview.png&subfolder=&type=output',
        },
      })
    }

    if (url.pathname === '/api/ollama/models' && method === 'GET') {
      return jsonResponse({
        ok: true,
        models: ['gpt-oss:20b', 'llama3.2'],
        defaultModel: 'gpt-oss:20b',
      })
    }

    if (url.pathname === '/api/jobs' && method === 'GET') {
      return jsonResponse({
        ok: true,
        jobs,
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

    if (url.pathname === '/api/improve-prompt' && method === 'POST') {
      return jsonResponse({
        ok: true,
        improvedPrompt: options.improvePrompt ?? 'cinematic portrait, refined lighting, detailed composition',
        model: 'gpt-oss:20b',
      })
    }

    if (url.pathname === '/api/settings/civitai' && method === 'GET') {
      return jsonResponse({
        ok: true,
        configured: civitaiConfigured,
        keyPreview: civitaiConfigured ? 'Saved, ending in 1234' : null,
      })
    }

    if (url.pathname === '/api/settings/civitai' && method === 'PUT') {
      civitaiConfigured = true
      return jsonResponse({
        ok: true,
        configured: true,
        keyPreview: 'Saved, ending in 1234',
      })
    }

    if (url.pathname === '/api/settings/civitai' && method === 'DELETE') {
      civitaiConfigured = false
      return jsonResponse({
        ok: true,
        configured: false,
        keyPreview: null,
      })
    }

    if (url.pathname === '/api/settings/app' && method === 'GET') {
      return jsonResponse({
        ok: true,
        includeNsfw: includeNsfwDefault,
      })
    }

    if (url.pathname === '/api/settings/app' && method === 'PUT') {
      includeNsfwDefault = Boolean((body as Record<string, unknown> | null)?.includeNsfw)
      return jsonResponse({
        ok: true,
        includeNsfw: includeNsfwDefault,
      })
    }

    if (url.pathname === '/api/civitai/models' && method === 'GET') {
      const query = url.searchParams.get('query')?.toLowerCase() ?? ''
      const username = url.searchParams.get('username')?.toLowerCase() ?? ''
      const type = url.searchParams.get('types') ?? ''
      const filtered = models.filter((model) => {
        const matchesQuery = !query || String(model.name).toLowerCase().includes(query)
        const matchesUsername = !username || String(model.creator?.username ?? '').toLowerCase() === username
        const matchesType = !type || model.type === type
        return matchesQuery && matchesUsername && matchesType
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
      return jsonResponse({
        items: createMockModel().modelVersions[0].images,
        metadata: {
          totalItems: 1,
        },
      })
    }

    if (url.pathname === '/api/civitai/downloads' && method === 'GET') {
      return jsonResponse({
        ok: true,
        items: downloads,
        counts: {
          queued: downloads.filter((download) => download.state === 'queued').length,
          downloading: downloads.filter((download) => download.state === 'downloading').length,
          paused: downloads.filter((download) => download.state === 'paused').length,
          complete: downloads.filter((download) => download.state === 'complete').length,
          error: downloads.filter((download) => download.state === 'error').length,
          deleted: downloads.filter((download) => download.state === 'deleted').length,
        },
      })
    }

    if (url.pathname === '/api/civitai/downloads' && method === 'POST') {
      const download = createMockDownload()
      downloads = [download]
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
      return jsonResponse({ ok: true, item: downloads.find((download) => download.id === decodeURIComponent(downloadId)) })
    }

    if (url.pathname === '/api/civitai/downloads/clear' && method === 'POST') {
      downloads = downloads.map((download) => ({
        ...download,
        dismissedAt: Date.now(),
      }))
      return jsonResponse({ ok: true, items: downloads })
    }

    if (url.pathname === '/api/view' && method === 'GET') {
      return new Response('', {
        status: 200,
        headers: { 'Content-Type': 'image/png' },
      })
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
    get models() {
      return models
    },
    setModels(nextModels: MockModel[]) {
      models = nextModels
    },
  }
}
