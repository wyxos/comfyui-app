<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import AssetPreviewModal from '../components/asset-preview/AssetPreviewModal.vue'
import { useAssetPreviewDownloadActions } from '../components/asset-preview/useAssetPreviewDownloadActions'
import UiPaginatedCardGrid from '../components/ui/UiPaginatedCardGrid.vue'
import { fetchAppSettings } from '../composables/useAppSettings'
import { useAssetDownloads } from '../composables/useAssetDownloads'
import LibraryHeader from './library/LibraryHeader.vue'
import LibraryModelCard from './library/LibraryModelCard.vue'
import {
  baseModelLabelsFor,
  compatibilityForDownload,
  controlNetBaseModelLabel,
  controlNetDisplayName,
  hiddenLibraryItemForModel,
  isCheckpointOrLora,
  isVideoPreview,
  modelTypeLabel,
  normalizedModelType,
  parseLibrarySourceFilter,
  previewFor,
  watchedPreviewPathsFor,
  watchedPreviewUrlFor,
  type ControlNetLibraryItem,
  type ControlNetResponse,
  type HiddenLibraryItem,
  type LibrarySourceFilter,
  type LibraryModelItem,
  type LibraryTypeFilter,
} from './library/libraryModelHelpers'
import { useHiddenLibraryModels } from './library/useHiddenLibraryModels'
import { useLibrarySafetyOverrides } from './library/useLibrarySafetyOverrides'

const PAGE_SIZE = 40
const route = useRoute()

const {
  completedDownloads,
  watchedDownloads,
  loading,
  error,
  refreshDownloads,
  refreshWatchedDownloads,
} = useAssetDownloads({ includeWatched: true })
const {
  queuingDownloadKey,
  downloadForVersion,
  downloadStatusLabel,
  queueAssetDownload,
  downloadActionError,
  deleteAssetDownload,
  repairDownloadPreviews,
  modelDownloadKey,
} = useAssetPreviewDownloadActions()

const query = ref('')
const includeNsfw = ref(false)
const blurNsfwContent = ref(true)
const typeFilter = ref<LibraryTypeFilter>('all')
const sourceFilter = ref<LibrarySourceFilter>(parseLibrarySourceFilter(route.query.source))
const baseModelFilter = ref('all')
const currentPage = ref(1)
const selectedModel = ref<LibraryModelItem | null>(null)
const controlNetModels = ref<ControlNetLibraryItem[]>([])
const controlNetLoadingError = ref('')
const savingCompatibility = ref(false)
const compatibilitySaveError = ref('')
const {
  savingSafety,
  safetyError,
  savingImageSafety,
  imageSafetyError,
  canEditSelectedModelSafety,
  resetSafetyErrors,
  saveSelectedModelSafety,
  saveSelectedModelImageSafety,
} = useLibrarySafetyOverrides({
  selectedModel,
  refreshDownloads,
  refreshWatchedDownloads,
  refreshControlNets,
})
const {
  hiddenError,
  hiddenLoading,
  hiddenModelIds,
  hiddenModelIdSet,
  hiddenModels,
  refreshHiddenModels,
  restoreHiddenModelId,
} = useHiddenLibraryModels()

const downloadedModels = computed<LibraryModelItem[]>(() => {
  return completedDownloads.value
    .filter((item) => isCheckpointOrLora(item))
    .map((item) => ({
      ...item,
      itemKind: normalizedModelType(item) as 'checkpoint' | 'lora',
      librarySource: 'downloaded' as const,
      compatibility: compatibilityForDownload(item),
    }))
    .sort((left, right) => (right.updatedAt ?? 0) - (left.updatedAt ?? 0))
})

