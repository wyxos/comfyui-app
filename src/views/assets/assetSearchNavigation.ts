import {
  buildAssetSearchRouteQuery,
} from './assetRouteHelpers'
import type {
  BaseModelFilter,
  ModelPeriod,
  ModelSort,
  ModelTypeFilter,
} from './assetViewTypes'
import type { AssetSearchState } from './assetSearchControllerTypes'

export type AssetSearchRouteMode = 'push' | 'replace'

export type ReplaceSearchUrl = (
  searchTerm: string,
  page?: number,
  nsfw?: boolean,
  cursor?: string,
  mode?: AssetSearchRouteMode,
  username?: string,
  typeFilter?: ModelTypeFilter,
  sort?: ModelSort,
  period?: ModelPeriod,
  baseModels?: BaseModelFilter[],
  primaryFileOnly?: boolean,
  modelId?: string,
  modelVersionId?: string,
  tag?: string,
) => Promise<void>

export type SearchRouteHref = (
  searchTerm: string,
  page?: number,
  nsfw?: boolean,
  cursor?: string,
  username?: string,
  typeFilter?: ModelTypeFilter,
  sort?: ModelSort,
  period?: ModelPeriod,
  baseModels?: BaseModelFilter[],
  primaryFileOnly?: boolean,
  modelId?: string,
  modelVersionId?: string,
  tag?: string,
) => string

export function createAssetSearchNavigation(
  state: AssetSearchState,
  getDefaultIncludeNsfw: () => boolean,
) {
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
    modelId = state.modelIdQuery.value,
    modelVersionId = state.modelVersionIdQuery.value,
    tag = state.tagQuery.value,
  ) {
    return buildAssetSearchRouteQuery(state.route.query, {
      searchTerm,
      page,
      nsfw,
      defaultNsfw: getDefaultIncludeNsfw(),
      cursor,
      modelId,
      modelVersionId,
      tag,
      username,
      typeFilter,
      sort,
      period,
      baseModels,
      primaryFileOnly,
    })
  }

  const replaceSearchUrl: ReplaceSearchUrl = async (
    searchTerm,
    page = 1,
    nsfw = state.includeNsfw.value,
    cursor = '',
    mode = 'replace',
    username = state.activeUsername.value,
    typeFilter = state.selectedType.value,
    sort = state.selectedSort.value,
    period = state.selectedPeriod.value,
    baseModels = state.selectedBaseModels.value,
    primaryFileOnly = state.primaryFileOnly.value,
    modelId = state.modelIdQuery.value,
    modelVersionId = state.modelVersionIdQuery.value,
    tag = state.tagQuery.value,
  ) => {
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
        modelId,
        modelVersionId,
        tag,
      ),
    })
  }

  const searchRouteHref: SearchRouteHref = (
    searchTerm,
    page = 1,
    nsfw = state.includeNsfw.value,
    cursor = '',
    username = state.activeUsername.value,
    typeFilter = state.selectedType.value,
    sort = state.selectedSort.value,
    period = state.selectedPeriod.value,
    baseModels = state.selectedBaseModels.value,
    primaryFileOnly = state.primaryFileOnly.value,
    modelId = state.modelIdQuery.value,
    modelVersionId = state.modelVersionIdQuery.value,
    tag = state.tagQuery.value,
  ) => state.router.resolve({
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
      modelId,
      modelVersionId,
      tag,
    ),
  }).href

  return {
    replaceSearchUrl,
    searchRouteHref,
  }
}
