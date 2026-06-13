import { computed, ref, type Ref } from 'vue'
import { normalizeBlacklistedModelIds } from './assetRouteHelpers'
import {
  BLACKLIST_STORAGE_KEY,
  type CivitaiModel,
} from './assetViewTypes'

type HiddenAssetModelOptions = {
  activeImageModel: Ref<CivitaiModel | null>
  closeImageModal: () => void
  models: Ref<CivitaiModel[]>
  openDownloadMenuKey: Ref<string>
}

export function useHiddenAssetModels({
  activeImageModel,
  closeImageModal,
  models,
  openDownloadMenuKey,
}: HiddenAssetModelOptions) {
  const blacklistedModelIds = ref<number[]>([])
  const blacklistedModelIdSet = computed(() => new Set(blacklistedModelIds.value))
  const hiddenModelCount = computed(() => blacklistedModelIds.value.length)

  function loadBlacklistedModels() {
    try {
      blacklistedModelIds.value = normalizeBlacklistedModelIds(
        JSON.parse(window.localStorage.getItem(BLACKLIST_STORAGE_KEY) ?? '[]'),
      )
    } catch {
      blacklistedModelIds.value = []
    }
  }

  function persistBlacklistedModels() {
    window.localStorage.setItem(BLACKLIST_STORAGE_KEY, JSON.stringify(blacklistedModelIds.value))
  }

  function blacklistModel(model: CivitaiModel) {
    if (!blacklistedModelIdSet.value.has(model.id)) {
      blacklistedModelIds.value = normalizeBlacklistedModelIds([...blacklistedModelIds.value, model.id])
      persistBlacklistedModels()
    }

    models.value = models.value.filter((item) => item.id !== model.id)
    openDownloadMenuKey.value = ''

    if (activeImageModel.value?.id === model.id) {
      closeImageModal()
    }
  }

  function restoreHiddenModel(model: CivitaiModel) {
    if (blacklistedModelIdSet.value.has(model.id)) {
      blacklistedModelIds.value = blacklistedModelIds.value.filter((modelId) => modelId !== model.id)
      persistBlacklistedModels()
    }

    models.value = models.value.filter((item) => item.id !== model.id)
    openDownloadMenuKey.value = ''

    if (activeImageModel.value?.id === model.id) {
      closeImageModal()
    }
  }

  return {
    blacklistedModelIds,
    blacklistedModelIdSet,
    blacklistModel,
    hiddenModelCount,
    loadBlacklistedModels,
    restoreHiddenModel,
  }
}
