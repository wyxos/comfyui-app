<script setup lang="ts">
import {
  FileDown,
  LoaderCircle,
  Search,
} from 'lucide-vue-next'
import { computed, onMounted, ref, watch } from 'vue'
import AssetPreviewModal from '../components/asset-preview/AssetPreviewModal.vue'
import { isVideoUrl } from '../components/asset-preview/assetPreviewHelpers'
import UiPaginatedCardGrid from '../components/ui/UiPaginatedCardGrid.vue'
import UiPreviewCard from '../components/ui/UiPreviewCard.vue'
import { fetchAppSettings } from '../composables/useAppSettings'
import { useAssetDownloads, type AssetDownloadItem } from '../composables/useAssetDownloads'
import type { ModelCompatibilityMetadata } from './home/homeTypes'

const PAGE_SIZE = 40

const typeFilters = [
  { label: 'All', value: 'all' },
  { label: 'Checkpoints', value: 'checkpoint' },
  { label: 'LoRAs', value: 'lora' },
  { label: 'ControlNets', value: 'controlnet' },
] as const

type LibraryTypeFilter = (typeof typeFilters)[number]['value']
type LibraryItemKind = Exclude<LibraryTypeFilter, 'all'>
type ControlNetLibraryItem = {
  id: string
  itemKind: 'controlnet'
  modelName: string
  modelType: 'ControlNet'
  modelId: number | null
  versionId: number | null
  versionName: string
  baseModel: string
  fileName: string
  updatedAt: number
  previewUrl: null
  previewPaths: []
  compatibility: ModelCompatibilityMetadata | null
  controlType: string
  loaderType: string
}
type LibraryModelItem =
  | (AssetDownloadItem & { itemKind: 'checkpoint' | 'lora'; compatibility?: ModelCompatibilityMetadata | null })
  | ControlNetLibraryItem
type ControlNetResponse = {
  ok: boolean
  controlNets?: Array<{
    name: string
    displayName?: string
    compatibility?: ModelCompatibilityMetadata | null
    controlType?: string
    loaderType?: string
  }>
  message?: string
}

const {
  completedDownloads,
  loading,
  error,
  refreshDownloads,
} = useAssetDownloads()

const query = ref('')
const includeNsfw = ref(false)
const typeFilter = ref<LibraryTypeFilter>('all')
const currentPage = ref(1)
const selectedModel = ref<LibraryModelItem | null>(null)
const controlNetModels = ref<ControlNetLibraryItem[]>([])
const controlNetLoadingError = ref('')
const savingCompatibility = ref(false)
const compatibilitySaveError = ref('')

const downloadedModels = computed<LibraryModelItem[]>(() => {
  return completedDownloads.value
    .filter((item) => isCheckpointOrLora(item))
    .map((item) => ({
      ...item,
      itemKind: normalizedModelType(item) as 'checkpoint' | 'lora',
      compatibility: null,
    }))
    .sort((left, right) => (right.updatedAt ?? 0) - (left.updatedAt ?? 0))
})
const libraryModels = computed(() =>
  [...downloadedModels.value, ...controlNetModels.value]
    .sort((left, right) => (right.updatedAt ?? 0) - (left.updatedAt ?? 0)),
)

