import type { DownloadCounts } from './assetDownloadTypes'

export function emptyDownloadCounts(): DownloadCounts {
  return {
    queued: 0,
    downloading: 0,
    paused: 0,
    complete: 0,
    error: 0,
    cancelled: 0,
    deleted: 0,
    active: 0,
    attention: 0,
    visibleComplete: 0,
  }
}

export function normalizeDownloadCounts(counts: Partial<DownloadCounts> | null | undefined): DownloadCounts {
  return {
    ...emptyDownloadCounts(),
    ...(counts ?? {}),
  }
}
