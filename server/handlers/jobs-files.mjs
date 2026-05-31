import { unlink } from 'node:fs/promises'
import { jobs, outputTypes, runtimeAdapters } from '../config.mjs'
import { readFormDataBody, readJsonBody, sendError, sendJson } from '../http.mjs'
import { comfyFetchBinary, comfyFetchJson, comfyPost } from '../comfy-client.mjs'
import { buildOutputFileMeta, getComfyOutputDir, isFileLike, sanitizeFilename, sanitizeSubfolder, storeInputImageFile } from '../model-paths.mjs'
import { isJobTerminalState, markJob, serializeJob } from '../job-state.mjs'
import { deletePersistedJob, ensureJobsLoaded } from '../job-store.mjs'
import { buildQueueSummary, compareJobsForResponse, getQueueSnapshot, syncAllJobs, syncJob } from '../queue-state.mjs'
import { buildPagedJobList } from '../job-list-pagination.mjs'

export async function handleJobsList(url, response) {
  ensureJobsLoaded()
  let queueSnapshot = null
  let queueError = null

  try {
    queueSnapshot = await syncAllJobs()
  } catch (error) {
    queueError = error.payload ?? error.message
  }

  const pagedJobs = buildPagedJobList([...jobs.values()].sort(compareJobsForResponse), url)
  const serializedJobs = await Promise.all(pagedJobs.jobs.map((job) => serializeJob(job)))

  return sendJson(response, 200, {
    ok: true,
    jobs: serializedJobs,
    counts: pagedJobs.counts,
    history: pagedJobs.history,
    queue: queueSnapshot
      ? {
          ...buildQueueSummary(queueSnapshot),
          unavailable: false,
          error: null,
        }
      : {
          running: 0,
          pending: 0,
          appRunning: 0,
          appPending: 0,
          externalRunning: 0,
          externalPending: 0,
          unavailable: true,
          error: queueError,
        },
  })
}

export async function handleInputImageUpload(request, response) {
  const contentType = request.headers['content-type'] ?? ''
  if (!contentType.includes('multipart/form-data')) {
    return sendError(
      response,
      400,
      'invalid-request',
      'Input image upload must use multipart form data.',
    )
  }

  let body
  try {
    body = await readFormDataBody(request)
  } catch {
    return sendError(
      response,
      400,
      'invalid-request',
      'Request body must be valid multipart form data.',
    )
  }

  const imageFile = body.get('image')
  if (!isFileLike(imageFile) || imageFile.size <= 0) {
    return sendError(response, 400, 'missing-image', 'An input image file is required.')
  }

  try {
    const inputImageName = await storeInputImageFile(imageFile)
    return sendJson(response, 200, {
      ok: true,
      inputImageName,
    })
  } catch (error) {
    if (error.code === 'unsupported-image-type') {
      return sendError(response, 400, 'unsupported-image-type', error.message)
    }

    return sendError(
      response,
      500,
      'image-upload-failed',
      'Could not store the input image for ComfyUI.',
      error.message,
    )
  }
}

export async function handleJobStatus(promptId, response) {
  if (!promptId) {
    return sendError(response, 400, 'missing-job-id', 'Prompt id is required.')
  }

  try {
    const job = await syncJob(promptId)
    return sendJson(response, 200, await serializeJob(job))
  } catch (error) {
    return sendError(
      response,
      502,
      'comfyui-status-failed',
      'Could not read workflow status from ComfyUI.',
      error.payload ?? error.message,
    )
  }
}

export async function handleCancelJob(promptId, response) {
  if (!promptId) {
    return sendError(response, 400, 'missing-job-id', 'Prompt id is required.')
  }

  ensureJobsLoaded()
  const job = jobs.get(promptId)
  if (!job) {
    return sendError(response, 404, 'unknown-job-id', 'The selected job is not known to the companion app.')
  }

  if (isJobTerminalState(job.state)) {
    return sendJson(response, 200, await serializeJob(job))
  }

  try {
    const queueSnapshot = getQueueSnapshot(await comfyFetchJson('/queue'))
    const queueEntry = queueSnapshot.byPromptId.get(promptId) ?? null

    if (queueEntry?.state === 'running') {
      await comfyPost('/interrupt', { prompt_id: promptId })
    } else if (queueEntry?.state === 'queued') {
      await comfyPost('/queue', { delete: [promptId] })
    } else {
      const syncedJob = await syncJob(promptId, queueSnapshot)
      if (isJobTerminalState(syncedJob.state)) {
        return sendJson(response, 200, await serializeJob(syncedJob))
      }

      return sendError(
        response,
        409,
        'job-not-cancellable',
        'This job is no longer running or waiting in the ComfyUI queue.',
      )
    }

    markJob(job, {
      state: 'cancelling',
      cancelRequestedAt: Date.now(),
      error: null,
      queuePosition: queueEntry?.state === 'queued' ? queueEntry.queuePosition : null,
      queueNumber: queueEntry?.queueNumber ?? null,
      currentNodeLabel: 'Cancelling',
    })

    return sendJson(response, 200, await serializeJob(job))
  } catch (error) {
    return sendError(
      response,
      502,
      'comfyui-cancel-failed',
      'Could not cancel the selected workflow in ComfyUI.',
      error.payload ?? error.message,
    )
  }
}

