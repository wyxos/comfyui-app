import { computed, onBeforeUnmount, ref } from 'vue'
import type {
  CivitaiModel,
  CivitaiModelsResponse,
} from '../../components/asset-preview/assetPreviewTypes'
import { normalizeBlacklistedModelIds } from '../assets/assetRouteHelpers'
import { BLACKLIST_STORAGE_KEY } from '../assets/assetViewTypes'

const HIDDEN_MODEL_CHUNK_SIZE = 100
const HIDDEN_MODEL_IDS_MAX_QUERY_LENGTH = 500

function sortModelsByStoredOrder(items: CivitaiModel[], hiddenIds: number[]) {
  const modelById = new Map(items.map((model) => [model.id, model]))
  return hiddenIds.flatMap((id) => {
    const model = modelById.get(id)
    return model ? [model] : []
  })
}

function hiddenIdChunks(hiddenIds: number[]) {
  const chunks: number[][] = []
  let currentChunk: number[] = []
  let currentIdsLength = 0

  for (const id of hiddenIds) {
    const idText = String(id)
    const nextIdsLength = currentChunk.length ? currentIdsLength + 1 + idText.length : idText.length

    if (
      currentChunk.length &&
      (currentChunk.length >= HIDDEN_MODEL_CHUNK_SIZE || nextIdsLength > HIDDEN_MODEL_IDS_MAX_QUERY_LENGTH)
    ) {
      chunks.push(currentChunk)
      currentChunk = []
      currentIdsLength = 0
    }

    currentChunk.push(id)
    currentIdsLength = currentChunk.length === 1 ? idText.length : currentIdsLength + 1 + idText.length
  }

  if (currentChunk.length) {
    chunks.push(currentChunk)
  }

  return chunks
}

async function fetchHiddenModelChunk(hiddenIds: number[], controller: AbortController) {
  const params = new URLSearchParams({
    ids: hiddenIds.join(','),
    limit: String(hiddenIds.length),
    nsfw: 'true',
  })
  const response = await fetch(`/api/civitai/models?${params.toString()}`, {
    headers: {
      Accept: 'application/json',
    },
    signal: controller.signal,
  })

  if (!response.ok) {
    throw new Error(`Civitai returned ${response.status}`)
  }

  const payload = (await response.json()) as CivitaiModelsResponse
  return sortModelsByStoredOrder(
    Array.isArray(payload.items) ? payload.items : [],
    hiddenIds,
  )
}

export function useHiddenLibraryModels() {
  const hiddenModelIds = ref<number[]>([])
  const hiddenModels = ref<CivitaiModel[]>([])
  const hiddenLoading = ref(false)
  const hiddenError = ref('')
  const hiddenModelIdSet = computed(() => new Set(hiddenModelIds.value))
  let activeController: AbortController | null = null

  function loadHiddenModelIds() {
    try {
      hiddenModelIds.value = normalizeBlacklistedModelIds(
        JSON.parse(window.localStorage.getItem(BLACKLIST_STORAGE_KEY) ?? '[]'),
      )
    } catch {
      hiddenModelIds.value = []
    }
  }

  function persistHiddenModelIds() {
    window.localStorage.setItem(BLACKLIST_STORAGE_KEY, JSON.stringify(hiddenModelIds.value))
  }

  function restoreHiddenModelId(modelId: number | null | undefined) {
    if (!modelId || !hiddenModelIdSet.value.has(modelId)) {
      return
    }

    hiddenModelIds.value = hiddenModelIds.value.filter((id) => id !== modelId)
    hiddenModels.value = hiddenModels.value.filter((model) => model.id !== modelId)
    persistHiddenModelIds()
  }

  async function refreshHiddenModels() {
    activeController?.abort()
    loadHiddenModelIds()
    hiddenError.value = ''
    hiddenModels.value = []

    if (!hiddenModelIds.value.length) {
      hiddenLoading.value = false
      return
    }

    const controller = new AbortController()
    activeController = controller
    hiddenLoading.value = true

    try {
      const loadableModels: CivitaiModel[] = []
      for (const chunkIds of hiddenIdChunks(hiddenModelIds.value)) {
        loadableModels.push(...await fetchHiddenModelChunk(chunkIds, controller))
      }

      if (activeController === controller) {
        hiddenModels.value = loadableModels
      }
    } catch (caughtError) {
      if (caughtError instanceof DOMException && caughtError.name === 'AbortError') {
        return
      }

      if (activeController === controller) {
        hiddenError.value = caughtError instanceof Error ? caughtError.message : 'Could not load hidden models.'
      }
    } finally {
      if (activeController === controller) {
        hiddenLoading.value = false
      }
    }
  }

  onBeforeUnmount(() => {
    activeController?.abort()
  })

  return {
    hiddenError,
    hiddenLoading,
    hiddenModelIds,
    hiddenModelIdSet,
    hiddenModels,
    refreshHiddenModels,
    restoreHiddenModelId,
  }
}
