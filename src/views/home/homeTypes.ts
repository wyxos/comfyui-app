export type JobState = 'idle' | 'queued' | 'running' | 'cancelling' | 'cancelled' | 'complete' | 'error'
export type CheckpointFamily = 'sdxl' | 'anima'

export type CheckpointOption = {
  name: string
  family: CheckpointFamily
  displayName?: string
  downloaded?: boolean
  previewUrl?: string | null
  previewMediaType?: 'image' | 'video' | string | null
  modelNsfw?: boolean | null
  compatibility?: ModelCompatibilityMetadata | null
}

export type CheckpointSelection = {
  name: string
  enabled: boolean
  loras: LoraSelection[]
  loraPicker: string
  controlNets: ControlNetSelection[]
}

export type CheckpointResponse = {
  ok: boolean
  checkpoints?: CheckpointOption[]
  defaultCheckpoint?: string | null
  message?: string
}

export type LoraOption = {
  name: string
  displayName?: string
  triggerWords?: string[]
  downloaded?: boolean
  previewUrl?: string | null
  previewMediaType?: 'image' | 'video' | string | null
  modelNsfw?: boolean | null
  compatibility?: ModelCompatibilityMetadata | null
}

export type LoraSelection = {
  name: string
  enabled: boolean
  strength: string
  enabledTriggerWords?: string[]
  triggerWordWeights?: Record<string, string>
  applyToAllCompatible?: boolean
  appliedByAllCompatible?: boolean
}

export type ModelCompatibilityMetadata = {
  modelId?: number | null
  versionId?: number | null
  modelName?: string
  versionName?: string
  modelType?: string | null
  modelNsfw?: boolean | null
  modelNsfwOverride?: boolean | null
  baseModel?: string
  baseModelKey?: string
  trainedWords?: string[]
  hashes?: Record<string, string>
  checkpointNames?: string[]
  checkpointHashes?: Record<string, string>
  compatibleBaseModels?: string[]
  compatibleBaseModelKeys?: string[]
  controlType?: string
  loaderType?: string
  source?: string
  status?: string
}

export type LoraCompatibilityStatus = 'compatible' | 'warning' | 'incompatible' | 'unverified'
export type ModelCompatibilityStatus = 'compatible' | 'incompatible' | 'unverified'

export type CheckpointEntry = CheckpointSelection & {
  family: CheckpointFamily
  displayName: string
  downloaded: boolean
  previewUrl: string | null
  previewMediaType: string | null
  compatibility: ModelCompatibilityMetadata | null
}

export type HomeCheckpointEntry = CheckpointEntry
export type HomeLoraSelection = LoraSelection

export type LoraResponse = {
  ok: boolean
  loras?: LoraOption[]
  defaultStrength?: number
  message?: string
}

export type ControlNetOption = {
  name: string
  displayName?: string
  downloaded?: boolean
  compatibility?: ModelCompatibilityMetadata | null
  controlType?: string
  loaderType?: string
}

export type ControlNetPreprocessorOption = {
  id: string
  label: string
  defaultResolution?: number
}

export type ControlNetLineartPolarity = 'white-lines' | 'black-lines'

export type ControlNetSelection = {
  id: string
  enabled: boolean
  model: string
  preprocessor: string
  lineartPolarity: ControlNetLineartPolarity
  previewResolution: string
  strength: string
  startPercent: string
  endPercent: string
  inputImageName: string
  inputImageDisplayName: string
  inputImagePreviewUrl: string
  inputImageWidth: number | null
  inputImageHeight: number | null
  isDragging: boolean
  isUploading: boolean
  uploadError: string
  previewImageUrl: string
  previewImageName: string
  previewImageSubfolder: string
  previewImageType: string
  isGeneratingPreview: boolean
  previewError: string
  isCopyingPreview: boolean
  previewCopyNotice: string
  previewCopyError: string
}

export type ControlNetResponse = {
  ok: boolean
  controlNets?: ControlNetOption[]
  preprocessors?: ControlNetPreprocessorOption[]
  message?: string
}

export type ControlNetPreviewResponse = {
  ok: boolean
  promptId?: string
  preprocessor?: string
  lineartPolarity?: ControlNetLineartPolarity
  resolution?: number
  preview?: {
    filename: string
    subfolder: string
    type: string
    url: string
  }
  message?: string
}

export type GenerateResponse = {
  ok: boolean
  promptId?: string
  promptIds?: string[]
  batchId?: string | null
  state?: JobState
  seed?: number | null
  steps?: number | null
  promptVariants?: PromptVariant[]
  inputImageName?: string | null
  inputImageDisplayName?: string | null
  partialFailure?: boolean
  message?: string
}

export type GenerationOptionDefaults = {
  sdxl?: {
    samplerName?: string
    scheduler?: string
  }
  anima?: {
    samplerName?: string
    scheduler?: string
    clipName?: string
    vaeName?: string
  }
}

export type GenerationOptionsResponse = {
  ok: boolean
  samplers?: string[]
  schedulers?: string[]
  clipNames?: string[]
  vaeNames?: string[]
  defaults?: GenerationOptionDefaults
  message?: string
}

export type UploadInputImageResponse = {
  ok: boolean
  inputImageName?: string
  message?: string
}

export type JobOutput = {
  filename: string
  subfolder: string
  type: string
  url: string
  fullPath: string | null
  parentDirectory: string | null
  variantId: string | null
  variantLabel: string | null
  promptText: string | null
}

