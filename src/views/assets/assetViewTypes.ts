export const PAGE_SIZE = 24
export const DEFAULT_SORT: ModelSort = ''
export const DEFAULT_PERIOD: ModelPeriod = 'AllTime'
export const ALL_BASE_MODELS_ROUTE_VALUE = 'all'
export const BLACKLIST_STORAGE_KEY = 'comfyui-companion:civitai-model-blacklist'

export type ModelTypeFilter =
  | ''
  | 'Checkpoint'
  | 'TextualInversion'
  | 'Hypernetwork'
  | 'AestheticGradient'
  | 'LORA'
  | 'Controlnet'
  | 'Poses'

export const MODEL_TYPE_OPTIONS: Array<{ label: string; value: ModelTypeFilter }> = [
  { label: 'All types', value: '' },
  { label: 'Checkpoint', value: 'Checkpoint' },
  { label: 'Textual inversion', value: 'TextualInversion' },
  { label: 'Hypernetwork', value: 'Hypernetwork' },
  { label: 'Aesthetic gradient', value: 'AestheticGradient' },
  { label: 'LoRA', value: 'LORA' },
  { label: 'ControlNet', value: 'Controlnet' },
  { label: 'Poses', value: 'Poses' },
]

export type ModelSort = '' | 'Highest Rated' | 'Most Downloaded' | 'Newest'

export const MODEL_SORT_OPTIONS: Array<{ label: string; value: ModelSort }> = [
  { label: 'No sort', value: '' },
  { label: 'Most downloaded', value: 'Most Downloaded' },
  { label: 'Highest rated', value: 'Highest Rated' },
  { label: 'Newest', value: 'Newest' },
]

export type ModelPeriod = 'AllTime' | 'Year' | 'Month' | 'Week' | 'Day'

export const MODEL_PERIOD_OPTIONS: Array<{ label: string; value: ModelPeriod }> = [
  { label: 'All time', value: 'AllTime' },
  { label: 'Year', value: 'Year' },
  { label: 'Month', value: 'Month' },
  { label: 'Week', value: 'Week' },
  { label: 'Today', value: 'Day' },
]

export type AssetSearchPreset = {
  label: string
  type: ModelTypeFilter
  sort: ModelSort
  period: ModelPeriod
  nsfw?: boolean
  primaryFileOnly: boolean
}

export const ASSET_SEARCH_PRESETS: AssetSearchPreset[] = [
  { label: 'Latest', type: '', sort: 'Newest', period: DEFAULT_PERIOD, primaryFileOnly: true },
  { label: 'Latest LoRA', type: 'LORA', sort: 'Newest', period: DEFAULT_PERIOD, primaryFileOnly: true },
  { label: 'Latest checkpoints', type: 'Checkpoint', sort: 'Newest', period: DEFAULT_PERIOD, primaryFileOnly: true },
  { label: 'Highest rated checkpoints', type: 'Checkpoint', sort: 'Highest Rated', period: DEFAULT_PERIOD, primaryFileOnly: true },
]

export const BASE_MODEL_OPTIONS = [
  { label: 'SDXL 1.0', value: 'SDXL 1.0', group: 'SDXL' },
  { label: 'SDXL 0.9', value: 'SDXL 0.9', group: 'SDXL' },
  { label: 'SDXL LCM', value: 'SDXL 1.0 LCM', group: 'SDXL' },
  { label: 'SDXL Distilled', value: 'SDXL Distilled', group: 'SDXL' },
  { label: 'SDXL Hyper', value: 'SDXL Hyper', group: 'SDXL' },
  { label: 'SDXL Lightning', value: 'SDXL Lightning', group: 'SDXL' },
  { label: 'Flux.1 D', value: 'Flux.1 D', group: 'Flux' },
  { label: 'Flux.1 S', value: 'Flux.1 S', group: 'Flux' },
  { label: 'Flux.1 Kontext', value: 'Flux.1 Kontext', group: 'Flux' },
  { label: 'Flux.1 Krea', value: 'Flux.1 Krea', group: 'Flux' },
  { label: 'Flux.2 D', value: 'Flux.2 D', group: 'Flux' },
  { label: 'Flux.2 Klein 4B', value: 'Flux.2 Klein 4B', group: 'Flux' },
  { label: 'Flux.2 Klein 4B-base', value: 'Flux.2 Klein 4B-base', group: 'Flux' },
  { label: 'Flux.2 Klein 9B', value: 'Flux.2 Klein 9B', group: 'Flux' },
  { label: 'Flux.2 Klein 9B-base', value: 'Flux.2 Klein 9B-base', group: 'Flux' },
  { label: 'Pony', value: 'Pony', group: 'Pony' },
  { label: 'Pony V7', value: 'Pony V7', group: 'Pony' },
  { label: 'Illustrious', value: 'Illustrious', group: 'Illustrious' },
  { label: 'Illustrious 0.1', value: 'Illustrious 0.1', group: 'Illustrious' },
  { label: 'Anima', value: 'Anima', group: 'Anima' },
] as const

export type BaseModelFilter = (typeof BASE_MODEL_OPTIONS)[number]['value']

export const DEFAULT_BASE_MODELS: BaseModelFilter[] = BASE_MODEL_OPTIONS.map((option) => option.value)

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
  nsfwLevel?: string | null
  width?: number
  height?: number
  hash?: string | null
  meta?: unknown
  postId?: number
  username?: string
  modelVersionIds?: number[]
}

export type CivitaiModelVersion = {
  id: number
  name?: string | null
  description?: string | null
  createdAt?: string | null
  publishedAt?: string | null
  status?: string | null
  availability?: string | null
  covered?: boolean
  baseModel?: string | null
  trainedWords?: string[]
  files?: Array<{
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
      fp?: string
      size?: string
      format?: string
    }
  }>
  stats?: CivitaiStats
  images?: CivitaiImage[]
}

export type CivitaiModel = {
  id: number
  name: string
  type: string
  nsfw?: boolean
  creator?: {
    username?: string | null
  } | null
  stats?: CivitaiStats
  tags?: string[]
  modelVersions?: CivitaiModelVersion[]
}

export type CivitaiModelsResponse = {
  items?: CivitaiModel[]
  metadata?: {
    currentPage?: number
    pageSize?: number
    totalItems?: number
    totalPages?: number
    nextCursor?: string | null
    nextPage?: string | null
    prevPage?: string | null
  }
}
