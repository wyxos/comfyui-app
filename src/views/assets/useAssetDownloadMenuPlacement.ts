import { nextTick, ref, watch, type Ref } from 'vue'
import type { CivitaiModel } from './assetViewTypes'

type DownloadMenuPlacement = 'down' | 'up'

const DOWNLOAD_MENU_GAP_PX = 8
const DOWNLOAD_MENU_FALLBACK_HEIGHT_PX = 336
const DOWNLOAD_MENU_MIN_UPWARD_SPACE_PX = 96

function templateElement(element: unknown) {
  return element instanceof HTMLElement ? element : null
}

function listingContainerRectFor(trigger: HTMLElement) {
  const container = trigger.closest('[data-assets-results-scroll]')
  if (container instanceof HTMLElement) {
    return container.getBoundingClientRect()
  }

  return {
    bottom: window.innerHeight,
    top: 0,
  }
}

export function useAssetDownloadMenuPlacement(
  openDownloadMenuKey: Ref<string>,
  handleDownloadClick: (model: CivitaiModel) => unknown,
) {
  const downloadButtonElements = new Map<number, HTMLElement>()
  const downloadMenuElements = new Map<number, HTMLElement>()
  const downloadMenuPlacements = ref<Record<number, DownloadMenuPlacement>>({})

  function setDownloadButtonRef(modelId: number, element: unknown) {
    const nextElement = templateElement(element)
    if (nextElement) {
      downloadButtonElements.set(modelId, nextElement)
    } else {
      downloadButtonElements.delete(modelId)
    }
  }

  function setDownloadMenuRef(modelId: number, element: unknown) {
    const nextElement = templateElement(element)
    if (nextElement) {
      downloadMenuElements.set(modelId, nextElement)
    } else {
      downloadMenuElements.delete(modelId)
    }

    if (openDownloadMenuKey.value === String(modelId)) {
      updateDownloadMenuPlacement(modelId)
    }
  }

  function updateDownloadMenuPlacement(modelId: number) {
    const trigger = downloadButtonElements.get(modelId)
    const menu = downloadMenuElements.get(modelId)
    if (!trigger || !menu) {
      return
    }

    const triggerRect = trigger.getBoundingClientRect()
    const containerRect = listingContainerRectFor(trigger)
    const menuRect = menu.getBoundingClientRect()
    const menuHeight = menuRect.height || menu.offsetHeight || DOWNLOAD_MENU_FALLBACK_HEIGHT_PX
    const spaceBelow = containerRect.bottom - triggerRect.bottom - DOWNLOAD_MENU_GAP_PX
    const spaceAbove = triggerRect.top - containerRect.top - DOWNLOAD_MENU_GAP_PX
    const placement: DownloadMenuPlacement =
      spaceBelow < menuHeight && spaceAbove >= DOWNLOAD_MENU_MIN_UPWARD_SPACE_PX ? 'up' : 'down'
    if (downloadMenuPlacements.value[modelId] === placement) {
      return
    }

    downloadMenuPlacements.value = {
      ...downloadMenuPlacements.value,
      [modelId]: placement,
    }
  }

  function downloadMenuPlacementFor(model: CivitaiModel) {
    return downloadMenuPlacements.value[model.id] ?? 'down'
  }

  function handleDownloadButtonClick(model: CivitaiModel) {
    void handleDownloadClick(model)
  }

  watch(openDownloadMenuKey, async (key) => {
    if (!key) {
      return
    }

    await nextTick()
    updateDownloadMenuPlacement(Number(key))
  }, { flush: 'post' })

  return {
    downloadMenuPlacementFor,
    handleDownloadButtonClick,
    setDownloadButtonRef,
    setDownloadMenuRef,
  }
}