const completedDownloadKeys = computed(() =>
  new Set(completedDownloads.value.map((item) => modelVersionKey(item.modelId, item.versionId))),
)
const watchedModels = computed<LibraryModelItem[]>(() => {
  return watchedDownloads.value
    .filter((item) => item.state !== 'cancelled')
    .filter((item) => isCheckpointOrLora(item))
    .filter((item) => !completedDownloadKeys.value.has(modelVersionKey(item.modelId, item.versionId)))
    .map((item) => ({
      ...item,
      itemKind: normalizedModelType(item) as 'checkpoint' | 'lora',
      librarySource: 'watched' as const,
      compatibility: compatibilityForDownload(item),
      previewUrl: watchedPreviewUrlFor(item),
      previewPaths: watchedPreviewPathsFor(item),
    }))
    .sort((left, right) => (right.updatedAt ?? 0) - (left.updatedAt ?? 0))
})
const hiddenLibraryModels = computed<LibraryModelItem[]>(() =>
  hiddenModels.value
    .map((model) => hiddenLibraryItemForModel(model))
    .filter((item): item is HiddenLibraryItem => Boolean(item))
)
const libraryModels = computed(() =>
  [...downloadedModels.value, ...watchedModels.value, ...hiddenLibraryModels.value, ...controlNetModels.value]
    .sort((left, right) => (right.updatedAt ?? 0) - (left.updatedAt ?? 0)),
)
const nonHiddenLibraryModels = computed(() =>
  libraryModels.value.filter((item) => item.librarySource !== 'hidden'),
)

const filteredModels = computed(() => {
  const search = query.value.trim().toLowerCase()
  return libraryModels.value.filter((item) => {
    if (!matchesSourceFilter(item)) {
      return false
    }

    if (typeFilter.value !== 'all' && item.itemKind !== typeFilter.value) {
      return false
    }

    if (
      baseModelFilter.value !== 'all' &&
      !baseModelLabelsFor(item).some((baseModel) => baseModel.toLowerCase() === baseModelFilter.value.toLowerCase())
    ) {
      return false
    }

    if (!search) {
      return true
    }

    return [
      item.modelName,
      item.versionName,
      item.fileName,
      item.baseModel,
      baseModelLabelsFor(item).join(' '),
      'targetPath' in item ? item.targetPath : '',
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(search)
  })
})

const pageCount = computed(() => Math.max(1, Math.ceil(filteredModels.value.length / PAGE_SIZE)))
const pageStart = computed(() => (currentPage.value - 1) * PAGE_SIZE)
const pageEnd = computed(() => pageStart.value + PAGE_SIZE)
const pagedModels = computed(() => filteredModels.value.slice(pageStart.value, pageEnd.value))
const visibleRangeLabel = computed(() => {
  if (!filteredModels.value.length) {
    return '0 of 0'
  }

  return `${pageStart.value + 1}-${Math.min(pageEnd.value, filteredModels.value.length)} of ${filteredModels.value.length}`
})
const typeCounts = computed(() => ({
  all: nonHiddenLibraryModels.value.length,
  checkpoint: nonHiddenLibraryModels.value.filter((item) => item.itemKind === 'checkpoint').length,
  lora: nonHiddenLibraryModels.value.filter((item) => item.itemKind === 'lora').length,
  controlnet: nonHiddenLibraryModels.value.filter((item) => item.itemKind === 'controlnet').length,
  hidden: libraryModels.value.filter((item) => item.librarySource === 'hidden').length,
  hiddenStored: hiddenModelIds.value.length,
  watched: nonHiddenLibraryModels.value.filter((item) => item.librarySource === 'watched').length,
}))
const baseModelOptions = computed(() => {
  const counts = new Map<string, number>()
  let scopedTotal = 0
  for (const item of libraryModels.value) {
    if (!matchesSourceFilter(item)) {
      continue
    }

    if (typeFilter.value !== 'all' && item.itemKind !== typeFilter.value) {
      continue
    }

    scopedTotal += 1
    for (const baseModel of baseModelLabelsFor(item)) {
      counts.set(baseModel, (counts.get(baseModel) ?? 0) + 1)
    }
  }

  return [
    { label: 'All bases', value: 'all', count: scopedTotal },
    ...Array.from(counts, ([label, count]) => ({ label, value: label, count }))
      .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label)),
  ]
})
watch([query, typeFilter, sourceFilter, baseModelFilter], () => {
  currentPage.value = 1
})

watch(baseModelOptions, (options) => {
  if (baseModelFilter.value !== 'all' && !options.some((option) => option.value === baseModelFilter.value)) {
    baseModelFilter.value = 'all'
  }
})

watch(pageCount, (nextPageCount) => {
  currentPage.value = Math.min(currentPage.value, nextPageCount)
})

