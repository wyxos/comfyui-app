// @vitest-environment jsdom

import { computed, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'

import { createHiddenAssetSearch } from '../../src/views/assets/assetHiddenSearch'
import type { AssetSearchState } from '../../src/views/assets/assetSearchControllerTypes'
import {
  PAGE_SIZE,
  type CivitaiModel,
} from '../../src/views/assets/assetViewTypes'

function modelForId(id: number): CivitaiModel {
  return {
    id,
    name: `Hidden model ${id}`,
    type: 'Checkpoint',
    creator: { username: `creator-${id}` },
    modelVersions: [],
  }
}

function makeState(hiddenIds: number[]): AssetSearchState {
  return {
    activeQuery: ref('stale query'),
    activeModelId: ref('stale-model'),
    activeModelVersionId: ref('stale-version'),
    activeTag: ref('stale-tag'),
    activeUsername: ref('stale-user'),
    blacklistedModelIdSet: computed(() => new Set(hiddenIds)),
    currentCursor: ref('cursor'),
    currentPage: ref(1),
    error: ref(''),
    hasStoredCivitaiApiKey: ref(false),
    hiddenModelIds: ref(hiddenIds),
    includeNsfw: ref(false),
    loading: ref(false),
    modelIdQuery: ref(''),
    modelVersionIdQuery: ref(''),
    models: ref<CivitaiModel[]>([]),
    nextCursor: ref('next'),
    primaryFileOnly: ref(true),
    query: ref(''),
    route: {} as AssetSearchState['route'],
    router: {} as AssetSearchState['router'],
    searched: ref(false),
    selectedBaseModels: ref([]),
    selectedPeriod: ref('AllTime'),
    selectedSort: ref(''),
    selectedType: ref(''),
    showHiddenOnly: computed(() => true),
    tagQuery: ref(''),
    totalItems: ref(0),
    totalPages: ref(0),
  }
}

function makeRuntime() {
  let activeController: AbortController | null = null
  let lastSearchKey = ''

  return {
    getActiveController: () => activeController,
    getLastSearchKey: () => lastSearchKey,
    setActiveController: (controller: AbortController | null) => {
      activeController = controller
    },
    setLastSearchKey: (key: string) => {
      lastSearchKey = key
    },
  }
}

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    status: 200,
  })
}

function requestedIds(input: RequestInfo | URL) {
  const url = new URL(String(input), 'http://companion.test')
  return (url.searchParams.get('ids') ?? '')
    .split(',')
    .map((value) => Number(value))
    .filter((id) => Number.isFinite(id))
}

describe('createHiddenAssetSearch', () => {
  it('fills hidden pages with the first 24 loadable models when stored IDs have holes', async () => {
    const hiddenIds = Array.from({ length: 30 }, (_unused, index) => index + 1)
    const missingIds = new Set([5, 9, 13, 17])
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const items = requestedIds(input)
        .filter((id) => !missingIds.has(id))
        .map(modelForId)

      return jsonResponse({ items })
    })
    vi.stubGlobal('fetch', fetchMock)

    const state = makeState(hiddenIds)
    const searchHiddenModels = createHiddenAssetSearch(state, makeRuntime())

    await searchHiddenModels(1)

    const expectedFirstPageIds = hiddenIds
      .filter((id) => !missingIds.has(id))
      .slice(0, PAGE_SIZE)

    expect(state.models.value.map((model) => model.id)).toEqual(expectedFirstPageIds)
    expect(state.models.value).toHaveLength(PAGE_SIZE)
    expect(state.totalItems.value).toBe(26)
    expect(state.totalPages.value).toBe(2)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(requestedIds(fetchMock.mock.calls[0][0])).toEqual(hiddenIds.slice(0, PAGE_SIZE))
    expect(requestedIds(fetchMock.mock.calls[1][0])).toEqual(hiddenIds.slice(PAGE_SIZE))
  })
})