const filteredModels = computed(() => {
  const search = query.value.trim().toLowerCase()
  return libraryModels.value.filter((item) => {
    if (!includeNsfw.value && modelHasNsfw(item)) {
      return false
    }

    if (typeFilter.value !== 'all' && item.itemKind !== typeFilter.value) {
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
  all: libraryModels.value.length,
  checkpoint: libraryModels.value.filter((item) => item.itemKind === 'checkpoint').length,
  lora: libraryModels.value.filter((item) => item.itemKind === 'lora').length,
  controlnet: libraryModels.value.filter((item) => item.itemKind === 'controlnet').length,
}))

watch([query, typeFilter, includeNsfw], () => {
  currentPage.value = 1
})

watch(pageCount, (nextPageCount) => {
  currentPage.value = Math.min(currentPage.value, nextPageCount)
})

watch(controlNetModels, () => {
  if (selectedModel.value?.itemKind !== 'controlnet') {
    return
  }

  selectedModel.value = controlNetModels.value.find((item) => item.fileName === selectedModel.value?.fileName) ?? selectedModel.value
})

function normalizedModelType(item: AssetDownloadItem): LibraryItemKind | '' {
  const normalized = item.modelType.trim().toLowerCase()
  if (normalized === 'checkpoint') {
    return 'checkpoint'
  }

  if (normalized === 'lora') {
    return 'lora'
  }

  if (normalized === 'controlnet' || normalized === 'control net') {
    return 'controlnet'
  }

  return ''
}

function isCheckpointOrLora(item: AssetDownloadItem) {
  return Boolean(normalizedModelType(item))
}

function modelTypeLabel(item: LibraryModelItem) {
  if (item.itemKind === 'controlnet') {
    return 'ControlNet'
  }

  return item.itemKind === 'lora' ? 'LoRA' : 'Checkpoint'
}

function primaryPreviewPath(item: LibraryModelItem) {
  return item.previewPaths?.find((preview) => preview.url) ?? null
}

function previewFor(item: LibraryModelItem) {
  return item.previewUrl ?? primaryPreviewPath(item)?.url ?? ''
}

function isVideoPreview(item: LibraryModelItem) {
  const previewUrl = previewFor(item)
  return primaryPreviewPath(item)?.mediaType === 'video' || isVideoUrl(previewUrl)
}

function isNsfwValue(value: unknown) {
  if (typeof value === 'boolean') {
    return value
  }

  if (typeof value === 'number') {
    return value > 0
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    return Boolean(normalized && !['false', '0', 'no', 'none', 'safe'].includes(normalized))
  }

  return false
}

function modelHasNsfw(item: LibraryModelItem) {
  return 'modelNsfw' in item ? isNsfwValue(item.modelNsfw ?? item.modelMetadata?.nsfw) : false
}

function goToPage(page: number) {
  currentPage.value = Math.max(1, Math.min(page, pageCount.value))
}

function openModelPreview(item: LibraryModelItem) {
  compatibilitySaveError.value = ''
  selectedModel.value = item
}

function closeModelPreview() {
  selectedModel.value = null
}

async function loadAppSettingsDefaults() {
  try {
    includeNsfw.value = (await fetchAppSettings()).includeNsfw
  } catch {
    includeNsfw.value = false
  }
}

function controlNetBaseModelLabel(compatibility: ModelCompatibilityMetadata | null | undefined) {
  const bases = compatibility?.compatibleBaseModels ?? []
  return bases.length ? bases.join(', ') : compatibility?.baseModel ?? ''
}

function controlNetDisplayName(controlNet: NonNullable<ControlNetResponse['controlNets']>[number]) {
  return controlNet.displayName ?? controlNet.name
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
  await Promise.allSettled([refreshDownloads(), refreshControlNets()])
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
    <section class="border-b border-border bg-card/82 px-4 py-3 sm:px-6">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="min-w-0">
          <h1 class="text-base font-semibold tracking-normal">Library</h1>
          <p class="mt-1 text-xs text-muted-foreground">
            {{ typeCounts.all }} local models, {{ typeCounts.checkpoint }} checkpoints, {{ typeCounts.lora }} LoRAs, {{ typeCounts.controlnet }} ControlNets
          </p>
        </div>

        <button
          class="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-background px-3 text-xs font-semibold text-card-foreground transition hover:border-secondary/60 hover:text-secondary focus:outline-none focus:ring-2 focus:ring-ring/25 disabled:cursor-wait disabled:opacity-60"
          type="button"
          :disabled="loading"
          @click="refreshLibrary"
        >
          <LoaderCircle
            v-if="loading"
            class="h-4 w-4 animate-spin"
          />
          <FileDown
            v-else
            class="h-4 w-4"
          />
          Refresh
        </button>
      </div>

      <div class="mt-3 flex flex-wrap items-center gap-2">
        <label class="relative min-w-[16rem] flex-1 sm:max-w-md">
          <span class="sr-only">Search library</span>
          <Search class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            v-model="query"
            class="h-9 w-full rounded-md border border-input bg-primary px-9 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-accent focus:ring-2 focus:ring-ring/25"
            type="search"
            placeholder="Search downloaded model, version, file, path"
          >
        </label>

        <div
          class="flex h-9 overflow-hidden rounded-md border border-border"
          role="group"
          aria-label="Library type filter"
        >
          <button
            v-for="option in typeFilters"
            :key="option.value"
            class="border-r border-border px-3 text-xs font-semibold last:border-r-0"
            :class="typeFilter === option.value ? 'bg-secondary text-secondary-foreground' : 'bg-background text-muted-foreground hover:bg-accent/10 hover:text-accent'"
            type="button"
            @click="typeFilter = option.value"
          >
            {{ option.label }}
          </button>
        </div>

        <label class="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-background px-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground transition hover:border-secondary/55 hover:text-foreground">
          <input
            v-model="includeNsfw"
            class="h-4 w-4 accent-secondary"
            type="checkbox"
            aria-label="Include NSFW library models"
          >
          NSFW
        </label>
      </div>

      <p
        v-if="error || controlNetLoadingError"
        class="mt-3 inline-flex rounded-sm border border-destructive/45 bg-destructive/16 px-3 py-2 text-xs font-semibold text-destructive"
      >
        {{ error || controlNetLoadingError }}
      </p>
    </section>

    <UiPaginatedCardGrid
      :items-present="pagedModels.length > 0"
      :range-label="visibleRangeLabel"
      :current-page="currentPage"
      :page-count="pageCount"
      previous-label="Previous library page"
      next-label="Next library page"
      @go-to-page="goToPage"
    >
      <UiPreviewCard
        v-for="item in pagedModels"
        :key="item.id"
        tag="button"
        :aria-label="`Open ${item.modelName} preview`"
        :preview-url="previewFor(item)"
        :is-video-preview="isVideoPreview(item)"
        :preview-label="`${item.modelName} preview`"
        :title="item.modelName"
        min-height-class="min-h-[20rem]"
        media-class="h-64"
        @click="openModelPreview(item)"
      >
        <template #placeholder>
          <FileDown class="h-8 w-8 text-primary-foreground/35" />
          <span class="text-xs font-semibold uppercase tracking-[0.16em] text-primary-foreground/68">
            No preview available
          </span>
        </template>

        <template #media-overlay>
          <div class="absolute right-3 top-3 flex flex-wrap justify-end gap-2">
            <span
              v-if="modelHasNsfw(item)"
              class="rounded-sm border border-destructive/50 bg-destructive/90 px-2 py-1 text-[11px] font-semibold text-destructive-foreground shadow-sm backdrop-blur-sm"
            >
              NSFW
            </span>
            <span class="rounded-sm border border-primary-foreground/12 bg-primary/85 px-2 py-1 text-[11px] font-semibold text-primary-foreground/82 shadow-sm backdrop-blur-sm">
              {{ modelTypeLabel(item) }}
            </span>
          </div>
        </template>

        <h2
          class="truncate text-sm font-semibold leading-5 text-card-foreground"
          :title="item.modelName"
        >
          {{ item.modelName }}
        </h2>
      </UiPreviewCard>

      <template #empty>
        No local models match the current filters.
      </template>
    </UiPaginatedCardGrid>

    <AssetPreviewModal
      :open="Boolean(selectedModel)"
      :model-id="selectedModel?.modelId ?? null"
      :version-id="selectedModel?.versionId ?? null"
      :preview-url="selectedModel ? previewFor(selectedModel) : null"
      :is-video="selectedModel ? isVideoPreview(selectedModel) : false"
      :title="selectedModel?.modelName ?? 'Preview'"
      :subtitle="selectedModel?.versionName ?? null"
      :kind-label="selectedModel ? modelTypeLabel(selectedModel) : 'Preview'"
      :model-type="selectedModel?.modelType ?? null"
      :base-model="selectedModel?.baseModel ?? null"
      :file-name="selectedModel?.fileName ?? null"
      :compatibility="selectedModel?.compatibility ?? null"
      :editable-compatibility="selectedModel?.itemKind === 'controlnet'"
      :saving-compatibility="savingCompatibility"
      :compatibility-error="compatibilitySaveError"
      @close="closeModelPreview"
      @save-compatibility="saveControlNetCompatibility"
    />
  </main>
</template>