watch(
  () => route.query.source,
  (value) => {
    sourceFilter.value = parseLibrarySourceFilter(value)
  },
)

watch(controlNetModels, () => {
  if (selectedModel.value?.itemKind !== 'controlnet') {
    return
  }

  selectedModel.value = controlNetModels.value.find((item) => item.fileName === selectedModel.value?.fileName) ?? selectedModel.value
})

function goToPage(page: number) {
  currentPage.value = Math.max(1, Math.min(page, pageCount.value))
}

function modelVersionKey(modelId: number, versionId: number) {
  return `${modelId}:${versionId}`
}

function matchesSourceFilter(item: LibraryModelItem) {
  if (sourceFilter.value === 'hidden') {
    return item.librarySource === 'hidden'
  }

  if (item.librarySource === 'hidden') {
    return false
  }

  return sourceFilter.value === 'all' || item.librarySource === sourceFilter.value
}

function openModelPreview(item: LibraryModelItem) {
  compatibilitySaveError.value = ''
  resetSafetyErrors()
  selectedModel.value = item
}

function selectedCivitaiModel(item: LibraryModelItem | null) {
  return item && 'civitaiModel' in item ? item.civitaiModel : null
}

function restoreLibraryHiddenModel(item: LibraryModelItem) {
  if (item.librarySource === 'hidden') {
    restoreHiddenModelId(item.modelId)
  }
}

async function queueLibraryAssetDownload(model: Parameters<typeof queueAssetDownload>[0], version: Parameters<typeof queueAssetDownload>[1]) {
  const wasHidden = hiddenModelIdSet.value.has(model.id)
  await queueAssetDownload(model, version)

  if (wasHidden && !downloadActionError.value) {
    restoreHiddenModelId(model.id)
  }
}

function closeModelPreview() {
  selectedModel.value = null
  compatibilitySaveError.value = ''
  resetSafetyErrors()
}

async function loadAppSettingsDefaults() {
  try {
    const settings = await fetchAppSettings()
    includeNsfw.value = settings.includeNsfw
    blurNsfwContent.value = settings.blurNsfwContent !== false
  } catch {
    includeNsfw.value = false
    blurNsfwContent.value = true
  }
}

async function refreshControlNets() {
  controlNetLoadingError.value = ''
  try {
    const response = await fetch('/api/controlnets', {
      headers: { Accept: 'application/json' },
    })
    const payload = (await response.json()) as ControlNetResponse
    if (!response.ok || payload.ok === false) {
      throw new Error(payload.message ?? `ControlNets returned ${response.status}`)
    }

    const loadedAt = Date.now()
    controlNetModels.value = (payload.controlNets ?? []).map((controlNet) => ({
      id: `controlnet:${controlNet.name}`,
      itemKind: 'controlnet',
      librarySource: 'controlnet',
      modelName: controlNetDisplayName(controlNet),
      modelType: 'ControlNet',
      modelId: controlNet.compatibility?.modelId ?? null,
      versionId: controlNet.compatibility?.versionId ?? null,
      versionName: controlNet.compatibility?.versionName ?? controlNet.controlType ?? 'Local ControlNet',
      baseModel: controlNetBaseModelLabel(controlNet.compatibility),
      fileName: controlNet.name,
      updatedAt: loadedAt,
      previewUrl: null,
      previewPaths: [],
      compatibility: controlNet.compatibility ?? null,
      controlType: controlNet.controlType ?? controlNet.compatibility?.controlType ?? '',
      loaderType: controlNet.loaderType ?? controlNet.compatibility?.loaderType ?? '',
    }))
  } catch (error) {
    controlNetLoadingError.value = error instanceof Error ? error.message : 'Could not load ControlNets.'
  }
}

async function refreshLibrary() {
  await Promise.allSettled([refreshDownloads(), refreshWatchedDownloads(), refreshControlNets(), refreshHiddenModels()])
}

