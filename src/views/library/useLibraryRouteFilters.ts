import { ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import {
  parseLibrarySourceFilter,
  typeFilters,
  type LibrarySourceFilter,
  type LibraryTypeFilter,
} from './libraryModelHelpers'

const libraryQueryKeys = ['q', 'type', 'source', 'base', 'nsfw', 'page']

function queryString(value: unknown) {
  const rawValue = Array.isArray(value) ? value[0] : value
  return typeof rawValue === 'string' ? rawValue.trim() : ''
}

function parseBooleanQuery(value: unknown): boolean | null {
  const normalized = queryString(value).toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true
  }

  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false
  }

  return null
}

function parsePageQuery(value: unknown) {
  const page = Number.parseInt(queryString(value), 10)
  return Number.isSafeInteger(page) && page > 0 ? page : 1
}

function parseLibraryTypeFilter(value: unknown): LibraryTypeFilter {
  const normalized = queryString(value)
  return typeFilters.find((option) => option.value === normalized)?.value ?? 'all'
}

export function useLibraryRouteFilters() {
  const route = useRoute()
  const router = useRouter()
  const query = ref(queryString(route.query.q))
  const includeNsfw = ref(parseBooleanQuery(route.query.nsfw) ?? false)
  const typeFilter = ref<LibraryTypeFilter>(parseLibraryTypeFilter(route.query.type))
  const sourceFilter = ref<LibrarySourceFilter>(parseLibrarySourceFilter(route.query.source))
  const baseModelFilter = ref(queryString(route.query.base) || 'all')
  const currentPage = ref(parsePageQuery(route.query.page))
  let syncingLibraryRoute = false

  function routeQuery() {
    const nextQuery: Record<string, string> = {
      nsfw: includeNsfw.value ? '1' : '0',
    }
    const trimmedQuery = query.value.trim()

    if (trimmedQuery) {
      nextQuery.q = trimmedQuery
    }
    if (typeFilter.value !== 'all') {
      nextQuery.type = typeFilter.value
    }
    if (sourceFilter.value !== 'all') {
      nextQuery.source = sourceFilter.value
    }
    if (baseModelFilter.value !== 'all') {
      nextQuery.base = baseModelFilter.value
    }
    if (currentPage.value > 1) {
      nextQuery.page = String(currentPage.value)
    }

    return nextQuery
  }

  function sameRouteQuery(left: Record<string, unknown>, right: Record<string, string>) {
    const leftKeys = Object.keys(left).filter((key) => libraryQueryKeys.includes(key))
    const rightKeys = Object.keys(right)
    if (leftKeys.length !== rightKeys.length) {
      return false
    }

    return rightKeys.every((key) => queryString(left[key]) === right[key])
  }

  function applyRouteQuery(nextQuery: Record<string, unknown>) {
    syncingLibraryRoute = true
    query.value = queryString(nextQuery.q)
    typeFilter.value = parseLibraryTypeFilter(nextQuery.type)
    sourceFilter.value = parseLibrarySourceFilter(nextQuery.source)
    baseModelFilter.value = queryString(nextQuery.base) || 'all'
    includeNsfw.value = parseBooleanQuery(nextQuery.nsfw) ?? includeNsfw.value
    currentPage.value = parsePageQuery(nextQuery.page)
    syncingLibraryRoute = false
  }

  async function syncRouteQuery() {
    if (syncingLibraryRoute) {
      return
    }

    const nextQuery = routeQuery()
    if (sameRouteQuery(route.query, nextQuery)) {
      return
    }

    await router.replace({ name: 'library', query: nextQuery }).catch(() => undefined)
  }

  watch([query, typeFilter, sourceFilter, baseModelFilter, includeNsfw], () => {
    if (!syncingLibraryRoute) {
      currentPage.value = 1
    }
  }, { flush: 'sync' })

  watch(
    () => route.query,
    (value) => {
      applyRouteQuery(value)
    },
    { deep: true },
  )

  watch(
    [query, typeFilter, sourceFilter, baseModelFilter, includeNsfw, currentPage],
    () => {
      void syncRouteQuery()
    },
    { flush: 'post' },
  )

  return {
    query,
    includeNsfw,
    typeFilter,
    sourceFilter,
    baseModelFilter,
    currentPage,
    applyIncludeNsfwDefault(defaultValue: boolean) {
      includeNsfw.value = parseBooleanQuery(route.query.nsfw) ?? defaultValue
    },
  }
}
