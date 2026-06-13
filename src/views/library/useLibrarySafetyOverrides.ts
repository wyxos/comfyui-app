import { computed, ref, type Ref } from 'vue'
import type { ModelCompatibilityMetadata } from '../home/homeTypes'
import type { LibraryModelItem } from './libraryModelHelpers'

type LibrarySafetyOptions = {
  selectedModel: Ref<LibraryModelItem | null>
  refreshDownloads: () => Promise<unknown> | unknown
  refreshWatchedDownloads?: () => Promise<unknown> | unknown
  refreshControlNets: () => Promise<unknown> | unknown
}

function mergeSavedSafetyMetadata(
  item: LibraryModelItem,
  metadata: Partial<ModelCompatibilityMetadata>,
  modelNsfwOverride: boolean | null,
) {
  const compatibility = {
    ...(item.compatibility ?? {}),
    ...metadata,
    modelId: metadata.modelId ?? item.compatibility?.modelId ?? item.modelId ?? null,
    versionId: metadata.versionId ?? item.compatibility?.versionId ?? item.versionId ?? null,
    modelName: metadata.modelName ?? item.compatibility?.modelName ?? item.modelName,
    versionName: metadata.versionName ?? item.compatibility?.versionName ?? item.versionName,
    modelType: metadata.modelType ?? item.compatibility?.modelType ?? item.modelType,
    baseModel: metadata.baseModel ?? item.compatibility?.baseModel ?? item.baseModel ?? '',
    modelNsfw: metadata.modelNsfw ?? modelNsfwOverride,
    modelNsfwOverride: metadata.modelNsfwOverride ?? modelNsfwOverride,
  }

  return {
    ...item,
    modelNsfw: compatibility.modelNsfw,
    compatibility,
  } as LibraryModelItem
}

function mergeSavedImageSafetyMetadata(
  item: LibraryModelItem,
  metadata: Partial<ModelCompatibilityMetadata>,
  imageKey: string,
  imageNsfwOverride: boolean | null,
) {
  const compatibility = {
    ...(item.compatibility ?? {}),
    ...metadata,
    imageSafetyOverrides: {
      ...(item.compatibility?.imageSafetyOverrides ?? {}),
      ...(metadata.imageSafetyOverrides ?? {}),
      [imageKey]: {
        imageNsfw: imageNsfwOverride,
        imageNsfwOverride,
      },
    },
  }

  return {
    ...item,
    compatibility,
  } as LibraryModelItem
}

async function putModelMetadata(model: LibraryModelItem, metadata: Record<string, unknown>) {
  const response = await fetch(
    `/api/model-metadata?type=${encodeURIComponent(model.itemKind)}&name=${encodeURIComponent(model.fileName)}`,
    {
      method: 'PUT',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({ metadata }),
    },
  )
  const result = await response.json().catch(() => null)
  if (!response.ok || result?.ok === false) {
    throw new Error(result?.message ?? `Metadata save returned ${response.status}`)
  }
  return result
}

export function useLibrarySafetyOverrides(options: LibrarySafetyOptions) {
  const savingSafety = ref(false)
  const safetyError = ref('')
  const savingImageSafety = ref(false)
  const imageSafetyError = ref('')
  const canEditSelectedModelSafety = computed(() => Boolean(options.selectedModel.value?.fileName))

  function resetSafetyErrors() {
    safetyError.value = ''
    imageSafetyError.value = ''
  }

  async function refreshAfterSave(model: LibraryModelItem) {
    if (model.librarySource === 'controlnet') {
      await options.refreshControlNets()
      return
    }

    if (model.librarySource === 'watched' && options.refreshWatchedDownloads) {
      await options.refreshWatchedDownloads()
      return
    }

    await options.refreshDownloads()
  }

  async function saveSelectedModelSafety(payload: { modelNsfwOverride: boolean | null }) {
    const model = options.selectedModel.value
    if (!model || savingSafety.value || !canEditSelectedModelSafety.value) {
      return
    }

    savingSafety.value = true
    safetyError.value = ''
    try {
      const result = await putModelMetadata(model, {
        modelNsfw: payload.modelNsfwOverride,
        modelNsfwOverride: payload.modelNsfwOverride,
      })
      options.selectedModel.value = mergeSavedSafetyMetadata(model, result?.metadata ?? {}, payload.modelNsfwOverride)
      await refreshAfterSave(model)
    } catch (error) {
      safetyError.value = error instanceof Error ? error.message : 'Could not save safety override.'
    } finally {
      savingSafety.value = false
    }
  }

  async function saveSelectedModelImageSafety(payload: { imageKey: string; imageNsfwOverride: boolean | null }) {
    const model = options.selectedModel.value
    if (!model || savingImageSafety.value || !canEditSelectedModelSafety.value) {
      return
    }

    savingImageSafety.value = true
    imageSafetyError.value = ''
    try {
      const result = await putModelMetadata(model, {
        imageSafetyOverrides: {
          [payload.imageKey]: {
            imageNsfw: payload.imageNsfwOverride,
            imageNsfwOverride: payload.imageNsfwOverride,
          },
        },
      })
      options.selectedModel.value = mergeSavedImageSafetyMetadata(
        model,
        result?.metadata ?? {},
        payload.imageKey,
        payload.imageNsfwOverride,
      )
      await refreshAfterSave(model)
    } catch (error) {
      imageSafetyError.value = error instanceof Error ? error.message : 'Could not save image safety override.'
    } finally {
      savingImageSafety.value = false
    }
  }

  return {
    savingSafety,
    safetyError,
    savingImageSafety,
    imageSafetyError,
    canEditSelectedModelSafety,
    resetSafetyErrors,
    saveSelectedModelSafety,
    saveSelectedModelImageSafety,
  }
}
