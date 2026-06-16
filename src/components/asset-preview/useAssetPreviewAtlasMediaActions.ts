import { ref, type ComputedRef } from 'vue'

import {
  type AtlasFileDeleteResponse,
  atlasItemFor,
  atlasMediaKey,
  atlasRequestId,
  statusFromFileDeletePayload,
  statusFromReactionPayload,
  type AtlasReactionResponse,
  type AtlasReactionType,
} from './assetPreviewAtlasMedia'
import type {
  AtlasMediaStatus,
  CivitaiImage,
  CivitaiModel,
  CivitaiModelVersion,
} from './assetPreviewTypes'

type AtlasStatusResponse = {
  configured?: boolean
  items?: AtlasMediaStatus[]
}

type UseAssetPreviewAtlasMediaActionsOptions = {
  model: ComputedRef<CivitaiModel | null | undefined>
  selectedVersion: ComputedRef<CivitaiModelVersion | null>
}

function canSendToAtlas(image: CivitaiImage) {
  return image.url && (typeof image.id === 'number' || (typeof image.id === 'string' && /^\d+$/.test(image.id)))
}

export function useAssetPreviewAtlasMediaActions(options: UseAssetPreviewAtlasMediaActionsOptions) {
  const atlasActionError = ref('')
  const atlasReactionPendingKey = ref('')
  const atlasDeletePendingKey = ref('')
  const atlasConfigured = ref(false)

  async function fetchAtlasStatuses(
    images: CivitaiImage[],
    signal: AbortSignal,
    filterIgnored: boolean,
  ) {
    const model = options.model.value
    const version = options.selectedVersion.value
    const statusableImages = images.filter(canSendToAtlas)
    if (!statusableImages.length || !model || !version) {
      return images
    }

    try {
      const response = await fetch('/api/atlas/civitai/status', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json; charset=utf-8',
        },
        body: JSON.stringify({
          items: statusableImages.map((image) => atlasItemFor(image, model, version)),
        }),
        signal,
      })

      if (!response.ok) {
        return images
      }

      const payload = (await response.json().catch(() => null)) as AtlasStatusResponse | null
      atlasConfigured.value = payload?.configured === true
      const statuses = new Map(
        (payload?.items ?? [])
          .filter((item) => typeof item.request_id === 'string')
          .map((item) => [item.request_id as string, item]),
      )
      if (!statuses.size) {
        return images
      }

      const withStatuses = images.map((image) => ({
        ...image,
        atlasStatus: statuses.get(atlasRequestId(image)) ?? image.atlasStatus ?? null,
      }))

      return filterIgnored
        ? withStatuses.filter((image) => image.atlasStatus?.filtered !== true)
        : withStatuses
    } catch (caughtError) {
      if (caughtError instanceof DOMException && caughtError.name === 'AbortError') {
        throw caughtError
      }

      return images
    }
  }

  async function reactToAtlasImage(image: CivitaiImage, type: AtlasReactionType) {
    const model = options.model.value
    const version = options.selectedVersion.value
    if (!model || !version || !canSendToAtlas(image)) {
      return null
    }

    const key = atlasMediaKey(image)
    atlasReactionPendingKey.value = key
    atlasActionError.value = ''

    try {
      const response = await fetch('/api/atlas/civitai/reactions', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json; charset=utf-8',
        },
        body: JSON.stringify({
          type,
          download_behavior: 'queue',
          item: atlasItemFor(image, model, version),
        }),
      })

      const payload = (await response.json().catch(() => null)) as AtlasReactionResponse | null
      if (!response.ok) {
        throw new Error(payload?.message ?? `Atlas returned ${response.status}`)
      }

      return {
        key,
        status: statusFromReactionPayload(image.atlasStatus, payload, type),
      }
    } catch (caughtError) {
      atlasActionError.value = caughtError instanceof Error ? caughtError.message : 'Atlas reaction failed.'
      return null
    } finally {
      if (atlasReactionPendingKey.value === key) {
        atlasReactionPendingKey.value = ''
      }
    }
  }

  async function deleteAtlasFile(image: CivitaiImage) {
    const fileId = image.atlasStatus?.file_id
    if (!fileId || !Number.isFinite(fileId)) {
      return null
    }

    const key = atlasMediaKey(image)
    atlasDeletePendingKey.value = key
    atlasActionError.value = ''

    try {
      const response = await fetch(`/api/atlas/files/${fileId}`, {
        method: 'DELETE',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json; charset=utf-8',
        },
        body: JSON.stringify({
          also_from_disk: true,
          also_delete_record: true,
        }),
      })

      const payload = (await response.json().catch(() => null)) as AtlasFileDeleteResponse | null
      if (!response.ok) {
        throw new Error(payload?.message ?? `Atlas returned ${response.status}`)
      }

      return {
        key,
        status: statusFromFileDeletePayload(image.atlasStatus),
      }
    } catch (caughtError) {
      atlasActionError.value = caughtError instanceof Error ? caughtError.message : 'Atlas file delete failed.'
      return null
    } finally {
      if (atlasDeletePendingKey.value === key) {
        atlasDeletePendingKey.value = ''
      }
    }
  }

  return {
    atlasActionError,
    atlasConfigured,
    atlasDeletePendingKey,
    atlasReactionPendingKey,
    deleteAtlasFile,
    fetchAtlasStatuses,
    reactToAtlasImage,
  }
}
