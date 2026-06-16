import type { ComputedRef, Ref } from 'vue'
import type { RouteLocationNormalizedLoaded, Router } from 'vue-router'
import type {
  BaseModelFilter,
  CivitaiModel,
  ModelPeriod,
  ModelSort,
  ModelTypeFilter,
} from './assetViewTypes'

export type AssetSearchState = {
  activeQuery: Ref<string>
  activeModelId: Ref<string>
  activeModelVersionId: Ref<string>
  activeTag: Ref<string>
  activeUsername: Ref<string>
  blacklistedModelIdSet: ComputedRef<Set<number>>
  currentCursor: Ref<string>
  currentPage: Ref<number>
  error: Ref<string>
  hasStoredCivitaiApiKey: Ref<boolean>
  includeNsfw: Ref<boolean>
  blurNsfwModels: Ref<boolean>
  blurNsfwMediaLevel: Ref<4 | 8 | 16 | 32 | null>
  loading: Ref<boolean>
  modelIdQuery: Ref<string>
  modelVersionIdQuery: Ref<string>
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
  tagQuery: Ref<string>
  totalItems: Ref<number>
  totalPages: Ref<number>
}
