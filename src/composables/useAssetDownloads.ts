import { computed, onBeforeUnmount, ref } from 'vue'

export type AssetDownloadState = 'queued' | 'downloading' | 'paused' | 'complete' | 'error' | 'cancelled' | 'deleted'

export type AssetDownloadItem = {
  id: string
  state: AssetDownloadState
  modelId: number
  modelName: string
  modelType: string
  modelNsfw?: boolean | null
  modelMetadata?: {
    id?: number | null
    name?: string | null
    type?: string | null
    nsfw?: boolean | null
    creator?: { username?: string | null } | null
    stats?: Record<string, unknown> | null
    tags?: string[]
  } | null
  versionId: number
  versionName: string
  baseModel?: string | null
  fileId?: string | number | null
  fileName: string
  fileSizeKb?: number | null
  targetPath?: string
  bytesDownloaded?: number
  totalBytes?: number
  progressPercent?: number | null
  previewUrl?: string | null
  previewPaths?: Array<{ url?: string | null; mediaType?: 'image' | 'video' | string | null }>
  dismissedAt?: number | null
  deletedAt?: number | null
  createdAt?: number | null
  startedAt?: number | null
  finishedAt?: number | null
  error?: string | null
  updatedAt: number
}

type DownloadsResponse = {
  ok: boolean
  items?: AssetDownloadItem[]
  message?: string
}

export type QueueDownloadPayload = {
  modelId: number
  modelName: string
  modelType: string
  modelNsfw?: boolean | null
  modelMetadata?: Record<string, unknown> | null
  versionId: number
  versionName: string
  baseModel?: string | null
  file: Record<string, unknown>
  trainedWords?: string[]
  previewImage?: Record<string, unknown> | null
  previewImages?: Array<Record<string, unknown>>
  force?: boolean
}

const downloads = ref<AssetDownloadItem[]>([])
const loading = ref(false)
const error = ref('')
let pollTimer: number | undefined
let subscribers = 0
let refreshRequestId = 0

const activeDownloads = computed(() => {
  return downloads.value.filter((item) => ['queued', 'downloading', 'paused'].includes(item.state))
})
const completedDownloads = computed(() => downloads.value.filter((item) => item.state === 'complete'))
const downloadById = computed(() => new Map(downloads.value.map((item) => [item.id, item])))
const downloadByVersionId = computed(() => {
  const map = new Map<number, AssetDownloadItem[]>()
  for (const item of downloads.value) {
    const items = map.get(item.versionId) ?? []
    items.push(item)
    map.set(item.versionId, items)
  }

  return map
})

async function refreshDownloads() {
  const requestId = ++refreshRequestId
  loading.value = true
  error.value = ''

  try {
    const response = await fetch('/api/civitai/downloads', {
      headers: {
        Accept: 'application/json',
      },
    })
    const payload = (await response.json()) as DownloadsResponse

    if (!response.ok || payload.ok === false) {
      throw new Error(payload.message ?? `Downloads returned ${response.status}`)
    }

    if (requestId === refreshRequestId) {
      downloads.value = Array.isArray(payload.items) ? payload.items : []
    }
  } catch (caughtError) {
    if (requestId === refreshRequestId) {
      error.value = caughtError instanceof Error ? caughtError.message : 'Could not load downloads.'
    }
  } finally {
    if (requestId === refreshRequestId) {
      loading.value = false
    }
  }
}

function startPolling() {
  window.clearInterval(pollTimer)
  void refreshDownloads()
  pollTimer = window.setInterval(() => {
    void refreshDownloads()
  }, activeDownloads.value.length ? 1000 : 3500)
}

function stopPolling() {
  window.clearInterval(pollTimer)
  pollTimer = undefined
  refreshRequestId += 1
}

async function postDownloadAction(path: string, init?: RequestInit) {
  const response = await fetch(path, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json; charset=utf-8',
      ...(init?.headers ?? {}),
    },
    ...init,
  })
  const payload = await response.json().catch(() => null)

  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.message ?? `Download request returned ${response.status}`)
  }

  await refreshDownloads()
  return payload
}

async function queueDownload(payload: QueueDownloadPayload) {
  return postDownloadAction('/api/civitai/downloads', {
    body: JSON.stringify(payload),
  })
}

async function pauseDownload(id: string) {
  return postDownloadAction(`/api/civitai/downloads/${encodeURIComponent(id)}/pause`)
}

async function resumeDownload(id: string) {
  return postDownloadAction(`/api/civitai/downloads/${encodeURIComponent(id)}/resume`)
}

async function cancelDownload(id: string) {
  return postDownloadAction(`/api/civitai/downloads/${encodeURIComponent(id)}/cancel`)
}

async function deleteDownloadedFile(id: string) {
  return postDownloadAction(`/api/civitai/downloads/${encodeURIComponent(id)}/delete-file`)
}

async function redownloadDownload(id: string) {
  return postDownloadAction(`/api/civitai/downloads/${encodeURIComponent(id)}/redownload`)
}

async function clearDownloads() {
  return postDownloadAction('/api/civitai/downloads/clear')
}

export function useAssetDownloads() {
  subscribers += 1
  if (subscribers === 1) {
    startPolling()
  }

  onBeforeUnmount(() => {
    subscribers = Math.max(0, subscribers - 1)
    if (subscribers === 0) {
      stopPolling()
    }
  })

  return {
    downloads,
    activeDownloads,
    completedDownloads,
    downloadById,
    downloadByVersionId,
    loading,
    error,
    refreshDownloads,
    queueDownload,
    pauseDownload,
    resumeDownload,
    cancelDownload,
    deleteDownloadedFile,
    redownloadDownload,
    clearDownloads,
  }
}