async function saveControlNetCompatibility(payload: {
  compatibleBaseModels: string[]
  controlType: string
  loaderType: string
}) {
  if (selectedModel.value?.itemKind !== 'controlnet') {
    return
  }

  savingCompatibility.value = true
  compatibilitySaveError.value = ''
  try {
    const response = await fetch(
      `/api/model-metadata?type=controlnet&name=${encodeURIComponent(selectedModel.value.fileName)}`,
      {
        method: 'PUT',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json; charset=utf-8',
        },
        body: JSON.stringify({
          ...payload,
          modelName: selectedModel.value.modelName,
          modelType: 'ControlNet',
        }),
      },
    )
    const result = await response.json().catch(() => null)
    if (!response.ok || result?.ok === false) {
      throw new Error(result?.message ?? `Metadata save returned ${response.status}`)
    }

    await refreshControlNets()
  } catch (error) {
    compatibilitySaveError.value = error instanceof Error ? error.message : 'Could not save compatibility metadata.'
  } finally {
    savingCompatibility.value = false
  }
}

onMounted(() => {
  void loadAppSettingsDefaults()
  void refreshLibrary()
})
</script>

<template>
  <main class="flex h-full min-h-0 flex-col bg-background text-foreground">
    <LibraryHeader
      v-model:base-model-filter="baseModelFilter"
      v-model:include-nsfw="includeNsfw"
      v-model:query="query"
      v-model:source-filter="sourceFilter"
      v-model:type-filter="typeFilter"
      :base-model-options="baseModelOptions"
      :error-message="error || controlNetLoadingError || hiddenError || downloadActionError"
      :loading="loading || hiddenLoading"
      :type-counts="typeCounts"
      @refresh="refreshLibrary"
    />

    <UiPaginatedCardGrid
      :items-present="pagedModels.length > 0"
      :range-label="visibleRangeLabel"
      :current-page="currentPage"
      :page-count="pageCount"
      previous-label="Previous library page"
      next-label="Next library page"
      @go-to-page="goToPage"
    >
      <LibraryModelCard
        v-for="item in pagedModels"
        :key="item.id"
        :item="item"
        :blur-nsfw-content="blurNsfwContent"
        @open="openModelPreview"
        @restore="restoreLibraryHiddenModel"
      />

      <template #empty>
        {{ sourceFilter === 'watched' ? 'No watched models match the current filters.' : sourceFilter === 'hidden' ? 'No hidden models match the current filters.' : 'No library models match the current filters.' }}
      </template>
    </UiPaginatedCardGrid>

    <AssetPreviewModal
      :open="Boolean(selectedModel)"
      :model="selectedCivitaiModel(selectedModel)"
      :model-id="selectedModel?.modelId ?? null"
      :version-id="selectedModel?.versionId ?? null"
      :preview-url="selectedModel ? previewFor(selectedModel) : null"
      :is-video="selectedModel ? isVideoPreview(selectedModel) : false"
      :include-nsfw="includeNsfw"
      :blur-nsfw-content="blurNsfwContent"
      :title="selectedModel?.modelName ?? 'Preview'"
      :subtitle="selectedModel?.versionName ?? null"
      :kind-label="selectedModel ? modelTypeLabel(selectedModel) : 'Preview'"
      :model-type="selectedModel?.modelType ?? null"
      :base-model="selectedModel?.baseModel ?? null"
      :file-name="selectedModel?.fileName ?? null"
      :queuing-download-key="queuingDownloadKey"
      :download-for-version="downloadForVersion"
      :download-status-label="downloadStatusLabel"
      :queue-asset-download="queueLibraryAssetDownload"
      :delete-asset-download="deleteAssetDownload"
      :repair-download-previews="repairDownloadPreviews"
      :model-download-key="modelDownloadKey"
      :compatibility="selectedModel?.compatibility ?? null"
      :editable-compatibility="selectedModel?.itemKind === 'controlnet'"
      :editable-safety="canEditSelectedModelSafety"
      :saving-compatibility="savingCompatibility"
      :saving-safety="savingSafety"
      :saving-image-safety="savingImageSafety"
      :compatibility-error="compatibilitySaveError"
      :safety-error="safetyError"
      :image-safety-error="imageSafetyError"
      show-download-actions
      @close="closeModelPreview"
      @save-compatibility="saveControlNetCompatibility"
      @save-safety="saveSelectedModelSafety"
      @save-image-safety="saveSelectedModelImageSafety"
    />
  </main>
</template>
