import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { AssetPreviewDownload } from '../../components/asset-preview/assetPreviewTypes'
import { useAssetDownloads } from '../../composables/useAssetDownloads'
import { createAssetDownloadActions } from './assetDownloadActions'
import { createAssetSearchController } from './assetSearchController'
import {
  ASSET_SEARCH_PRESETS,
  BASE_MODEL_OPTIONS,
  BLACKLIST_STORAGE_KEY,
  DEFAULT_BASE_MODELS,
  DEFAULT_PERIOD,
  DEFAULT_SORT,
  MODEL_PERIOD_OPTIONS,
  MODEL_SORT_OPTIONS,
  MODEL_TYPE_OPTIONS,
  type BaseModelFilter,
  type CivitaiModel,
  type ModelPeriod,
  type ModelSort,
  type ModelTypeFilter,
} from './assetViewTypes'
import {
  canQueueVersion,
  creatorLabel,
  favoriteCountFor,
  fileSizeFor,
  firstVersion,
  formatFileSize,
  formatNumber,
  imagesForVersion,
  isImageNsfw,
  isVideoPreview,
  modelDownloadKey,
  modelHasNsfw,
  modelUrl,
  modelVersionLabel,
  primaryFileForVersion,
  thumbnailFor,
  thumbnailMediaFor,
  versionLabel,
  versionsForModel,
} from './assetModelHelpers'
import {
  areSameBaseModels,
  normalizeBaseModels,
  normalizeBlacklistedModelIds,
} from './assetRouteHelpers'

