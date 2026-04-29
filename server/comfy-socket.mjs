import { comfyClientId, comfyUrl, jobs } from './config.mjs'
import { tryParseJson } from './shared.mjs'
import { getJobActiveState, markJob, mergeJobOutputs, normalizeImage } from './job-state.mjs'

let comfySocket = null
export let comfySocketConnected = false
let reconnectTimer = null

export function resetComfySocketRuntimeState() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
  }
  reconnectTimer = null
  comfySocket = null
  comfySocketConnected = false
}

export function websocketReady() {
  return typeof WebSocket === 'function'
}

export function scheduleReconnect() {
  if (reconnectTimer) {
    return
  }

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    connectComfySocket()
  }, 2000)
}

export function connectComfySocket() {
  if (!websocketReady()) {
    return
  }

  if (
    comfySocket &&
    (comfySocket.readyState === WebSocket.OPEN || comfySocket.readyState === WebSocket.CONNECTING)
  ) {
    return
  }

  const socketUrl = new URL('/ws', comfyUrl)
  socketUrl.protocol = socketUrl.protocol === 'https:' ? 'wss:' : 'ws:'
  socketUrl.searchParams.set('clientId', comfyClientId)

  const socket = new WebSocket(socketUrl)
  comfySocket = socket

  socket.addEventListener('open', () => {
    comfySocketConnected = true
  })

  socket.addEventListener('message', (event) => {
    handleComfySocketMessage(event.data)
  })

  socket.addEventListener('error', () => {
    try {
      socket.close()
    } catch {}
  })

  socket.addEventListener('close', () => {
    if (comfySocket === socket) {
      comfySocket = null
    }
    comfySocketConnected = false
    scheduleReconnect()
  })
}

export function handleComfySocketMessage(rawMessage) {
  const message = tryParseJson(String(rawMessage))
  if (!message?.type) {
    return
  }

  const data = message.data ?? {}
  const promptId = data.prompt_id
  if (!promptId || !jobs.has(promptId)) {
    return
  }

  const job = jobs.get(promptId)

  if (message.type === 'execution_start') {
    markJob(job, {
      state: getJobActiveState(job, 'running'),
      queuePosition: null,
      currentNodeLabel: 'Starting',
      error: null,
    })
    return
  }

  if (message.type === 'executing') {
    const nodeId = data.node ? String(data.node) : null
    markJob(job, {
      state: getJobActiveState(job, 'running'),
      queuePosition: null,
      currentNode: nodeId,
      currentNodeLabel: nodeId ? job.nodeLabels?.[nodeId] ?? `Node ${nodeId}` : job.currentNodeLabel,
    })
    return
  }

  if (message.type === 'progress') {
    const nodeId = data.node ? String(data.node) : null
    markJob(job, {
      state: getJobActiveState(job, 'running'),
      queuePosition: null,
      currentNode: nodeId,
      currentNodeLabel: nodeId ? job.nodeLabels?.[nodeId] ?? `Node ${nodeId}` : job.currentNodeLabel,
      progressValue: typeof data.value === 'number' ? data.value : job.progressValue,
      progressMax: typeof data.max === 'number' ? data.max : job.progressMax,
    })
    return
  }

  if (message.type === 'progress_state') {
    const nodes = Object.values(data.nodes ?? {})
    const runningNode = nodes.find((node) => node?.state === 'running')
    if (!runningNode) {
      return
    }

    const nodeId = String(runningNode.real_node_id ?? runningNode.node_id ?? '')
    markJob(job, {
      state: getJobActiveState(job, 'running'),
      queuePosition: null,
      currentNode: nodeId || job.currentNode,
      currentNodeLabel: nodeId ? job.nodeLabels?.[nodeId] ?? `Node ${nodeId}` : job.currentNodeLabel,
      progressValue:
        typeof runningNode.value === 'number' ? runningNode.value : job.progressValue,
      progressMax: typeof runningNode.max === 'number' ? runningNode.max : job.progressMax,
    })
    return
  }

  if (message.type === 'executed' && Array.isArray(data.output?.images)) {
    const executedNodeId = data.node ? String(data.node) : null
    markJob(job, {
      outputs: mergeJobOutputs(
        job.outputs,
        data.output.images.map((image) =>
          normalizeImage({
            ...image,
            ...(executedNodeId ? job.saveNodeMeta?.[executedNodeId] : null),
          }),
        ),
      ),
    })
    return
  }

  if (message.type === 'execution_error') {
    markJob(job, {
      state: job.cancelRequestedAt ? 'cancelled' : 'error',
      queuePosition: null,
      queueNumber: null,
      currentNode: data.node_id ? String(data.node_id) : job.currentNode,
      currentNodeLabel: job.cancelRequestedAt ? 'Cancelled' : 'Failed',
      error: job.cancelRequestedAt ? null : data.exception_message ?? data.exception_type ?? 'ComfyUI execution error',
    })
    return
  }

  if (message.type === 'execution_success') {
    markJob(job, {
      state: 'complete',
      queuePosition: null,
      queueNumber: null,
      currentNodeLabel: 'Completed',
      progressValue: job.progressMax ?? 1,
      progressMax: job.progressMax ?? 1,
      error: null,
    })
  }
}
