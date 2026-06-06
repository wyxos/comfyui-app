import { onBeforeUnmount, watch } from 'vue'

type AssetPreviewNavigationEvents = {
  close: () => void
  showNextImage: () => void
  showPreviousImage: () => void
}

const MOUSE_NAVIGATION_DEDUP_MS = 400

function isMouseNavigationButton(event: MouseEvent) {
  if (event.button !== 3 && event.button !== 4) {
    return false
  }

  event.preventDefault()
  event.stopPropagation()
  event.stopImmediatePropagation()
  return true
}

export function useAssetPreviewNavigationEvents(
  isOpen: () => boolean,
  handlers: AssetPreviewNavigationEvents,
) {
  let lastNavigationButton: number | null = null
  let lastNavigationTimestamp = 0

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      handlers.close()
    } else if (event.key === 'ArrowLeft') {
      handlers.showPreviousImage()
    } else if (event.key === 'ArrowRight') {
      handlers.showNextImage()
    }
  }

  function shouldNavigateFromMouse(event: MouseEvent) {
    if (event.type !== 'mousedown' && event.type !== 'auxclick') {
      return false
    }

    const timestamp = event.timeStamp || Date.now()
    if (
      lastNavigationButton === event.button
      && timestamp - lastNavigationTimestamp < MOUSE_NAVIGATION_DEDUP_MS
    ) {
      return false
    }

    lastNavigationButton = event.button
    lastNavigationTimestamp = timestamp
    return true
  }

  function handleMouseNavigation(event: MouseEvent) {
    if (!isMouseNavigationButton(event) || !shouldNavigateFromMouse(event)) {
      return
    }

    ;(event.button === 3 ? handlers.showPreviousImage : handlers.showNextImage)()
  }

  function addListeners() {
    window.addEventListener('keydown', handleKeydown)
    window.addEventListener('mousedown', handleMouseNavigation, true)
    window.addEventListener('mouseup', handleMouseNavigation, true)
    window.addEventListener('auxclick', handleMouseNavigation, true)
  }

  function removeListeners() {
    window.removeEventListener('keydown', handleKeydown)
    window.removeEventListener('mousedown', handleMouseNavigation, true)
    window.removeEventListener('mouseup', handleMouseNavigation, true)
    window.removeEventListener('auxclick', handleMouseNavigation, true)
  }

  watch(
    isOpen,
    (open) => {
      if (open) {
        addListeners()
      } else {
        removeListeners()
      }
    },
    { immediate: true },
  )

  onBeforeUnmount(removeListeners)
}
