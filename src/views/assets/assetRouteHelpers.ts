import type { LocationQuery, LocationQueryRaw } from 'vue-router'
import {
  ALL_BASE_MODELS_ROUTE_VALUE,
  BASE_MODEL_OPTIONS,
  DEFAULT_BASE_MODELS,
  DEFAULT_PERIOD,
  DEFAULT_SORT,
  MODEL_PERIOD_OPTIONS,
  MODEL_SORT_OPTIONS,
  MODEL_TYPE_OPTIONS,
  type BaseModelFilter,
  type ModelPeriod,
  type ModelSort,
  type ModelTypeFilter,
} from './assetViewTypes'

type AssetSearchRouteQueryOptions = {
  searchTerm: string
  page?: number
  nsfw?: boolean
  defaultNsfw?: boolean
  cursor?: string
  modelId?: string
  modelVersionId?: string
  tag?: string
  username?: string
  typeFilter?: ModelTypeFilter
  sort?: ModelSort
  period?: ModelPeriod
  baseModels?: readonly string[]
  primaryFileOnly?: boolean
}

export function firstQueryValue(value: unknown) {
  return Array.isArray(value) ? value[0] : value
}

export function queryStringValue(value: unknown) {
  return typeof value === 'string' ? value : ''
}

export function parseRoutePage(value: unknown) {
  const parsed = Number.parseInt(queryStringValue(firstQueryValue(value)), 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1
}

export function parseRouteCursor(value: unknown) {
  return queryStringValue(firstQueryValue(value)).trim()
}

export function parseRouteTag(value: unknown) {
  return queryStringValue(firstQueryValue(value)).trim()
}

export function parseRouteCivitaiId(value: unknown) {
  const normalized = queryStringValue(firstQueryValue(value)).trim()
  if (!/^\d+$/.test(normalized)) {
    return ''
  }

  const parsed = Number.parseInt(normalized, 10)
  return Number.isSafeInteger(parsed) && parsed > 0 ? String(parsed) : ''
}

export function parseRouteNsfw(value: unknown) {
  return ['1', 'true', 'yes', 'on'].includes(
    queryStringValue(firstQueryValue(value)).trim().toLowerCase(),
  )
}

export function parseRoutePrimaryFileOnly(value: unknown) {
  return ['1', 'true', 'yes', 'on'].includes(
    queryStringValue(firstQueryValue(value)).trim().toLowerCase(),
  )
}

export function parseRouteType(value: unknown): ModelTypeFilter {
  const routeType = queryStringValue(firstQueryValue(value)).trim()
  const allowedOption = MODEL_TYPE_OPTIONS.find((option) => option.value === routeType)
  return allowedOption?.value ?? ''
}

export function parseRouteSort(value: unknown): ModelSort {
  const routeSort = queryStringValue(firstQueryValue(value)).trim()
  const allowedOption = MODEL_SORT_OPTIONS.find((option) => option.value === routeSort)
  return allowedOption?.value ?? DEFAULT_SORT
}

export function parseRoutePeriod(value: unknown): ModelPeriod {
  const routePeriod = queryStringValue(firstQueryValue(value)).trim()
  const allowedOption = MODEL_PERIOD_OPTIONS.find((option) => option.value === routePeriod)
  return allowedOption?.value ?? DEFAULT_PERIOD
}

export function queryStringValues(value: unknown) {
  const values = Array.isArray(value) ? value : [value]
  return values.flatMap((entry) =>
    typeof entry === 'string'
      ? entry
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean)
      : [],
  )
}

export function normalizeBaseModels(values: unknown[]): BaseModelFilter[] {
  const requestedValues = new Set(values.filter((value): value is string => typeof value === 'string'))
  return BASE_MODEL_OPTIONS.filter((option) => requestedValues.has(option.value)).map(
    (option) => option.value,
  )
}

export function parseRouteBaseModels(value: unknown): BaseModelFilter[] {
  const values = queryStringValues(value)
  if (!values.length) {
    return [...DEFAULT_BASE_MODELS]
  }

  if (values.some((entry) => entry.toLowerCase() === ALL_BASE_MODELS_ROUTE_VALUE)) {
    return []
  }

  const normalizedValues = normalizeBaseModels(values)
  return normalizedValues.length ? normalizedValues : [...DEFAULT_BASE_MODELS]
}

export function areSameBaseModels(left: readonly string[], right: readonly string[]) {
  if (left.length !== right.length) {
    return false
  }

  const rightSet = new Set(right)
  return left.every((value) => rightSet.has(value))
}

