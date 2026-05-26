import { safeCreatorUsername } from './assetModelHelpers'
import { scrollAssetsResultsToTop } from './assetRouteHelpers'
import {
  DEFAULT_BASE_MODELS,
  type AssetSearchPreset,
} from './assetViewTypes'
import type { AssetSearchState } from './assetSearchControllerTypes'
import type { ReplaceSearchUrl, SearchRouteHref } from './assetSearchNavigation'

type AssetSearchActionDeps = {
  clearDebounce: () => void
  cursorHistory: string[]
  replaceSearchUrl: ReplaceSearchUrl
  searchRouteHref: SearchRouteHref
}

export function createAssetSearchActions(state: AssetSearchState, deps: AssetSearchActionDeps) {
  const {
    clearDebounce,
    cursorHistory,
    replaceSearchUrl,
    searchRouteHref,
  } = deps

  function filterByCreator(username: string | null | undefined) {
    const nextUsername = safeCreatorUsername(username)
    if (nextUsername) {
      cursorHistory.length = 0
      void replaceSearchUrl(
        '',
        1,
        state.includeNsfw.value,
        '',
        'push',
        nextUsername,
        state.selectedType.value,
        state.selectedSort.value,
        state.selectedPeriod.value,
        state.selectedBaseModels.value,
        state.primaryFileOnly.value,
        '',
        '',
      )
    }
  }

  function creatorFilterHref(username: string | null | undefined) {
    const nextUsername = safeCreatorUsername(username)
    return nextUsername
      ? searchRouteHref(
          '',
          1,
          state.includeNsfw.value,
          '',
          nextUsername,
          state.selectedType.value,
          state.selectedSort.value,
          state.selectedPeriod.value,
          state.selectedBaseModels.value,
          state.primaryFileOnly.value,
          '',
          '',
        )
      : ''
  }

  function clearCreatorFilter() {
    void replaceSearchUrl(
      state.query.value,
      1,
      state.includeNsfw.value,
      '',
      'push',
      '',
      state.selectedType.value,
      state.selectedSort.value,
      state.selectedPeriod.value,
      state.selectedBaseModels.value,
      state.primaryFileOnly.value,
      '',
      '',
    )
  }

  function searchByModelId() {
    clearDebounce()
    cursorHistory.length = 0
    void replaceSearchUrl(
      '',
      1,
      state.includeNsfw.value,
      '',
      'push',
      '',
      state.selectedType.value,
      state.selectedSort.value,
      state.selectedPeriod.value,
      state.selectedBaseModels.value,
      state.primaryFileOnly.value,
      state.modelIdQuery.value,
      '',
    )
  }

  function searchByModelVersionId() {
    clearDebounce()
    cursorHistory.length = 0
    void replaceSearchUrl(
      '',
      1,
      state.includeNsfw.value,
      '',
      'push',
      '',
      state.selectedType.value,
      state.selectedSort.value,
      state.selectedPeriod.value,
      state.selectedBaseModels.value,
      state.primaryFileOnly.value,
      '',
      state.modelVersionIdQuery.value,
    )
  }

  function applySearchPreset(preset: AssetSearchPreset) {
    cursorHistory.length = 0
    void replaceSearchUrl(
      '',
      1,
      preset.nsfw ?? state.includeNsfw.value,
      '',
      'push',
      '',
      preset.type,
      preset.sort,
      preset.period,
      [...DEFAULT_BASE_MODELS],
      preset.primaryFileOnly,
      '',
      '',
    )
  }

  function goToPage(page: number) {
    if (page < 1 || state.loading.value || page === state.currentPage.value) {
      return
    }

    if (state.totalPages.value > 0 && page > state.totalPages.value) {
      return
    }

    if (page > state.currentPage.value) {
      if (state.currentCursor.value) {
        cursorHistory[state.currentPage.value - 1] = state.currentCursor.value
      }
      scrollAssetsResultsToTop()
      void replaceSearchUrl(
        state.activeQuery.value || state.query.value,
        page,
        state.includeNsfw.value,
        page === state.currentPage.value + 1 ? state.nextCursor.value : '',
        'push',
      )
      return
    }

    if (page <= 1) {
      scrollAssetsResultsToTop()
      void replaceSearchUrl(state.activeQuery.value || state.query.value, 1, state.includeNsfw.value, '', 'push')
      return
    }

    const previousCursor = cursorHistory[page - 1]
    scrollAssetsResultsToTop()
    void replaceSearchUrl(
      state.activeQuery.value || state.query.value,
      page,
      state.includeNsfw.value,
      previousCursor ?? '',
      'push',
    )
  }

  return {
    applySearchPreset,
    clearCreatorFilter,
    creatorFilterHref,
    filterByCreator,
    goToPage,
    searchByModelId,
    searchByModelVersionId,
  }
}
