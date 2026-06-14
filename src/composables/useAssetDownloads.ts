import { computed, ref } from 'vue'
import type {
  AssetDownloadItem,
  DownloadCounts,
  DownloadsResponse,
  DownloadsSummaryResponse,
  QueueDownloadPayload,
  WatchDownloadPayload,
  WatchedAssetDownloadItem,
  WatchedDownloadsResponse,
} from './assetDownloadTypes'
import { emptyDownloadCounts, normalizeDownloadCounts } from './assetDownloadCounts'
import { useAssetDownloadSubscription } from './useAssetDownloadSubscription'

export type {
  AssetDownloadItem,
  AssetDownloadState,
  QueueDownloadPayload,
  WatchDownloadPayload,
  WatchedAssetDownloadItem,
  WatchedAssetDownloadState,
} from './assetDownloadTypes'

const downloads = ref<AssetDownloadItem[]>([])
const watchedDownloads = ref<WatchedAssetDownloadItem[]>([])
const panelDownloads = ref<AssetDownloadItem[]>([])
const loading = ref(false)
const error = ref('')
const panelLoading = ref(false)
const panelError = ref('')
const summaryCounts = ref<DownloadCounts>(emptyDownloadCounts())
const summaryLoading = ref(false)
const summaryError = ref('')
let pollTimer: number | undefined
let panelPollTimer: number | undefined
let summaryPollTimer: number | undefined
let subscribers = 0
let panelSubscribers = 0
let summarySubscribers = 0
let refreshRequestId = 0
let watchedRefreshRequestId = 0
let panelRefreshRequestId = 0
let summaryRefreshRequestId = 0

const activeDownloads = computed(() => {
  return downloads.value.filter((item) => ['queued', 'downloading', 'paused'].includes(item.state))
})
const completedDownloads = computed(() => downloads.value.filter((item) => item.state === 'complete'))
const panelActiveDownloads = computed(() => {
  return panelDownloads.value.filter((item) => ['queued', 'downloading', 'paused'].includes(item.state))
})
const panelRunningDownloads = computed(() => {
  return panelDownloads.value.filter((item) => item.state === 'queued' || item.state === 'downloading')
})
const panelCompletedDownloads = computed(() => panelDownloads.value.filter((item) => item.state === 'complete'))
const downloadById = computed(() => new Map(downloads.value.map((item) => [item.id, item])))
const watchedByVersionId = computed(() => {
  const map = new Map<number, WatchedAssetDownloadItem[]>()
  for (const item of watchedDownloads.value) {
    const items = map.get(item.versionId) ?? []
    items.push(item)
    map.set(item.versionId, items)
  }

  return map
})
const downloadByVersionId = computed(() => {
  const map = new Map<number, AssetDownloadItem[]>()
  for (const item of downloads.value) {
    const items = map.get(item.versionId) ?? []
    items.push(item)
    map.set(item.versionId, items)
  }

  return map
})

async function refreshWatchedDownloads() {
  const requestId = ++watchedRefreshRequestId

  try {
    const response = await fetch('/api/civitai/watched-downloads', {
      headers: {
        Accept: 'application/json',
      },
    })
    const payload = (await response.json()) as WatchedDownloadsResponse

    if (!response.ok || payload.ok === false) {
      throw new Error(payload.message ?? `Watched downloads returned ${response.status}`)
    }

    if (requestId === watchedRefreshRequestId) {
      watchedDownloads.value = Array.isArray(payload.items) ? payload.items : []
    }
  } catch {
    if (requestId === watchedRefreshRequestId) {
      watchedDownloads.value = []
    }
  }
}

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

