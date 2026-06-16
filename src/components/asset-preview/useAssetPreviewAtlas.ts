import { onBeforeUnmount, ref, watch, type ComputedRef } from 'vue'

import type { CivitaiModel, CivitaiModelVersion } from './assetPreviewTypes'
import { fetchAppSettings } from '../../composables/useAppSettings'

type UseAssetPreviewAtlasOptions = {
  open: ComputedRef<boolean>
  model: ComputedRef<CivitaiModel | null | undefined>
  selectedVersion: ComputedRef<CivitaiModelVersion | null>
  includeNsfw: ComputedRef<boolean>
}

export function useAssetPreviewAtlas(options: UseAssetPreviewAtlasOptions) {
  const atlasConfigured = ref(false)
  const atlasBaseUrl = ref('')
  const atlasOpenError = ref('')
  const atlasOpening = ref(false)

  let settingsToken = 0

  async function loadAtlasSettings() {
    const requestToken = settingsToken + 1
    settingsToken = requestToken

    try {
      const settings = await fetchAppSettings()
      if (settingsToken === requestToken && options.open.value) {
        atlasConfigured.value = settings.atlasConfigured
        atlasBaseUrl.value = settings.atlasUrl
      }
    } catch {
      if (settingsToken === requestToken && options.open.value) {
        atlasConfigured.value = false
        atlasBaseUrl.value = ''
      }
    }
  }

  async function openAtlasModelTab() {
    const model = options.model.value
    const version = options.selectedVersion.value
    if (!model) {
      return
    }

    atlasOpening.value = true
    atlasOpenError.value = ''

    try {
      const response = await fetch('/api/atlas/civitai/open-model', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json; charset=utf-8',
        },
        body: JSON.stringify({
          modelId: model.id,
          modelVersionId: version?.id ?? null,
          nsfw: options.includeNsfw.value,
        }),
      })
      const payload = (await response.json().catch(() => null)) as { browse_url?: string, message?: string } | null
      if (!response.ok) {
        throw new Error(payload?.message ?? `Atlas returned ${response.status}`)
      }

      if (payload?.browse_url) {
        window.open(payload.browse_url, '_blank', 'noreferrer')
      }
    } catch (caughtError) {
      atlasOpenError.value = caughtError instanceof Error ? caughtError.message : 'Could not open Atlas.'
    } finally {
      atlasOpening.value = false
    }
  }

  watch(
    () => options.open.value,
    (isOpen) => {
      settingsToken += 1
      atlasOpenError.value = ''
      atlasOpening.value = false

      if (!isOpen) {
        atlasConfigured.value = false
        atlasBaseUrl.value = ''
        return
      }

      atlasConfigured.value = false
      atlasBaseUrl.value = ''
      void loadAtlasSettings()
    },
    { immediate: true },
  )

  onBeforeUnmount(() => {
    settingsToken += 1
  })

  return {
    atlasBaseUrl,
    atlasConfigured,
    atlasOpenError,
    atlasOpening,
    openAtlasModelTab,
  }
}
