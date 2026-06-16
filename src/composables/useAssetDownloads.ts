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
import { subscribeAssetDownloadEvents, type AssetDownloadSnapshot } from './assetDownloadEvents'
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
let subscribers = 0
let panelSubscribers = 0
let summarySubscribers = 0
let eventSubscribers = 0
let unsubscribeDownloadEvents: (() => void) | null = null
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

function applyDownloadsResponse(payload: DownloadsResponse | undefined) {
  if (!payload || payload.ok === false) {
    return
  }

  downloads.value = Array.isArray(payload.items) ? payload.items : []
  loading.value = false
  error.value = ''
}

function applyPanelResponse(payload: DownloadsResponse | undefined) {
  if (!payload || payload.ok === false) {
    return
  }

  panelDownloads.value = Array.isArray(payload.items) ? payload.items : []
  panelLoading.value = false
  panelError.value = ''
}

function applySummaryResponse(payload: DownloadsSummaryResponse | undefined) {
  if (!payload || payload.ok === false) {
    return
  }

  summaryCounts.value = normalizeDownloadCounts(payload.counts)
  summaryLoading.value = false
  summaryError.value = ''
}

function applyDownloadSnapshot(snapshot: AssetDownloadSnapshot) {
  applyDownloadsResponse(snapshot.downloads)
  applyPanelResponse(snapshot.panel)
  applySummaryResponse(snapshot.summary)
}

function subscribeDownloadEvents() {
  eventSubscribers += 1
  if (eventSubscribers === 1) {
    unsubscribeDownloadEvents = subscribeAssetDownloadEvents(applyDownloadSnapshot)
  }
}

function unsubscribeDownloadEventSubscription() {
  eventSubscribers = Math.max(0, eventSubscribers - 1)
  if (eventSubscribers === 0) {
    unsubscribeDownloadEvents?.()
    unsubscribeDownloadEvents = null
  }
}

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

function subscribeDownloads() {
  subscribers += 1
  loading.value = true
  subscribeDownloadEvents()
}

function unsubscribeDownloads() {
  subscribers = Math.max(0, subscribers - 1)
  refreshRequestId += 1
  unsubscribeDownloadEventSubscription()
}

function subscribeDownloadPanel() {
  panelSubscribers += 1
  panelLoading.value = true
  subscribeDownloadEvents()
}

function unsubscribeDownloadPanel() {
  panelSubscribers = Math.max(0, panelSubscribers - 1)
  panelRefreshRequestId += 1
  unsubscribeDownloadEventSubscription()
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
    summaryLoading.value = true
    subscribeDownloadEvents()
  }, () => {
    summarySubscribers = Math.max(0, summarySubscribers - 1)
    summaryRefreshRequestId += 1
    unsubscribeDownloadEventSubscription()
  })

  return {
    counts: summaryCounts,
    loading: summaryLoading,
    error: summaryError,
    refreshDownloadSummary,
  }
}
