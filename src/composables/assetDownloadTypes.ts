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
  totalBytes?: number | null
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

export type DownloadsResponse = {
  ok: boolean
  items?: AssetDownloadItem[]
  message?: string
}

export type DownloadCounts = {
  queued: number
  downloading: number
  paused: number
  complete: number
  error: number
  cancelled: number
  deleted: number
  active: number
  attention: number
  visibleComplete: number
}

export type DownloadsSummaryResponse = {
  ok: boolean
  counts?: Partial<DownloadCounts>
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
