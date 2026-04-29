import { jobs } from './config.mjs'
import { safeTrim } from './shared.mjs'
import { comfyFetchJson } from './comfy-client.mjs'
import { ensureJob, getJobActiveState, isJobTerminalState, markJob, mergeJobOutputs, normalizeImage } from './job-state.mjs'
import { resolveStoredInputImageName } from './model-paths.mjs'

export function extractHistoryEntry(historyPayload, promptId) {
  return historyPayload?.[promptId] ?? null
}

export function extractImagesFromHistory(historyEntry, saveNodeMeta = {}, outputNodeOrder = []) {
  const images = []
  const outputsByNode = historyEntry?.outputs ?? {}
  const orderedNodeIds = Array.isArray(outputNodeOrder) && outputNodeOrder.length
    ? outputNodeOrder
    : Object.keys(outputsByNode)
  const seenNodeIds = new Set()

  for (const nodeId of orderedNodeIds) {
    seenNodeIds.add(String(nodeId))
    const output = outputsByNode?.[nodeId]
    if (!Array.isArray(output?.images)) {
      continue
    }

    for (const image of output.images) {
      images.push(normalizeImage({ ...image, ...saveNodeMeta?.[nodeId] }))
    }
  }

  for (const [nodeId, output] of Object.entries(outputsByNode)) {
    if (seenNodeIds.has(String(nodeId))) {
      continue
    }

    if (Array.isArray(output?.images)) {
      for (const image of output.images) {
        images.push(normalizeImage({ ...image, ...saveNodeMeta?.[nodeId] }))
      }
    }
  }

  return images
}

export function extractWorkflowFromHistory(historyEntry) {
  const prompt = historyEntry?.prompt
  if (Array.isArray(prompt) && prompt[2] && typeof prompt[2] === 'object') {
    return prompt[2]
  }

  if (prompt && typeof prompt === 'object' && !Array.isArray(prompt)) {
    return prompt
  }

  return {}
}

function getLinkedNodeId(value) {
  return Array.isArray(value) && typeof value[0] === 'string' ? value[0] : null
}

function findLoadImageUpstream(workflow, nodeId, visited = new Set()) {
  if (!nodeId || visited.has(nodeId)) {
    return null
  }

  visited.add(nodeId)
  const node = workflow?.[nodeId]
  if (!node || typeof node !== 'object') {
    return null
  }

  if (node.class_type === 'LoadImage') {
    const imageName = safeTrim(node.inputs?.image)
    return imageName || null
  }

  for (const inputValue of Object.values(node.inputs ?? {})) {
    const linkedNodeId = getLinkedNodeId(inputValue)
    const imageName = findLoadImageUpstream(workflow, linkedNodeId, visited)
    if (imageName) {
      return imageName
    }
  }

  return null
}

export function extractInputImageNameFromHistory(historyEntry) {
  const workflow = extractWorkflowFromHistory(historyEntry)
  for (const node of Object.values(workflow)) {
    if (!node || typeof node !== 'object') {
      continue
    }

    if (node.class_type !== 'KSampler' && node.class_type !== 'KSamplerAdvanced') {
      continue
    }

    const inputImageName = findLoadImageUpstream(workflow, getLinkedNodeId(node.inputs?.latent_image))
    if (inputImageName) {
      return inputImageName
    }
  }

  return null
}

async function resolveHistoryInputImageName(historyEntry) {
  const inputImageName = extractInputImageNameFromHistory(historyEntry)
  if (!inputImageName) {
    return null
  }

  try {
    return await resolveStoredInputImageName(inputImageName)
  } catch {
    return null
  }
}

export function extractErrorFromHistory(historyEntry) {
  const messages = historyEntry?.status?.messages ?? []
  const errorMessage = messages.find(([type]) => type === 'execution_error')
  if (!errorMessage) {
    return null
  }

  const [, payload] = errorMessage
  return payload?.exception_message ?? payload?.exception_type ?? 'ComfyUI execution error'
}

export function normalizeQueueEntries(entries, state) {
  if (!Array.isArray(entries)) {
    return []
  }

  return entries
    .map((entry, index) => {
      const promptId = safeTrim(entry?.[1])
      if (!promptId) {
        return null
      }

      const rawNumber = entry?.[0]
      const queueNumber =
        typeof rawNumber === 'number'
          ? rawNumber
          : typeof rawNumber === 'string' && rawNumber.trim()
            ? Number.parseFloat(rawNumber)
            : null

      return {
        promptId,
        state,
        queueNumber: Number.isFinite(queueNumber) ? queueNumber : null,
        queuePosition: state === 'queued' ? index + 1 : 0,
      }
    })
    .filter(Boolean)
}

export function getQueueSnapshot(queuePayload) {
  const running = normalizeQueueEntries(queuePayload?.queue_running, 'running')
  const pending = normalizeQueueEntries(queuePayload?.queue_pending, 'queued')
  const byPromptId = new Map()

  for (const entry of [...running, ...pending]) {
    byPromptId.set(entry.promptId, entry)
  }

  return {
    running,
    pending,
    byPromptId,
  }
}

export function buildQueueSummaryForPromptIds(queueSnapshot, promptIds) {
  const appPromptIds = new Set(promptIds)
  const appRunning = queueSnapshot.running.filter((entry) => appPromptIds.has(entry.promptId)).length
  const appPending = queueSnapshot.pending.filter((entry) => appPromptIds.has(entry.promptId)).length

  return {
    running: queueSnapshot.running.length,
    pending: queueSnapshot.pending.length,
    appRunning,
    appPending,
    externalRunning: Math.max(0, queueSnapshot.running.length - appRunning),
    externalPending: Math.max(0, queueSnapshot.pending.length - appPending),
  }
}

