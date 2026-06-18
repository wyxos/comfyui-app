import { jobs } from './config.mjs'
import { buildOutputFileMeta, sanitizeSubfolder } from './model-paths.mjs'
import { comfySocketConnected } from './comfy-socket.mjs'
import { ensureJobsLoaded, persistJob } from './job-store.mjs'

export function normalizeImage(image) {
  const subfolder = sanitizeSubfolder(image.subfolder ?? '')
  return {
    filename: image.filename ?? '',
    subfolder: subfolder ?? '',
    type: image.type ?? 'output',
    variantId: image.variantId ?? null,
    variantLabel: image.variantLabel ?? null,
    promptText: image.promptText ?? null,
  }
}

export function mergeJobOutputs(existingOutputs, incomingOutputs) {
  const merged = new Map()

  for (const image of [...existingOutputs, ...incomingOutputs]) {
    const key = [
      image.variantId ?? '',
      image.type ?? 'output',
      image.subfolder ?? '',
      image.filename ?? '',
    ].join('|')
    merged.set(key, image)
  }

  return Array.from(merged.values())
}

export function buildImageUrl(image) {
  const params = new URLSearchParams({
    filename: image.filename,
    subfolder: image.subfolder ?? '',
    type: image.type ?? 'output',
  })

  return `/api/view?${params.toString()}`
}

export function ensureJob(promptId, seedData = {}) {
  ensureJobsLoaded()
  const existing = jobs.get(promptId)
  if (existing) {
    return existing
  }

  const job = {
    promptId,
    batchId: null,
    batchIndex: null,
    state: 'queued',
    promptText: '',
    negativePrompt: '',
    checkpoint: '',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    finishedAt: null,
    currentNode: null,
    currentNodeLabel: null,
    progressValue: null,
    progressMax: null,
    outputs: [],
    error: null,
    nodeLabels: {},
    saveNodeMeta: {},
    outputNodeOrder: [],
    promptVariants: [],
    queuePosition: null,
    queueNumber: null,
    cancelRequestedAt: null,
    ...seedData,
  }

  jobs.set(promptId, job)
  persistJob(job)
  return job
}

export function markJob(job, updates) {
  const nextState = updates?.state ?? job.state
  const nextUpdatedAt = Date.now()
  const normalizedUpdates = { ...updates }

  if (isJobTerminalState(nextState)) {
    normalizedUpdates.finishedAt = job.finishedAt ?? nextUpdatedAt

    if (
      nextState !== 'complete' &&
      !Object.prototype.hasOwnProperty.call(normalizedUpdates, 'progressValue')
    ) {
      normalizedUpdates.progressValue = null
    }

    if (
      nextState !== 'complete' &&
      !Object.prototype.hasOwnProperty.call(normalizedUpdates, 'progressMax')
    ) {
      normalizedUpdates.progressMax = null
    }
  } else {
    normalizedUpdates.finishedAt = null
  }

  Object.assign(job, normalizedUpdates, { updatedAt: nextUpdatedAt })
  persistJob(job)
}

export function isJobTerminalState(state) {
  return state === 'complete' || state === 'error' || state === 'cancelled'
}

export function getJobActiveState(job, fallbackState) {
  return job.cancelRequestedAt ? 'cancelling' : fallbackState
}

export async function serializeJob(job) {
  const elapsedReference = isJobTerminalState(job.state)
    ? job.finishedAt ?? job.updatedAt ?? Date.now()
    : Date.now()
  const elapsedMs = elapsedReference - job.createdAt
  const progressPercent =
    typeof job.progressValue === 'number' &&
    typeof job.progressMax === 'number' &&
    job.progressMax > 0
      ? Math.max(0, Math.min(100, Math.round((job.progressValue / job.progressMax) * 100)))
      : null

  const outputs = await Promise.all(
    job.outputs.map(async (image) => {
      let fullPath = null
      let parentDirectory = null

      try {
        const fileMeta = await buildOutputFileMeta(image)
        fullPath = fileMeta.fullPath
        parentDirectory = fileMeta.parentDirectory
      } catch {}

      return {
        ...image,
        url: buildImageUrl(image),
        fullPath,
        parentDirectory,
      }
    }),
  )

  return {
    ok: true,
    promptId: job.promptId,
    batchId: typeof job.batchId === 'string' ? job.batchId : null,
    batchIndex: Number.isInteger(job.batchIndex) ? job.batchIndex : null,
    state: job.state,
    promptText: job.promptText,
    negativePrompt: job.negativePrompt,
    promptVariants: Array.isArray(job.promptVariants) ? job.promptVariants : [],
    loras: Array.isArray(job.loras) ? job.loras : [],
    controlNets: Array.isArray(job.controlNets) ? job.controlNets : [],
    checkpoint: job.checkpoint,
    family: typeof job.family === 'string' ? job.family : null,
    width: typeof job.width === 'number' ? job.width : null,
    height: typeof job.height === 'number' ? job.height : null,
    steps: typeof job.steps === 'number' ? job.steps : null,
    cfg: typeof job.cfg === 'number' ? job.cfg : null,
    denoise: typeof job.denoise === 'number' ? job.denoise : null,
    samplerName: typeof job.samplerName === 'string' ? job.samplerName : null,
    scheduler: typeof job.scheduler === 'string' ? job.scheduler : null,
    clipName: typeof job.clipName === 'string' ? job.clipName : null,
    vaeName: typeof job.vaeName === 'string' ? job.vaeName : null,
    clipSkip: typeof job.clipSkip === 'number' ? job.clipSkip : null,
    hires: job.hires && typeof job.hires === 'object' ? job.hires : null,
    seed: typeof job.seed === 'number' ? job.seed : null,
    inputImageName: typeof job.inputImageName === 'string' ? job.inputImageName : null,
    inputImageDisplayName:
      typeof job.inputImageDisplayName === 'string' ? job.inputImageDisplayName : null,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    queuePosition: typeof job.queuePosition === 'number' ? job.queuePosition : null,
    queueNumber: typeof job.queueNumber === 'number' ? job.queueNumber : null,
    cancelRequested: Boolean(job.cancelRequestedAt),
    elapsedMs,
    currentNode: job.currentNode,
    currentNodeLabel: job.currentNodeLabel,
    progressValue: job.progressValue,
    progressMax: job.progressMax,
    progressPercent,
    outputs,
    error: job.error,
    websocketConnected: comfySocketConnected,
  }
}