export function buildAssetSearchRouteQuery(
  currentQuery: LocationQuery,
  {
    searchTerm,
    page = 1,
    nsfw = false,
    defaultNsfw = false,
    cursor = '',
    modelId = '',
    modelVersionId = '',
    tag = '',
    username = '',
    typeFilter = '',
    sort = DEFAULT_SORT,
    period = DEFAULT_PERIOD,
    baseModels = DEFAULT_BASE_MODELS,
    primaryFileOnly = false,
  }: AssetSearchRouteQueryOptions,
): LocationQueryRaw {
  const term = searchTerm.trim()
  const normalizedModelId = parseRouteCivitaiId(modelId)
  const normalizedModelVersionId = parseRouteCivitaiId(modelVersionId)
  const normalizedTag = parseRouteTag(tag)
  const normalizedUsername = username.trim()
  const normalizedType = parseRouteType(typeFilter)
  const normalizedSort = parseRouteSort(sort)
  const normalizedPeriod = parseRoutePeriod(period)
  const normalizedBaseModels = normalizeBaseModels(
    Array.isArray(baseModels) ? [...baseModels] : [...DEFAULT_BASE_MODELS],
  )
  const shouldPersistSearch =
    term.length >= 2 ||
    Boolean(normalizedUsername || normalizedType) ||
    nsfw !== defaultNsfw ||
    page > 1 ||
    Boolean(cursor) ||
    Boolean(normalizedModelId || normalizedModelVersionId) ||
    Boolean(normalizedTag) ||
    normalizedSort !== DEFAULT_SORT ||
    normalizedPeriod !== DEFAULT_PERIOD ||
    !areSameBaseModels(normalizedBaseModels, DEFAULT_BASE_MODELS) ||
    primaryFileOnly
  const nextQuery = { ...currentQuery } as LocationQueryRaw

  delete nextQuery.q
  delete nextQuery.page
  delete nextQuery.nsfw
  delete nextQuery.primaryFileOnly
  delete nextQuery.cursor
  delete nextQuery.modelId
  delete nextQuery.modelVersionId
  delete nextQuery.versionId
  delete nextQuery.tag
  delete nextQuery.username
  delete nextQuery.types
  delete nextQuery.sort
  delete nextQuery.period
  delete nextQuery.baseModels

  if (!shouldPersistSearch) {
    return nextQuery
  }

  if (term.length >= 2) {
    nextQuery.q = term
  }

  if (normalizedModelId) {
    nextQuery.modelId = normalizedModelId
  }

  if (normalizedModelVersionId) {
    nextQuery.modelVersionId = normalizedModelVersionId
  }

  if (normalizedTag) {
    nextQuery.tag = normalizedTag
  }

  if (normalizedUsername) {
    nextQuery.username = normalizedUsername
  }

  if (normalizedType) {
    nextQuery.types = normalizedType
  }

  if (normalizedSort !== DEFAULT_SORT) {
    nextQuery.sort = normalizedSort
  }

  if (normalizedPeriod !== DEFAULT_PERIOD) {
    nextQuery.period = normalizedPeriod
  }

  if (!areSameBaseModels(normalizedBaseModels, DEFAULT_BASE_MODELS)) {
    nextQuery.baseModels = normalizedBaseModels.length ? normalizedBaseModels : ALL_BASE_MODELS_ROUTE_VALUE
  }

  if (page > 1) {
    nextQuery.page = String(page)
  }

  if (cursor) {
    nextQuery.cursor = cursor
  }

  if (nsfw !== defaultNsfw) {
    nextQuery.nsfw = nsfw ? '1' : '0'
  }

  if (primaryFileOnly) {
    nextQuery.primaryFileOnly = '1'
  }

  return nextQuery
}

export function normalizeBlacklistedModelIds(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return []
  }

  return Array.from(
    new Set(
      value
        .map((entry) => Number(entry))
        .filter((entry) => Number.isSafeInteger(entry) && entry > 0),
    ),
  )
}

export function makeSearchKey(
  searchTerm: string,
  username: string,
  cursor: string,
  nsfw: boolean,
  primaryFileOnly: boolean,
  typeFilter: ModelTypeFilter,
  sort: ModelSort,
  period: ModelPeriod,
  baseModels: readonly string[] = DEFAULT_BASE_MODELS,
  modelId = '',
  modelVersionId = '',
  tag = '',
) {
  const normalizedBaseModels = Array.isArray(baseModels) ? baseModels : DEFAULT_BASE_MODELS

  return [
    searchTerm.trim().toLowerCase(),
    username.trim().toLowerCase(),
    typeFilter,
    sort,
    period,
    normalizedBaseModels.join('|'),
    parseRouteCivitaiId(modelId),
    parseRouteCivitaiId(modelVersionId),
    parseRouteTag(tag).toLowerCase(),
    cursor,
    nsfw ? 'nsfw' : 'safe',
    primaryFileOnly ? 'primary-file' : 'all-files',
  ].join('::')
}

export function scrollAssetsResultsToTop() {
  if (typeof document === 'undefined') {
    return
  }

  const scrollContainer = document.querySelector<HTMLElement>('[data-assets-results-scroll]')
  scrollContainer?.scrollTo({ top: 0, left: 0 })
}
