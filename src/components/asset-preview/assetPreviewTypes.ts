export type CivitaiStats = {
  downloadCount?: number
  favoriteCount?: number
  thumbsUpCount?: number
  thumbsDownCount?: number
  commentCount?: number
  ratingCount?: number
  rating?: number
}

export type CivitaiImage = {
  id?: string | number
  url?: string | null
  type?: string | null
  nsfw?: string | boolean | null
  nsfwLevel?: string | number | null
  width?: number
  height?: number
  hash?: string | null
  meta?: unknown
  postId?: number
  username?: string
  modelVersionIds?: number[]
  remoteUrl?: string | null
  mediaType?: string | null
  archiveSource?: string | null
  mediaStatus?: string | null
  atlasStatus?: AtlasMediaStatus | null
}

export type AtlasMediaStatus = {
  request_id?: string
  exists?: boolean
  file_id?: number | null
  source_url?: string | null
  referrer_url?: string | null
  downloaded?: boolean
  downloaded_at?: string | null
  blacklisted?: boolean
  blacklisted_at?: string | null
  auto_blacklisted?: boolean
  reaction?: string | null
  reacted_at?: string | null
  filtered?: boolean
  ignored?: boolean
  filter_reasons?: Array<{
    type?: string
    name?: string | null
    reason?: string | null
  }>
  download?: {
    requested?: boolean
    transfer_id?: number | null
    status?: string | null
    progress_percent?: number | null
    downloaded_at?: string | null
  } | null
}

export type CivitaiModelFile = {
  id?: number | string
  name?: string | null
  type?: string | null
  downloadUrl?: string | null
  sizeKB?: number
  sizeKb?: number
  hashes?: Record<string, unknown>
  pickleScanResult?: string | null
  virusScanResult?: string | null
  scannedAt?: string | null
  primary?: boolean
  metadata?: {
    format?: string
    size?: string
    fp?: string
  }
}

export type CivitaiModelVersion = {
  id: number
  name?: string | null
  nsfwLevel?: string | number | null
  description?: string | null
  createdAt?: string | null
  publishedAt?: string | null
  status?: string | null
  availability?: string | null
  covered?: boolean
  baseModel?: string | null
  trainedWords?: string[]
  files?: CivitaiModelFile[]
  images?: CivitaiImage[]
  stats?: CivitaiStats
}

export type CivitaiModel = {
  id: number
  name: string
  type: string
  nsfw?: boolean
  nsfwLevel?: string | number | null
  creator?: {
    username?: string | null
  } | null
  stats?: CivitaiStats
  modelVersions?: CivitaiModelVersion[]
}

export type CivitaiModelsResponse = {
  items?: CivitaiModel[]
}

export type CivitaiImagesResponse = {
  items?: CivitaiImage[]
  metadata?: {
    nextCursor?: string | null
  }
}

export type AssetPreviewDownload = {
  id?: string
  state?: string
  progressPercent?: number | null
  fileName?: string | null
}

export type ImageSafetyOverride = {
  imageNsfw?: boolean | null
  imageNsfwOverride?: boolean | null
}

export type NsfwMediaBlurLevel = 4 | 8 | 16 | 32 | null

export type PreviewSlide = {
  key: string
  url: string
  previewUrl?: string
  image: CivitaiImage | null
  isVideo: boolean
  source: 'civitai' | 'archive' | 'local'
}

export type NormalizedMetaRow = {
  label: string
  value: string
  mono?: boolean
}

export type AssetPreviewModalProps = {
  open: boolean
  model?: CivitaiModel | null
  title?: string
  previewUrl?: string | null
  initialImageIndex?: number
  isVideo?: boolean
  includeNsfw?: boolean
  blurNsfwModels?: boolean
  blurNsfwMediaLevel?: NsfwMediaBlurLevel
  subtitle?: string | null
  kindLabel?: string
  modelId?: number | null
  versionId?: number | null
  fileId?: number | null
  modelType?: string | null
  baseModel?: string | null
  trainedWords?: string[]
  fileName?: string | null
  compatibility?: {
    compatibleBaseModels?: string[]
    modelNsfw?: boolean | null
    modelNsfwOverride?: boolean | null
    imageSafetyOverrides?: Record<string, ImageSafetyOverride>
    controlType?: string
    loaderType?: string
    status?: string
  } | null
  editableCompatibility?: boolean
  editableSafety?: boolean
  savingCompatibility?: boolean
  savingSafety?: boolean
  savingImageSafety?: boolean
  compatibilityError?: string
  safetyError?: string
  imageSafetyError?: string
  showDownloadActions?: boolean
  queuingDownloadKey?: string
  downloadForVersion?: (version: CivitaiModelVersion | null | undefined) => AssetPreviewDownload | null
  downloadStatusLabel?: (download: AssetPreviewDownload | null) => string
  canQueueVersion?: (version: CivitaiModelVersion) => boolean
  versionDownloadButtonLabel?: (version: CivitaiModelVersion) => string
  queueAssetDownload?: (model: CivitaiModel, version: CivitaiModelVersion) => void | Promise<unknown>
  deleteAssetDownload?: (download: AssetPreviewDownload, version: CivitaiModelVersion) => void | Promise<void>
  repairDownloadPreviews?: (download: AssetPreviewDownload) => void | Promise<void>
  modelDownloadKey?: (model: CivitaiModel, version: CivitaiModelVersion) => string
  applyGenerationMetadata?: (metadata: Record<string, unknown>) => void | Promise<void>
}