export function useAssetsView() {
const route = useRoute()
const router = useRouter()
const query = ref('')
const includeNsfw = ref(false)
const selectedType = ref<ModelTypeFilter>('')
const selectedSort = ref<ModelSort>(DEFAULT_SORT)
const selectedPeriod = ref<ModelPeriod>(DEFAULT_PERIOD)
const selectedBaseModels = ref<BaseModelFilter[]>([...DEFAULT_BASE_MODELS])
const models = ref<CivitaiModel[]>([])
const blacklistedModelIds = ref<number[]>([])
const loading = ref(false)
const error = ref('')
const searched = ref(false)
const activeQuery = ref('')
const activeModelId = ref('')
const activeModelVersionId = ref('')
const activeUsername = ref('')
const hasStoredCivitaiApiKey = ref(false)
const modelIdQuery = ref('')
const modelVersionIdQuery = ref('')
const primaryFileOnly = ref(false)
const currentPage = ref(1)
const totalItems = ref(0)
const totalPages = ref(0)
const currentCursor = ref('')
const nextCursor = ref('')
const activeImageModel = ref<CivitaiModel | null>(null)
const openDownloadMenuKey = ref('')
const queuingDownloadKey = ref('')
const downloadActionError = ref('')

const {
  downloadByVersionId,
  queueDownload,
  deleteDownloadedFile,
} = useAssetDownloads()

const {
  activeDownloadForModel,
  downloadButtonLabel,
  downloadForVersion,
  downloadStatusLabel,
  handleDownloadClick,
  hasDownloadedVersion,
  queueAssetDownload,
  versionDownloadButtonLabel,
} = createAssetDownloadActions({
  downloadActionError,
  downloadByVersionId,
  openDownloadMenuKey,
  queueDownload,
  queuingDownloadKey,
})

const blacklistedModelIdSet = computed(() => new Set(blacklistedModelIds.value))
const {
  applySearchPreset,
  cleanup: cleanupSearchController,
  clearCreatorFilter,
  creatorFilterHref,
  filterByCreator,
  goToPage,
  mount: mountSearchController,
  searchByModelId,
  searchByModelVersionId,
} = createAssetSearchController({
  activeQuery,
  activeModelId,
  activeModelVersionId,
  activeUsername,
  blacklistedModelIdSet,
  currentCursor,
  currentPage,
  error,
  hasStoredCivitaiApiKey,
  includeNsfw,
  loading,
  modelIdQuery,
  modelVersionIdQuery,
  models,
  nextCursor,
  primaryFileOnly,
  query,
  route,
  router,
  searched,
  selectedBaseModels,
  selectedPeriod,
  selectedSort,
  selectedType,
  totalItems,
  totalPages,
})
const visibleModels = computed(() => models.value.filter((model) => !blacklistedModelIdSet.value.has(model.id)))
const hasRenderableState = computed(() => loading.value || error.value || searched.value || visibleModels.value.length > 0)
const hasSearchInput = computed(() => {
  return (
    searched.value ||
    query.value.trim().length >= 2 ||
    Boolean(
      modelIdQuery.value ||
      modelVersionIdQuery.value ||
      activeModelId.value ||
      activeModelVersionId.value ||
      activeUsername.value ||
      selectedType.value,
    )
  )
})
const activeLookupLabel = computed(() => {
  if (activeModelVersionId.value) {
    return `version #${activeModelVersionId.value}`
  }

  if (activeModelId.value) {
    return `model #${activeModelId.value}`
  }

  return ''
})
const creatorFilterLabel = computed(() => {
  return activeUsername.value ? `@${activeUsername.value}` : ''
})
const typeFilterLabel = computed(() => {
  return MODEL_TYPE_OPTIONS.find((option) => option.value === selectedType.value)?.label ?? ''
})
const selectedBaseModelSet = computed(() => new Set(selectedBaseModels.value))
const selectedBaseModelLabel = computed(() => {
  if (!selectedBaseModels.value.length) {
    return 'All base models'
  }

  if (areSameBaseModels(selectedBaseModels.value, DEFAULT_BASE_MODELS)) {
    return 'SDXL, Flux, Pony, Illustrious, Anima'
  }

  return `${selectedBaseModels.value.length} base model${selectedBaseModels.value.length === 1 ? '' : 's'}`
})
const isUsingDefaultBaseModels = computed(() =>
  areSameBaseModels(selectedBaseModels.value, DEFAULT_BASE_MODELS),
)
const resultSummary = computed(() => {
  if (loading.value) {
    if (activeLookupLabel.value) {
      return `Loading Civitai ${activeLookupLabel.value}`
    }

    if (activeUsername.value) {
      return `Loading @${activeUsername.value}`
    }

    if (activeQuery.value) {
      return `Searching "${activeQuery.value}"`
    }

    if (typeFilterLabel.value) {
      return `Loading ${typeFilterLabel.value}`
    }

    return 'Loading'
  }

  if (totalItems.value > 0) {
    return `${formatNumber(totalItems.value)} result${totalItems.value === 1 ? '' : 's'}`
  }

  if (models.value.length) {
    return `${models.value.length} shown`
  }

  if (searched.value) {
    if (activeLookupLabel.value) {
      return `No Civitai ${activeLookupLabel.value}`
    }

    if (activeUsername.value) {
      return `No models by @${activeUsername.value}`
    }

    if (activeQuery.value) {
      return `No matches for "${activeQuery.value}"`
    }

    if (typeFilterLabel.value) {
      return `No ${typeFilterLabel.value} models found`
    }
  }

  return ''
})
const canGoPrevious = computed(() => currentPage.value > 1 && !loading.value)
const canGoNext = computed(() => {
  if (loading.value) {
    return false
  }

  if (nextCursor.value) {
    return true
  }

  if (totalPages.value > 0) {
    return currentPage.value < totalPages.value
  }

  return false
})
const pageCount = computed(() => {
  if (totalPages.value > 0) {
    return totalPages.value
  }

  if (nextCursor.value) {
    return currentPage.value + 1
  }

  return Math.max(1, currentPage.value)
})
const pageLabel = computed(() => {
  if (!searched.value || !hasSearchInput.value) {
    return ''
  }

  if (totalPages.value > 1) {
    return `Page ${currentPage.value} of ${totalPages.value}`
  }

  return `Page ${currentPage.value}`
})
function toggleBaseModelFilter(baseModel: BaseModelFilter) {
  const nextValues = selectedBaseModels.value.includes(baseModel)
    ? selectedBaseModels.value.filter((value) => value !== baseModel)
    : [...selectedBaseModels.value, baseModel]
  selectedBaseModels.value = normalizeBaseModels(nextValues)
}

function resetDefaultBaseModels() {
  selectedBaseModels.value = [...DEFAULT_BASE_MODELS]
}

function clearBaseModelFilters() {
  selectedBaseModels.value = []
}

function loadBlacklistedModels() {
  try {
    blacklistedModelIds.value = normalizeBlacklistedModelIds(
      JSON.parse(window.localStorage.getItem(BLACKLIST_STORAGE_KEY) ?? '[]'),
    )
  } catch {
    blacklistedModelIds.value = []
  }
}

function persistBlacklistedModels() {
  window.localStorage.setItem(BLACKLIST_STORAGE_KEY, JSON.stringify(blacklistedModelIds.value))
}

function blacklistModel(model: CivitaiModel) {
  if (!blacklistedModelIdSet.value.has(model.id)) {
    blacklistedModelIds.value = normalizeBlacklistedModelIds([...blacklistedModelIds.value, model.id])
    persistBlacklistedModels()
  }

  models.value = models.value.filter((item) => item.id !== model.id)
  openDownloadMenuKey.value = ''

  if (activeImageModel.value?.id === model.id) {
    closeImageModal()
  }
}

function openImageModal(model: CivitaiModel) {
  const version = firstVersion(model)
  if (!version || !imagesForVersion(version).length) {
    return
  }

  activeImageModel.value = model
}

function closeImageModal() {
  activeImageModel.value = null
}

async function deleteAssetDownload(download: AssetPreviewDownload) {
  if (!download.id) {
    downloadActionError.value = 'No download record was found for this file.'
    return
  }

  downloadActionError.value = ''

  try {
    await deleteDownloadedFile(download.id)
  } catch (caughtError) {
    downloadActionError.value = caughtError instanceof Error ? caughtError.message : 'Could not delete downloaded file.'
  }
}

onMounted(() => {
  loadBlacklistedModels()
  mountSearchController()
})

onBeforeUnmount(() => {
  cleanupSearchController()
})

  return {
    MODEL_TYPE_OPTIONS,
    MODEL_SORT_OPTIONS,
    MODEL_PERIOD_OPTIONS,
    ASSET_SEARCH_PRESETS,
    BASE_MODEL_OPTIONS,
    query,
    includeNsfw,
    selectedType,
    selectedSort,
    selectedPeriod,
    selectedBaseModels,
    models,
    loading,
    error,
    searched,
    activeQuery,
    activeModelId,
    activeModelVersionId,
    activeUsername,
    hasStoredCivitaiApiKey,
    modelIdQuery,
    modelVersionIdQuery,
    primaryFileOnly,
    currentPage,
    activeImageModel,
    openDownloadMenuKey,
    queuingDownloadKey,
    downloadActionError,
    visibleModels,
    hasRenderableState,
    creatorFilterLabel,
    selectedBaseModelSet,
    selectedBaseModelLabel,
    isUsingDefaultBaseModels,
    resultSummary,
    canGoPrevious,
    canGoNext,
    pageCount,
    pageLabel,
    formatNumber,
    firstVersion,
    isVideoPreview,
    thumbnailMediaFor,
    thumbnailFor,
    versionLabel,
    modelVersionLabel,
    creatorLabel,
    favoriteCountFor,
    isImageNsfw,
    modelHasNsfw,
    formatFileSize,
    versionsForModel,
    primaryFileForVersion,
    fileSizeFor,
    modelDownloadKey,
    downloadForVersion,
    hasDownloadedVersion,
    activeDownloadForModel,
    downloadStatusLabel,
    downloadButtonLabel,
    canQueueVersion,
    versionDownloadButtonLabel,
    queueAssetDownload,
    deleteAssetDownload,
    handleDownloadClick,
    modelUrl,
    toggleBaseModelFilter,
    resetDefaultBaseModels,
    clearBaseModelFilters,
    applySearchPreset,
    blacklistModel,
    creatorFilterHref,
    filterByCreator,
    clearCreatorFilter,
    goToPage,
    searchByModelId,
    searchByModelVersionId,
    openImageModal,
    closeImageModal,
  }
}

export type AssetsViewContext = ReturnType<typeof useAssetsView>