async function refreshDownloadPanel() {
  const requestId = ++panelRefreshRequestId
  panelLoading.value = true
  panelError.value = ''

  try {
    const response = await fetch('/api/civitai/downloads/panel', {
      headers: {
        Accept: 'application/json',
      },
    })
    const payload = (await response.json()) as DownloadsResponse

    if (!response.ok || payload.ok === false) {
      throw new Error(payload.message ?? `Downloads panel returned ${response.status}`)
    }

    if (requestId === panelRefreshRequestId) {
      panelDownloads.value = Array.isArray(payload.items) ? payload.items : []
    }
  } catch (caughtError) {
    if (requestId === panelRefreshRequestId) {
      panelError.value = caughtError instanceof Error ? caughtError.message : 'Could not load downloads.'
    }
  } finally {
    if (requestId === panelRefreshRequestId) {
      panelLoading.value = false
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

function queueNextPanelPoll() {
  window.clearTimeout(panelPollTimer)
  panelPollTimer = window.setTimeout(() => {
    void refreshDownloadPanel().finally(() => {
      if (panelPollTimer !== undefined) {
        queueNextPanelPoll()
      }
    })
  }, panelRunningDownloads.value.length ? 1000 : 3500)
}

function startPanelPolling() {
  window.clearTimeout(panelPollTimer)
  panelPollTimer = undefined
  void refreshDownloadPanel().finally(() => {
    if (panelSubscribers > 0 && panelPollTimer === undefined) {
      queueNextPanelPoll()
    }
  })
}

function stopPanelPolling() {
  window.clearTimeout(panelPollTimer)
  panelPollTimer = undefined
  panelRefreshRequestId += 1
}

async function refreshDownloadSummary() {
  const requestId = ++summaryRefreshRequestId
  summaryLoading.value = true
  summaryError.value = ''

  try {
    const response = await fetch('/api/civitai/downloads/summary', {
      headers: {
        Accept: 'application/json',
      },
    })
    const payload = (await response.json()) as DownloadsSummaryResponse

    if (!response.ok || payload.ok === false) {
      throw new Error(payload.message ?? `Downloads summary returned ${response.status}`)
    }

    if (requestId === summaryRefreshRequestId) {
      summaryCounts.value = normalizeDownloadCounts(payload.counts)
    }
  } catch (caughtError) {
    if (requestId === summaryRefreshRequestId) {
      summaryError.value = caughtError instanceof Error ? caughtError.message : 'Could not load downloads summary.'
    }
  } finally {
    if (requestId === summaryRefreshRequestId) {
      summaryLoading.value = false
    }
  }
}

function startSummaryPolling() {
  window.clearInterval(summaryPollTimer)
  void refreshDownloadSummary()
  summaryPollTimer = window.setInterval(() => {
    void refreshDownloadSummary()
  }, 3500)
}

function stopSummaryPolling() {
  window.clearInterval(summaryPollTimer)
  summaryPollTimer = undefined
  summaryRefreshRequestId += 1
}

function subscribeDownloads() {
  subscribers += 1
  if (subscribers === 1) {
    startPolling()
  } else {
    void refreshDownloads()
  }
}

function unsubscribeDownloads() {
  subscribers = Math.max(0, subscribers - 1)
  if (subscribers === 0) {
    stopPolling()
  }
}

function subscribeDownloadPanel() {
  panelSubscribers += 1
  if (panelSubscribers === 1) {
    startPanelPolling()
  } else {
    void refreshDownloadPanel()
  }
}

function unsubscribeDownloadPanel() {
  panelSubscribers = Math.max(0, panelSubscribers - 1)
  if (panelSubscribers === 0) {
    stopPanelPolling()
  }
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
  void refreshDownloadSummary()
  return payload
}

function withPanelViewParam(path: string) {
  return path.includes('?') ? `${path}&view=panel` : `${path}?view=panel`
}

async function postPanelDownloadAction(path: string, init?: RequestInit) {
  const response = await fetch(withPanelViewParam(path), {
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

  await refreshDownloadPanel()
  void refreshDownloadSummary()
  return payload
}

async function queueDownload(payload: QueueDownloadPayload) {
  return postDownloadAction('/api/civitai/downloads', {
    body: JSON.stringify(payload),
  })
}

async function watchDownload(payload: WatchDownloadPayload) {
  const response = await fetch('/api/civitai/watched-downloads', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify(payload),
  })
  const responsePayload = await response.json().catch(() => null)

  if (!response.ok || responsePayload?.ok === false) {
    throw new Error(responsePayload?.message ?? `Watched download request returned ${response.status}`)
  }

  await refreshWatchedDownloads()
  void refreshDownloads()
  return responsePayload
}

async function unwatchDownload(id: string) {
  const response = await fetch(`/api/civitai/watched-downloads/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: {
      Accept: 'application/json',
    },
  })
  const responsePayload = await response.json().catch(() => null)

  if (!response.ok || responsePayload?.ok === false) {
    throw new Error(responsePayload?.message ?? `Watched download request returned ${response.status}`)
  }

  await refreshWatchedDownloads()
  return responsePayload
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

async function keepDownloadAnyway(id: string) { return postDownloadAction(`/api/civitai/downloads/${encodeURIComponent(id)}/keep-anyway`) }

async function repairDownloadPreviews(id: string) {
  return postDownloadAction(`/api/civitai/downloads/${encodeURIComponent(id)}/repair-previews`)
}

async function clearDownloads() {
  return postDownloadAction('/api/civitai/downloads/clear')
}

async function pausePanelDownload(id: string) {
  return postPanelDownloadAction(`/api/civitai/downloads/${encodeURIComponent(id)}/pause`)
}

async function resumePanelDownload(id: string) {
  return postPanelDownloadAction(`/api/civitai/downloads/${encodeURIComponent(id)}/resume`)
}

async function cancelPanelDownload(id: string) {
  return postPanelDownloadAction(`/api/civitai/downloads/${encodeURIComponent(id)}/cancel`)
}

async function clearPanelDownloads() {
  return postPanelDownloadAction('/api/civitai/downloads/clear')
}

export function useAssetDownloads(options: { autoStart?: boolean; includeWatched?: boolean } = {}) {
  const subscription = useAssetDownloadSubscription(() => {
    subscribeDownloads()
    if (options.includeWatched) {
      void refreshWatchedDownloads()
    }
  }, () => {
    unsubscribeDownloads()
  }, { autoStart: options.autoStart !== false })

  return {
    downloads,
    watchedDownloads,
    activeDownloads,
    completedDownloads,
    downloadById,
    watchedByVersionId,
    downloadByVersionId,
    loading,
    error,
    refreshDownloads,
    refreshWatchedDownloads,
    queueDownload,
    watchDownload,
    unwatchDownload,
    pauseDownload,
    resumeDownload,
    cancelDownload,
    deleteDownloadedFile,
    redownloadDownload,
    keepDownloadAnyway,
    repairDownloadPreviews,
    clearDownloads,
    startPolling: subscription.start,
    stopPolling: subscription.stop,
  }
}

export function useAssetDownloadPanel() {
  const subscription = useAssetDownloadSubscription(() => {
    subscribeDownloadPanel()
  }, () => {
    unsubscribeDownloadPanel()
  })

  return {
    downloads: panelDownloads,
    activeDownloads: panelActiveDownloads,
    completedDownloads: panelCompletedDownloads,
    loading: panelLoading,
    error: panelError,
    refreshDownloads: refreshDownloadPanel,
    pauseDownload: pausePanelDownload,
    resumeDownload: resumePanelDownload,
    cancelDownload: cancelPanelDownload,
    clearDownloads: clearPanelDownloads,
    startPolling: subscription.start,
    stopPolling: subscription.stop,
  }
}

export function useAssetDownloadSummary() {
  useAssetDownloadSubscription(() => {
    summarySubscribers += 1
    if (summarySubscribers === 1) {
      startSummaryPolling()
    } else {
      void refreshDownloadSummary()
    }
  }, () => {
    summarySubscribers = Math.max(0, summarySubscribers - 1)
    if (summarySubscribers === 0) {
      stopSummaryPolling()
    }
  })

  return {
    counts: summaryCounts,
    loading: summaryLoading,
    error: summaryError,
    refreshDownloadSummary,
  }
}
