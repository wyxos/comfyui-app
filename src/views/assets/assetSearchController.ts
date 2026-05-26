import { nextTick, watch } from 'vue'
import { fetchAppSettings } from '../../composables/useAppSettings'
import {
  firstQueryValue,
  makeSearchKey,
  parseRouteCivitaiId,
  parseRouteBaseModels,
  parseRouteCursor,
  parseRouteNsfw,
  parseRoutePage,
  parseRoutePeriod,
  parseRoutePrimaryFileOnly,
  parseRouteSort,
  parseRouteType,
  queryStringValue,
} from './assetRouteHelpers'
import { createAssetSearchActions } from './assetSearchActions'
import { createAssetSearchNavigation } from './assetSearchNavigation'
import type { AssetSearchState } from './assetSearchControllerTypes'
import {
  PAGE_SIZE,
  type CivitaiModelsResponse,
} from './assetViewTypes'

export function createAssetSearchController(state: AssetSearchState) {
  let debounceId: number | undefined
  let activeController: AbortController | null = null
  let suppressQueryWatch = false
  let lastSearchKey = ''
  let routeSyncVersion = 0
  let defaultIncludeNsfw = false
  const cursorHistory: string[] = []
  const { replaceSearchUrl, searchRouteHref } = createAssetSearchNavigation(
    state,
    () => defaultIncludeNsfw,
  )
  const actions = createAssetSearchActions(state, {
    clearDebounce: () => window.clearTimeout(debounceId),
    cursorHistory,
    replaceSearchUrl,
    searchRouteHref,
  })

  async function syncCivitaiSettingsStatus() {
    try {
      const response = await fetch('/api/settings/civitai', {
        headers: {
          Accept: 'application/json',
        },
      })

      if (!response.ok) {
        state.hasStoredCivitaiApiKey.value = false
        return
      }

      const payload = (await response.json()) as { configured?: boolean }
      state.hasStoredCivitaiApiKey.value = payload.configured === true
    } catch {
      state.hasStoredCivitaiApiKey.value = false
    }
  }

  async function syncAppSettingsDefaults() {
    try {
      defaultIncludeNsfw = (await fetchAppSettings()).includeNsfw
    } catch {
      defaultIncludeNsfw = false
    }
  }

  async function searchModels(searchTerm: string, page = 1, nsfw = state.includeNsfw.value, cursor = '') {
    const term = searchTerm.trim()
    const username = state.activeUsername.value.trim()
    const typeFilter = state.selectedType.value
    const sort = state.selectedSort.value
    const period = state.selectedPeriod.value
    const baseModels = state.selectedBaseModels.value
    const primaryFileOnly = state.primaryFileOnly.value
    const modelId = parseRouteCivitaiId(state.modelIdQuery.value)
    const modelVersionId = parseRouteCivitaiId(state.modelVersionIdQuery.value)
    const normalizedCursor = cursor.trim()
    const searchKey = makeSearchKey(
      term,
      username,
      normalizedCursor,
      nsfw,
      primaryFileOnly,
      typeFilter,
      sort,
      period,
      baseModels,
      modelId,
      modelVersionId,
    )
    if (state.loading.value && searchKey === lastSearchKey) {
      return
    }

    activeController?.abort()

    const controller = new AbortController()
    activeController = controller
    state.loading.value = true
    state.error.value = ''
    state.searched.value = true
    state.activeQuery.value = term
    state.activeModelId.value = modelId
    state.activeModelVersionId.value = modelVersionId
    state.activeUsername.value = username
    state.currentPage.value = page
    state.currentCursor.value = normalizedCursor
    state.nextCursor.value = ''
    lastSearchKey = searchKey

    const params = new URLSearchParams({
      limit: String(PAGE_SIZE),
    })

    if (modelVersionId) {
      params.set('modelVersionId', modelVersionId)
    } else if (modelId) {
      params.set('modelId', modelId)
    } else {
      params.set('nsfw', nsfw ? 'true' : 'false')
      params.set('period', period)

      if (sort) {
        params.set('sort', sort)
      }

      if (term.length >= 2) {
        params.set('query', term)
      }

      if (username) {
        params.set('username', username)
      }

      if (typeFilter) {
        params.set('types', typeFilter)
      }

      if (primaryFileOnly) {
        params.set('primaryFileOnly', 'true')
      }

      for (const baseModel of baseModels) {
        params.append('baseModels', baseModel)
      }

      if (normalizedCursor) {
        params.set('cursor', normalizedCursor)
      } else if (page > 1) {
        params.set('page', String(page))
      }
    }
    try {
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
      const nextItems = (Array.isArray(payload.items) ? payload.items : []).filter(
        (model) => !state.blacklistedModelIdSet.value.has(model.id),
      )

      if (activeController !== controller) {
        return
      }

      state.models.value = nextItems
      state.totalItems.value = payload.metadata?.totalItems ?? 0
      state.totalPages.value = payload.metadata?.totalPages ?? 0
      state.nextCursor.value = payload.metadata?.nextCursor ?? ''
    } catch (caughtError) {
      if (caughtError instanceof DOMException && caughtError.name === 'AbortError') {
        return
      }

      if (activeController === controller) {
        state.error.value = caughtError instanceof Error ? caughtError.message : 'Unable to search Civitai.'
        state.models.value = []
      }
    } finally {
      if (activeController === controller) {
        state.loading.value = false
      }
    }
  }

  function syncFromRoute() {
    const syncVersion = routeSyncVersion + 1
    const routeQuery = queryStringValue(firstQueryValue(state.route.query.q))
    const routePage = parseRoutePage(state.route.query.page)
    const routeCursor = parseRouteCursor(state.route.query.cursor)
    const routeModelId = parseRouteCivitaiId(state.route.query.modelId)
    const routeModelVersionId = parseRouteCivitaiId(
      state.route.query.modelVersionId ?? state.route.query.versionId,
    )
    const hasRouteNsfw = firstQueryValue(state.route.query.nsfw) !== undefined
    const routeNsfw = hasRouteNsfw ? parseRouteNsfw(state.route.query.nsfw) : defaultIncludeNsfw
    const routePrimaryFileOnly = parseRoutePrimaryFileOnly(state.route.query.primaryFileOnly)
    const routeUsername = queryStringValue(firstQueryValue(state.route.query.username)).trim()
    const routeType = parseRouteType(state.route.query.types)
    const routeSort = parseRouteSort(state.route.query.sort)
    const routePeriod = parseRoutePeriod(state.route.query.period)
    const routeBaseModels = parseRouteBaseModels(state.route.query.baseModels)

    routeSyncVersion = syncVersion
    suppressQueryWatch = true
    state.query.value = routeQuery
    state.modelIdQuery.value = routeModelId
    state.modelVersionIdQuery.value = routeModelVersionId
    state.includeNsfw.value = routeNsfw
    state.primaryFileOnly.value = routePrimaryFileOnly
    state.selectedType.value = routeType
    state.selectedSort.value = routeSort
    state.selectedPeriod.value = routePeriod
    state.selectedBaseModels.value = routeBaseModels
    state.activeUsername.value = routeUsername
    window.clearTimeout(debounceId)

    void nextTick().then(() => {
      if (routeSyncVersion === syncVersion) {
        suppressQueryWatch = false
      }
    })

    const searchKey = makeSearchKey(
      routeQuery,
      routeUsername,
      routeCursor,
      routeNsfw,
      routePrimaryFileOnly,
      routeType,
      routeSort,
      routePeriod,
      routeBaseModels,
      routeModelId,
      routeModelVersionId,
    )
    if (searchKey === lastSearchKey && state.searched.value) {
      return
    }

    void searchModels(routeQuery, routePage, routeNsfw, routeCursor)
  }

  function setupWatchers() {
    watch(state.query, (value) => {
      if (suppressQueryWatch) {
        return
      }

      window.clearTimeout(debounceId)
      debounceId = window.setTimeout(() => {
        void replaceSearchUrl(
          value,
          1,
          state.includeNsfw.value,
          '',
          'replace',
          '',
          state.selectedType.value,
          state.selectedSort.value,
          state.selectedPeriod.value,
          state.selectedBaseModels.value,
          state.primaryFileOnly.value,
          '',
          '',
        )
      }, 450)
    })

    watch([state.modelIdQuery, state.modelVersionIdQuery], ([modelId, modelVersionId]) => {
      if (suppressQueryWatch) {
        return
      }

      window.clearTimeout(debounceId)
      cursorHistory.length = 0
      debounceId = window.setTimeout(() => {
        void replaceSearchUrl(
          '',
          1,
          state.includeNsfw.value,
          '',
          'replace',
          '',
          state.selectedType.value,
          state.selectedSort.value,
          state.selectedPeriod.value,
          state.selectedBaseModels.value,
          state.primaryFileOnly.value,
          modelId,
          modelVersionId,
        )
      }, 350)
    })

    watch(state.includeNsfw, (value) => {
      if (!suppressQueryWatch) {
        window.clearTimeout(debounceId)
        void replaceSearchUrl(state.query.value, 1, value, '', 'replace', state.activeUsername.value)
      }
    })

    watch(state.selectedType, (value) => {
      if (!suppressQueryWatch) {
        window.clearTimeout(debounceId)
        cursorHistory.length = 0
        void replaceSearchUrl(state.query.value, 1, state.includeNsfw.value, '', 'replace', state.activeUsername.value, value)
      }
    })

    watch([state.selectedSort, state.selectedPeriod], ([sort, period]) => {
      if (!suppressQueryWatch) {
        window.clearTimeout(debounceId)
        cursorHistory.length = 0
        void replaceSearchUrl(state.query.value, 1, state.includeNsfw.value, '', 'replace', state.activeUsername.value, state.selectedType.value, sort, period)
      }
    })

    watch(
      state.selectedBaseModels,
      (baseModels) => {
        if (!suppressQueryWatch) {
          window.clearTimeout(debounceId)
          cursorHistory.length = 0
          void replaceSearchUrl(state.query.value, 1, state.includeNsfw.value, '', 'replace', state.activeUsername.value, state.selectedType.value, state.selectedSort.value, state.selectedPeriod.value, baseModels)
        }
      },
      { deep: true },
    )

    watch(
      () => [
        state.route.query.q,
        state.route.query.page,
        state.route.query.nsfw,
        state.route.query.primaryFileOnly,
        state.route.query.cursor,
        state.route.query.modelId,
        state.route.query.modelVersionId,
        state.route.query.versionId,
        state.route.query.username,
        state.route.query.types,
        state.route.query.sort,
        state.route.query.period,
        state.route.query.baseModels,
      ],
      syncFromRoute,
    )
  }

  function mount() {
    void syncCivitaiSettingsStatus()
    void syncAppSettingsDefaults().then(syncFromRoute)
  }

  function cleanup() {
    window.clearTimeout(debounceId)
    activeController?.abort()
  }

  setupWatchers()

  return {
    cleanup,
    mount,
    ...actions,
  }
}
