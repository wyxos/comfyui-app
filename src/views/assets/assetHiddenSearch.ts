import type { AssetSearchState } from './assetSearchControllerTypes'
import {
  PAGE_SIZE,
  type CivitaiModel,
  type CivitaiModelsResponse,
} from './assetViewTypes'

type HiddenAssetSearchRuntime = {
  getActiveController: () => AbortController | null
  getLastSearchKey: () => string
  setActiveController: (controller: AbortController | null) => void
  setLastSearchKey: (key: string) => void
}

function sortHiddenModelsByStoredOrder(items: CivitaiModel[], hiddenIds: number[]) {
  const modelById = new Map(items.map((model) => [model.id, model]))
  return hiddenIds.flatMap((id) => {
    const model = modelById.get(id)
    return model ? [model] : []
  })
}

function hiddenSearchKey(page: number, hiddenIds: number[]) {
  return [
    'hidden',
    page,
    hiddenIds.join(','),
  ].join('::')
}

function hiddenIdChunks(hiddenIds: number[]) {
  const chunks: number[][] = []
  for (let index = 0; index < hiddenIds.length; index += PAGE_SIZE) {
    chunks.push(hiddenIds.slice(index, index + PAGE_SIZE))
  }
  return chunks
}

async function fetchHiddenModelChunk(hiddenIds: number[], controller: AbortController) {
  const params = new URLSearchParams({
    ids: hiddenIds.join(','),
    limit: String(hiddenIds.length),
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
  return sortHiddenModelsByStoredOrder(
    Array.isArray(payload.items) ? payload.items : [],
    hiddenIds,
  )
}

export function createHiddenAssetSearch(state: AssetSearchState, runtime: HiddenAssetSearchRuntime) {
  return async function searchHiddenModels(page = 1) {
    const hiddenIds = [...state.hiddenModelIds.value]
    const totalHiddenItems = hiddenIds.length
    const totalHiddenPages = totalHiddenItems > 0 ? Math.ceil(totalHiddenItems / PAGE_SIZE) : 0
    const requestedHiddenPage = totalHiddenPages > 0
      ? Math.min(Math.max(page, 1), totalHiddenPages)
      : 1
    const searchKey = hiddenSearchKey(requestedHiddenPage, hiddenIds)

    if (searchKey === runtime.getLastSearchKey() && state.searched.value) {
      return
    }

    runtime.getActiveController()?.abort()
    state.error.value = ''
    state.searched.value = true
    state.activeQuery.value = ''
    state.activeModelId.value = ''
    state.activeModelVersionId.value = ''
    state.activeTag.value = ''
    state.activeUsername.value = ''
    state.currentPage.value = requestedHiddenPage
    state.currentCursor.value = ''
    state.nextCursor.value = ''
    state.totalItems.value = totalHiddenItems
    state.totalPages.value = totalHiddenPages
    runtime.setLastSearchKey(searchKey)

    if (!totalHiddenItems) {
      state.loading.value = false
      state.models.value = []
      return
    }

    const controller = new AbortController()
    runtime.setActiveController(controller)
    state.loading.value = true

    try {
      const loadableHiddenModels: CivitaiModel[] = []
      for (const chunkIds of hiddenIdChunks(hiddenIds)) {
        loadableHiddenModels.push(...await fetchHiddenModelChunk(chunkIds, controller))
      }

      if (runtime.getActiveController() !== controller) {
        return
      }

      const totalLoadableItems = loadableHiddenModels.length
      const totalLoadablePages = totalLoadableItems > 0
        ? Math.ceil(totalLoadableItems / PAGE_SIZE)
        : 0
      const currentLoadablePage = totalLoadablePages > 0
        ? Math.min(requestedHiddenPage, totalLoadablePages)
        : 1
      const pageStartIndex = (currentLoadablePage - 1) * PAGE_SIZE

      state.currentPage.value = currentLoadablePage
      state.models.value = loadableHiddenModels.slice(pageStartIndex, pageStartIndex + PAGE_SIZE)
      state.totalItems.value = totalLoadableItems
      state.totalPages.value = totalLoadablePages
      state.nextCursor.value = ''
    } catch (caughtError) {
      if (caughtError instanceof DOMException && caughtError.name === 'AbortError') {
        return
      }

      if (runtime.getActiveController() === controller) {
        state.error.value = caughtError instanceof Error ? caughtError.message : 'Unable to load hidden Civitai models.'
        state.models.value = []
      }
    } finally {
      if (runtime.getActiveController() === controller) {
        state.loading.value = false
      }
    }
  }
}
