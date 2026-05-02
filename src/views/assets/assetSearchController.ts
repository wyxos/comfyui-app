import { nextTick, watch, type ComputedRef, type Ref } from 'vue'
import type { RouteLocationNormalizedLoaded, Router } from 'vue-router'
import { fetchAppSettings } from '../../composables/useAppSettings'
import { safeCreatorUsername } from './assetModelHelpers'
import {
  buildAssetSearchRouteQuery,
  firstQueryValue,
  makeSearchKey,
  parseRouteBaseModels,
  parseRouteCursor,
  parseRouteNsfw,
  parseRoutePage,
  parseRoutePeriod,
  parseRoutePrimaryFileOnly,
  parseRouteSort,
  parseRouteType,
  queryStringValue,
  scrollAssetsResultsToTop,
} from './assetRouteHelpers'
import {
  DEFAULT_BASE_MODELS,
  PAGE_SIZE,
  type AssetSearchPreset,
  type BaseModelFilter,
  type CivitaiModel,
  type CivitaiModelsResponse,
  type ModelPeriod,
  type ModelSort,
  type ModelTypeFilter,
} from './assetViewTypes'

type AssetSearchState = {
  activeQuery: Ref<string>
  activeUsername: Ref<string>
  blacklistedModelIdSet: ComputedRef<Set<number>>
  currentCursor: Ref<string>
  currentPage: Ref<number>
  error: Ref<string>
  hasStoredCivitaiApiKey: Ref<boolean>
  includeNsfw: Ref<boolean>
  loading: Ref<boolean>
  models: Ref<CivitaiModel[]>
  nextCursor: Ref<string>
  primaryFileOnly: Ref<boolean>
  query: Ref<string>
  route: RouteLocationNormalizedLoaded
  router: Router
  searched: Ref<boolean>
  selectedBaseModels: Ref<BaseModelFilter[]>
  selectedPeriod: Ref<ModelPeriod>
  selectedSort: Ref<ModelSort>
  selectedType: Ref<ModelTypeFilter>
  totalItems: Ref<number>
  totalPages: Ref<number>
}

export function createAssetSearchController(state: AssetSearchState) {
  let debounceId: number | undefined
  let activeController: AbortController | null = null
  let suppressQueryWatch = false
  let lastSearchKey = ''
  let routeSyncVersion = 0
  let defaultIncludeNsfw = false
  const cursorHistory: string[] = []

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

  function buildSearchRouteQuery(
    searchTerm: string,
    page = 1,
    nsfw = state.includeNsfw.value,
    cursor = '',
    username = state.activeUsername.value,
    typeFilter = state.selectedType.value,
    sort = state.selectedSort.value,
    period = state.selectedPeriod.value,
    baseModels = state.selectedBaseModels.value,
    primaryFileOnly = state.primaryFileOnly.value,
  ) {
    return buildAssetSearchRouteQuery(state.route.query, {
      searchTerm,
      page,
      nsfw,
      defaultNsfw: defaultIncludeNsfw,
      cursor,
      username,
      typeFilter,
      sort,
      period,
      baseModels,
      primaryFileOnly,
    })
  }

  async function replaceSearchUrl(
    searchTerm: string,
    page = 1,
    nsfw = state.includeNsfw.value,
    cursor = '',
    mode: 'push' | 'replace' = 'replace',
    username = state.activeUsername.value,
    typeFilter = state.selectedType.value,
    sort = state.selectedSort.value,
    period = state.selectedPeriod.value,
    baseModels = state.selectedBaseModels.value,
    primaryFileOnly = state.primaryFileOnly.value,
  ) {
    await state.router[mode]({
      query: buildSearchRouteQuery(
        searchTerm,
        page,
        nsfw,
        cursor,
        username,
        typeFilter,
        sort,
        period,
        baseModels,
        primaryFileOnly,
      ),
    })
  }

  function searchRouteHref(
    searchTerm: string,
    page = 1,
    nsfw = state.includeNsfw.value,
    cursor = '',
    username = state.activeUsername.value,
    typeFilter = state.selectedType.value,
    sort = state.selectedSort.value,
    period = state.selectedPeriod.value,
    baseModels = state.selectedBaseModels.value,
    primaryFileOnly = state.primaryFileOnly.value,
  ) {
    return state.router.resolve({
      path: '/assets',
      query: buildSearchRouteQuery(
        searchTerm,
        page,
        nsfw,
        cursor,
        username,
        typeFilter,
        sort,
        period,
        baseModels,
        primaryFileOnly,
      ),
    }).href
  }

  async function searchModels(searchTerm: string, page = 1, nsfw = state.includeNsfw.value, cursor = '') {
    const term = searchTerm.trim()
    const username = state.activeUsername.value.trim()
    const typeFilter = state.selectedType.value
    const sort = state.selectedSort.value
    const period = state.selectedPeriod.value
    const baseModels = state.selectedBaseModels.value
    const primaryFileOnly = state.primaryFileOnly.value
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
    state.activeUsername.value = username
    state.currentPage.value = page
    state.currentCursor.value = normalizedCursor
    state.nextCursor.value = ''
    lastSearchKey = searchKey

    const params = new URLSearchParams({
      limit: String(PAGE_SIZE),
      nsfw: nsfw ? 'true' : 'false',
      period,
    })

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
        void replaceSearchUrl(value, 1, state.includeNsfw.value, '', 'replace', '')
      }, 450)
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
        state.route.query.username,
        state.route.query.types,
        state.route.query.sort,
        state.route.query.period,
        state.route.query.baseModels,
      ],
      syncFromRoute,
    )
  }

  function filterByCreator(username: string | null | undefined) {
    const nextUsername = safeCreatorUsername(username)
    if (nextUsername) {
      cursorHistory.length = 0
      void replaceSearchUrl('', 1, state.includeNsfw.value, '', 'push', nextUsername)
    }
  }

  function creatorFilterHref(username: string | null | undefined) {
    const nextUsername = safeCreatorUsername(username)
    return nextUsername ? searchRouteHref('', 1, state.includeNsfw.value, '', nextUsername) : ''
  }

  function clearCreatorFilter() {
    void replaceSearchUrl(state.query.value, 1, state.includeNsfw.value, '', 'push', '')
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
    applySearchPreset,
    cleanup,
    clearCreatorFilter,
    creatorFilterHref,
    filterByCreator,
    goToPage,
    mount,
  }
}