export function buildQueueSummary(queueSnapshot) {
  return buildQueueSummaryForPromptIds(queueSnapshot, jobs.keys())
}

export function compareJobsForResponse(leftJob, rightJob) {
  const stateRank = {
    running: 0,
    queued: 1,
    cancelling: 2,
    complete: 3,
    error: 4,
    cancelled: 5,
    idle: 6,
  }

  const leftRank = stateRank[leftJob.state] ?? 99
  const rightRank = stateRank[rightJob.state] ?? 99
  if (leftRank !== rightRank) {
    return leftRank - rightRank
  }

  if (leftJob.state === 'queued' && rightJob.state === 'queued') {
    return (leftJob.queuePosition ?? Number.MAX_SAFE_INTEGER) - (rightJob.queuePosition ?? Number.MAX_SAFE_INTEGER)
  }

  if (
    (leftJob.state === 'running' || leftJob.state === 'cancelling') &&
    (rightJob.state === 'running' || rightJob.state === 'cancelling')
  ) {
    return leftJob.createdAt - rightJob.createdAt
  }

  return rightJob.updatedAt - leftJob.updatedAt
}

export async function syncJobFromHistory(promptId) {
  const historyPayload = await comfyFetchJson(`/history/${promptId}`)
  const historyEntry = extractHistoryEntry(historyPayload, promptId)

  if (!historyEntry) {
    return null
  }

  const job = ensureJob(promptId)
  const status = historyEntry?.status?.status_str ?? null
  const outputs = extractImagesFromHistory(historyEntry, job.saveNodeMeta, job.outputNodeOrder)
  const error = extractErrorFromHistory(historyEntry)
  const inputImageName = job.inputImageName ? null : await resolveHistoryInputImageName(historyEntry)
  const inputImageUpdates = inputImageName ? { inputImageName } : {}

  if (status === 'success') {
    markJob(job, {
      state: 'complete',
      outputs: mergeJobOutputs(job.outputs, outputs),
      ...inputImageUpdates,
      error: null,
      queuePosition: null,
      queueNumber: null,
      progressValue: job.progressMax ?? 1,
      progressMax: job.progressMax ?? 1,
      currentNodeLabel: outputs.length ? 'Completed' : job.currentNodeLabel,
    })
    return job
  }

  if (status === 'error' || error) {
    markJob(job, {
      state: job.cancelRequestedAt ? 'cancelled' : 'error',
      outputs: mergeJobOutputs(job.outputs, outputs),
      ...inputImageUpdates,
      error: job.cancelRequestedAt ? null : error,
      queuePosition: null,
      queueNumber: null,
      currentNodeLabel: job.cancelRequestedAt ? 'Cancelled' : 'Failed',
    })
    return job
  }

  if (inputImageName) {
    markJob(job, inputImageUpdates)
  }

  return job
}

export function applyQueueStateToJob(job, queueEntry) {
  if (!queueEntry) {
    return
  }

  const nextState = getJobActiveState(job, queueEntry.state)
  markJob(job, {
    state: nextState,
    error: null,
    queuePosition: queueEntry.state === 'queued' ? queueEntry.queuePosition : null,
    queueNumber: queueEntry.queueNumber,
    currentNodeLabel:
      nextState === 'cancelling'
        ? 'Cancelling'
        : queueEntry.state === 'queued'
          ? 'Queued in ComfyUI'
          : job.currentNodeLabel,
  })
}

export async function syncJob(promptId, queueSnapshot = null) {
  const job = ensureJob(promptId)
  const historyJob = await syncJobFromHistory(promptId)

  if (historyJob && isJobTerminalState(historyJob.state)) {
    return historyJob
  }

  const resolvedQueueSnapshot = queueSnapshot ?? getQueueSnapshot(await comfyFetchJson('/queue'))
  const queueEntry = resolvedQueueSnapshot.byPromptId.get(promptId) ?? null

  if (queueEntry) {
    applyQueueStateToJob(job, queueEntry)
  } else if (!isJobTerminalState(job.state)) {
    if (job.cancelRequestedAt) {
      markJob(job, {
        state: 'cancelled',
        error: null,
        queuePosition: null,
        queueNumber: null,
        currentNodeLabel: 'Cancelled',
      })
      return job
    }

    const elapsedMs = Date.now() - job.createdAt
    if (elapsedMs > 8_000) {
      markJob(job, {
        state: 'error',
        queuePosition: null,
        queueNumber: null,
        currentNodeLabel: 'Failed',
        error: 'ComfyUI is not reporting this job in queue or history. The workflow may have been rejected before queueing.',
      })
      return job
    }

    markJob(job, {
      state: job.state === 'running' ? 'running' : 'queued',
    })
  }

  return job
}

export async function syncAllJobs(queueSnapshot = null) {
  const resolvedQueueSnapshot = queueSnapshot ?? getQueueSnapshot(await comfyFetchJson('/queue'))
  const knownJobs = [...jobs.keys()]

  for (const promptId of knownJobs) {
    const job = jobs.get(promptId)
    if (!job) {
      continue
    }

    if (isJobTerminalState(job.state)) {
      continue
    }

    await syncJob(promptId, resolvedQueueSnapshot)
  }

  return resolvedQueueSnapshot
}
