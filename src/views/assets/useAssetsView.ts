import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { AssetPreviewDownload } from '../../components/asset-preview/assetPreviewTypes'
import { useAssetDownloads } from '../../composables/useAssetDownloads'
import { useConfirmDialog } from '../../composables/useConfirmDialog'
import { createAssetDownloadActions } from './assetDownloadActions'
import { createAssetSearchController } from './assetSearchController'
import {
  ASSET_SEARCH_PRESETS,
  DEFAULT_BASE_MODEL_LABEL,
  DEFAULT_BASE_MODELS,
  DEFAULT_PERIOD,
  DEFAULT_SORT,
  MODEL_PERIOD_OPTIONS,
  MODEL_SORT_OPTIONS,
  MODEL_TYPE_OPTIONS,
  VISIBLE_BASE_MODEL_OPTIONS,
  type BaseModelFilter,
  type CivitaiModel,
  type ModelPeriod,
  type ModelSort,
  type ModelTypeFilter,
} from './assetViewTypes'
import {
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
} from './assetRouteHelpers'
import { useHiddenAssetModels } from './useHiddenAssetModels'

export function useAssetsView() {
const route = useRoute()
const router = useRouter()
const query = ref('')
const includeNsfw = ref(false)
const blurNsfwContent = ref(true)
const selectedType = ref<ModelTypeFilter>('')
const selectedSort = ref<ModelSort>(DEFAULT_SORT)
const selectedPeriod = ref<ModelPeriod>(DEFAULT_PERIOD)
const selectedBaseModels = ref<BaseModelFilter[]>([...DEFAULT_BASE_MODELS])
const models = ref<CivitaiModel[]>([])
const loading = ref(false)
const error = ref('')
const searched = ref(false)
const activeQuery = ref('')
const activeModelId = ref('')
const activeModelVersionId = ref('')
const activeTag = ref('')
const activeUsername = ref('')
const hasStoredCivitaiApiKey = ref(false)
const modelIdQuery = ref('')
const modelVersionIdQuery = ref('')
const tagQuery = ref('')
const primaryFileOnly = ref(false)
const currentPage = ref(1)
const totalItems = ref(0)
const totalPages = ref(0)
const currentCursor = ref('')
const nextCursor = ref('')
const activeImageModel = ref<CivitaiModel | null>(null)
const activeImageInitialIndex = ref(0)
const openDownloadMenuKey = ref('')
const queuingDownloadKey = ref('')
const downloadActionError = ref('')
const downloadActionNotice = ref('')
const confirm = useConfirmDialog()
const {
  blacklistedModelIdSet,
  blacklistModel,
  hiddenModelCount,
  loadBlacklistedModels,
  restoreHiddenModel,
} = useHiddenAssetModels({
  activeImageModel,
  closeImageModal,
  models,
  openDownloadMenuKey,
})

const {
  downloadByVersionId,
  watchedByVersionId,
  queueDownload,
  watchDownload,
  unwatchDownload,
  deleteDownloadedFile,
} = useAssetDownloads({ includeWatched: true })

const {
  activeDownloadForModel,
  canQueueVersion: canActOnVersionDownload,
  downloadButtonLabel,
  downloadForVersion,
  downloadStatusLabel,
  handleDownloadClick,
  hasDownloadedVersion,
  isModelDownloadQueuing,
  isVersionQueuing,
  queueAssetDownload,
  queueMissingVersionsForModel,
  queueableMissingVersionsForModel,
  versionDownloadButtonLabel,
} = createAssetDownloadActions({
  downloadActionError,
  downloadActionNotice,
  downloadByVersionId,
  openDownloadMenuKey,
  queueDownload,
  unwatchDownload,
  queuingDownloadKey,
  watchedByVersionId,
  watchDownload,
  confirm,
  onDownloadQueued: unhideModelAfterDownload,
})

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
  activeTag,
  activeUsername,
  blacklistedModelIdSet,
  currentCursor,
  currentPage,
  error,
  hasStoredCivitaiApiKey,
  includeNsfw,
  blurNsfwContent,
  loading,
  modelIdQuery,
  modelVersionIdQuery,
  tagQuery,
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
const visibleModels = computed(() =>
  models.value.filter((model) => !blacklistedModelIdSet.value.has(model.id)),
)
const hasRenderableState = computed(() =>
  loading.value || error.value || searched.value || visibleModels.value.length > 0,
)
const hasSearchInput = computed(() => {
  return (
    searched.value ||
    query.value.trim().length >= 2 ||
    Boolean(
      modelIdQuery.value ||
      modelVersionIdQuery.value ||
      activeModelId.value ||
      activeModelVersionId.value ||
      tagQuery.value.trim() ||
      activeTag.value ||
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
    return DEFAULT_BASE_MODEL_LABEL
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
    if (activeTag.value) {
      return `Loading #${activeTag.value}`
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
    if (activeTag.value) {
      return `No models tagged "${activeTag.value}"`
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
const pageCountExact = computed(() => totalPages.value > 0)
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
function openImageModal(model: CivitaiModel, initialImageIndex = 0) {
  const version = firstVersion(model)
  if (!version || !imagesForVersion(version).length) {
    return
  }
  activeImageInitialIndex.value = initialImageIndex
  activeImageModel.value = model
}
function closeImageModal() {
  activeImageModel.value = null
  activeImageInitialIndex.value = 0
}
function unhideModelAfterDownload(model: CivitaiModel) {
  if (blacklistedModelIdSet.value.has(model.id)) {
    restoreHiddenModel(model)
  }
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
    BASE_MODEL_OPTIONS: VISIBLE_BASE_MODEL_OPTIONS,
    query,
    includeNsfw,
    blurNsfwContent,
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
    activeTag,
    activeUsername,
    hasStoredCivitaiApiKey,
    modelIdQuery,
    modelVersionIdQuery,
    tagQuery,
    primaryFileOnly,
    currentPage,
    activeImageModel,
    activeImageInitialIndex,
    openDownloadMenuKey,
    queuingDownloadKey,
    downloadActionError,
    downloadActionNotice,
    visibleModels,
    hiddenModelCount,
    hasRenderableState,
    creatorFilterLabel,
    selectedBaseModelSet,
    selectedBaseModelLabel,
    isUsingDefaultBaseModels,
    resultSummary,
    canGoPrevious,
    canGoNext,
  pageCount,
  pageCountExact,
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
    canQueueVersion: canActOnVersionDownload,
    versionDownloadButtonLabel,
    isModelDownloadQueuing,
    isVersionQueuing,
    queueAssetDownload,
    queueMissingVersionsForModel,
    queueableMissingVersionsForModel,
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