export type GeneratedOutputContextMenu = {
  x: number
  y: number
  output: JobOutput
  checkpointName: string | null
}

export type InputImageSnapshot = {
  name: string
  url: string
}

export type PromptVariant = {
  id: string
  label: string
  promptText: string
}

export type PreviewDisplayItem = {
  key: string
  promptId: string | null
  checkpointName: string | null
  job: JobResponse | null
  variantId: string | null
  variantLabel: string | null
  promptText: string | null
  output: JobOutput | null
  isPlaceholder: boolean
}

export type PreviewStatusItem = {
  key: string
  label: string
  statusLabel: string
  progressPercent: number | null
  indeterminate: boolean
  isComplete: boolean
  isDestructive: boolean
}

export type JobListEntry = {
  key: string
  batchId: string | null
  promptIds: string[]
  jobs: JobResponse[]
  leadJob: JobResponse
}

export type JobResponse = {
  ok: boolean
  promptId: string
  batchId?: string | null
  batchIndex?: number | null
  state: JobState
  checkpoint: string
  seed: number | null
  negativePrompt: string
  promptVariants: PromptVariant[]
  currentNodeLabel: string | null
  progressValue: number | null
  progressMax: number | null
  progressPercent: number | null
  outputs: JobOutput[]
  family?: CheckpointFamily | string | null
  width?: number | null
  height?: number | null
  steps?: number | null
  cfg?: number | null
  denoise?: number | null
  samplerName?: string | null
  scheduler?: string | null
  clipName?: string | null
  vaeName?: string | null
  loras?: Array<{ name: string; strength: number }>
  inputImageName?: string | null
  inputImageDisplayName?: string | null
  error: string | null
  elapsedMs: number
  createdAt: number
  updatedAt: number
  queuePosition: number | null
  queueNumber: number | null
  cancelRequested: boolean
  message?: string
}

export type QueueSummary = {
  running: number
  pending: number
  appRunning: number
  appPending: number
  externalRunning: number
  externalPending: number
  unavailable: boolean
  error: string | null
}

export type JobCounts = {
  running: number
  queued: number
  history: number
}

export type JobHistoryPagination = {
  page: number
  pageSize: number
  totalItems: number
  totalPages: number
}

export type JobListResponse = {
  ok: boolean
  jobs?: JobResponse[]
  counts?: JobCounts
  history?: JobHistoryPagination
  queue?: QueueSummary
  message?: string
}

export type CancelQueuedJobsResponse = {
  ok: boolean
  cancelled?: number
  promptIds?: string[]
  jobs?: JobResponse[]
  message?: string
}

export type DeleteJobResponse = {
  ok: boolean
  promptId?: string
  comfyHistoryDeleted?: boolean
  deletedOutputs?: {
    requested: number
    deleted: string[]
    missing: string[]
    failed: Array<{ path: string; message: string }>
  } | null
  message?: string
}

export type JobListTab = 'running' | 'queued' | 'history'
export type FormTab = 'assets' | 'prompt' | 'config' | 'image'
export type PromptMode = 'tags' | 'text'
export type PromptField = 'prompt' | 'negativePrompt'
export type PromptSectionId = 'subject' | 'details' | 'environment' | 'style' | 'lighting' | 'quality' | 'others'
export type PromptSectionDefinition = {
  id: PromptSectionId
  label: string
  hint: string
  placeholder: string
}
export type PromptTag = {
  text: string
  strength: string
  enabled?: boolean
}
export type PromptSectionsState = Record<PromptSectionId, PromptTag[]>
export type PromptTagLocation =
  | {
      field: 'section'
      sectionId: PromptSectionId
      index: number
    }
  | {
      field: 'negative'
      index: number
    }
export type PromptTagDropTarget =
  | {
      field: 'section'
      sectionId: PromptSectionId
      index?: number
    }
  | {
      field: 'negative'
      index?: number
    }
export type PersistedControlNetSelection = Pick<
  ControlNetSelection,
  | 'id'
  | 'enabled'
  | 'model'
  | 'preprocessor'
  | 'lineartPolarity'
  | 'previewResolution'
  | 'strength'
  | 'startPercent'
  | 'endPercent'
  | 'inputImageName'
  | 'inputImageDisplayName'
  | 'inputImageWidth'
  | 'inputImageHeight'
>
export type PersistedCheckpointSelection = Omit<CheckpointSelection, 'controlNets'> & {
  controlNets?: PersistedControlNetSelection[]
}
export type PersistedFormState = {
  promptMode?: PromptMode
  prompt: string
  negativePrompt: string
  promptSections?: Partial<Record<PromptSectionId, Array<string | Partial<PromptTag>>>>
  negativePromptTags?: Array<string | Partial<PromptTag>>
  selectedCheckpoint?: string
  selectedCheckpoints?: PersistedCheckpointSelection[]
  width: string
  height: string
  seed: string
  steps: string
  cfg: string
  samplerName?: string
  scheduler?: string
  clipName?: string
  vaeName?: string
  imageDenoise: string
  maintainAspectRatio?: boolean
  useInputImage: boolean
  flattenInputImageBackground?: boolean
  inputImageBackgroundColor?: string
  inputImageName: string
  inputImageDisplayName: string
  inputImageWidth: number | null
  inputImageHeight: number | null
}