export async function handleCancelQueuedJobs(response) {
  ensureJobsLoaded()

  try {
    const queueSnapshot = getQueueSnapshot(await comfyFetchJson('/queue'))
    const queuedEntries = queueSnapshot.pending.filter((entry) => jobs.has(entry.promptId))
    const promptIds = queuedEntries.map((entry) => entry.promptId)

    if (promptIds.length) {
      await comfyPost('/queue', { delete: promptIds })
    }

    const queueEntryByPromptId = new Map(queuedEntries.map((entry) => [entry.promptId, entry]))
    const cancelledJobs = promptIds
      .map((promptId) => jobs.get(promptId))
      .filter(Boolean)

    for (const job of cancelledJobs) {
      const queueEntry = queueEntryByPromptId.get(job.promptId) ?? null
      markJob(job, {
        state: 'cancelled',
        cancelRequestedAt: Date.now(),
        error: null,
        queuePosition: null,
        queueNumber: queueEntry?.queueNumber ?? null,
        currentNodeLabel: 'Cancelled',
        progressValue: null,
        progressMax: null,
      })
    }

    return sendJson(response, 200, {
      ok: true,
      cancelled: cancelledJobs.length,
      promptIds,
      jobs: await Promise.all(cancelledJobs.map((job) => serializeJob(job))),
    })
  } catch (error) {
    return sendError(
      response,
      502,
      'comfyui-cancel-queued-failed',
      'Could not cancel queued workflows in ComfyUI.',
      error.payload ?? error.message,
    )
  }
}

async function deleteGeneratedOutputFiles(job) {
  const outputPaths = new Map()
  for (const image of Array.isArray(job.outputs) ? job.outputs : []) {
    if (image?.type !== 'output' || !image.filename) {
      continue
    }

    try {
      const fileMeta = await buildOutputFileMeta(image)
      outputPaths.set(fileMeta.fullPath, fileMeta.fullPath)
    } catch {}
  }

  const deleted = []
  const missing = []
  const failed = []
  for (const fullPath of outputPaths.values()) {
    try {
      await unlink(fullPath)
      deleted.push(fullPath)
    } catch (error) {
      if (error?.code === 'ENOENT') {
        missing.push(fullPath)
      } else {
        failed.push({
          path: fullPath,
          message: error instanceof Error ? error.message : 'Could not delete generated output.',
        })
      }
    }
  }

  return {
    requested: outputPaths.size,
    deleted,
    missing,
    failed,
  }
}

export async function handleDeleteJob(promptId, url, response) {
  const normalizedPromptId = typeof promptId === 'string' ? decodeURIComponent(promptId) : ''
  if (!normalizedPromptId) {
    return sendError(response, 400, 'missing-job-id', 'Prompt id is required.')
  }

  ensureJobsLoaded()
  const job = jobs.get(normalizedPromptId)
  if (!job) {
    return sendError(response, 404, 'unknown-job-id', 'The selected job is not known to the companion app.')
  }

  if (!isJobTerminalState(job.state)) {
    return sendError(
      response,
      409,
      'job-not-in-history',
      'Only completed, failed, or cancelled history jobs can be deleted.',
    )
  }

  const shouldDeleteOutputs = ['1', 'true', 'yes'].includes(
    (url.searchParams.get('deleteOutputs') ?? '').toLowerCase(),
  )

  try {
    await comfyPost('/history', { delete: [normalizedPromptId] })
  } catch (error) {
    return sendError(
      response,
      502,
      'comfyui-history-delete-failed',
      'Could not delete the job from ComfyUI history.',
      error.payload ?? error.message,
    )
  }

  const outputs = shouldDeleteOutputs ? await deleteGeneratedOutputFiles(job) : null
  jobs.delete(normalizedPromptId)
  deletePersistedJob(normalizedPromptId)

  return sendJson(response, 200, {
    ok: true,
    promptId: normalizedPromptId,
    comfyHistoryDeleted: true,
    deletedOutputs: outputs,
  })
}

export async function handleOpenParentFolder(request, response) {
  let body
  try {
    body = await readJsonBody(request)
  } catch {
    return sendError(response, 400, 'invalid-json', 'Request body must be valid JSON.')
  }

  const filename = sanitizeFilename(body.filename)
  const subfolder = sanitizeSubfolder(body.subfolder ?? '')
  const type = body.type ?? 'output'

  if (subfolder === null || !outputTypes.has(type)) {
    return sendError(response, 400, 'invalid-image-ref', 'Image reference is invalid.')
  }

  try {
    const parentDirectory = filename
      ? (
          await buildOutputFileMeta({
            filename,
            subfolder,
            type,
          })
        ).parentDirectory
      : await getComfyOutputDir()

    await runtimeAdapters.openParentFolder(parentDirectory)

    return sendJson(response, 200, {
      ok: true,
      parentDirectory,
    })
  } catch (error) {
    return sendError(
      response,
      502,
      'open-folder-failed',
      'Could not open the output folder in Explorer.',
      error.message,
    )
  }
}

export async function handleViewProxy(url, response) {
  const filename = sanitizeFilename(url.searchParams.get('filename'))
  const subfolder = sanitizeSubfolder(url.searchParams.get('subfolder') ?? '')
  const type = url.searchParams.get('type') ?? 'output'

  if (!filename || subfolder === null || !outputTypes.has(type)) {
    return sendError(response, 400, 'invalid-image-ref', 'Image reference is invalid.')
  }

  const params = new URLSearchParams({
    filename,
    subfolder,
    type,
  })

  try {
    const proxyResponse = await comfyFetchBinary(`/view?${params.toString()}`)
    const contentType = proxyResponse.headers.get('content-type') ?? 'application/octet-stream'
    const buffer = Buffer.from(await proxyResponse.arrayBuffer())

    response.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-store',
    })
    response.end(buffer)
  } catch (error) {
    return sendError(
      response,
      502,
      'image-proxy-failed',
      'Could not fetch the image from ComfyUI.',
      error.message,
    )
  }
}
