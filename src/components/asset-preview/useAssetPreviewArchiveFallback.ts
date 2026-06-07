import { computed, ref } from 'vue'
import type { AssetPreviewModalProps, CivitaiModel } from './assetPreviewTypes'

export function useAssetPreviewArchiveFallback(
  props: Readonly<AssetPreviewModalProps>,
  setInitialVersion: (model: CivitaiModel | null | undefined) => void,
) {
  const archiveModel = ref<CivitaiModel | null>(null)
  const archiveStatus = ref<Record<string, unknown> | null>(null)
  const canLookupArchive = computed(() => !props.model && Boolean(props.modelType && props.fileName))
  let archiveController: AbortController | null = null

  function resetArchive() {
    archiveController?.abort()
    archiveModel.value = null
    archiveStatus.value = null
  }

  async function fetchLocalArchive() {
    resetArchive()

    if (!canLookupArchive.value || !props.open) {
      return false
    }

    const controller = new AbortController()
    archiveController = controller
    const params = new URLSearchParams({
      type: props.modelType ?? '',
      name: props.fileName ?? '',
    })

    try {
      const response = await fetch(`/api/model-archive?${params.toString()}`, {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      })
      if (!response.ok) {
        return false
      }

      const payload = (await response.json()) as {
        item?: CivitaiModel | null
        archiveStatus?: Record<string, unknown> | null
      }
      if (archiveController !== controller) {
        return false
      }

      archiveStatus.value = payload.archiveStatus ?? null
      if (!payload.item) {
        return false
      }

      archiveModel.value = payload.item
      setInitialVersion(payload.item)
      return true
    } catch {
      return false
    }
  }

  return {
    archiveModel,
    archiveStatus,
    canLookupArchive,
    fetchLocalArchive,
    resetArchive,
  }
}
