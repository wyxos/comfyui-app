import type { ControlNetSelection } from './homeTypes'

type HomeControlNetImageEventDeps = {
  controlNetDragDepths: Map<string, number>
  controlNetScopeKey: (id: string, checkpointName?: string) => string
  getControlNetSelection: (id: string, checkpointName?: string) => ControlNetSelection | null
  getSupportedImageFileFromClipboard: () => Promise<File>
  getSupportedImageFileFromTransfer: (dataTransfer: DataTransfer | null | undefined) => File | null
  setControlNetImage: (id: string, file: File | null, checkpointName?: string) => Promise<void>
}

export function createHomeControlNetImageEvents(deps: HomeControlNetImageEventDeps) {
  const {
    controlNetDragDepths,
    controlNetScopeKey,
    getControlNetSelection,
    getSupportedImageFileFromClipboard,
    getSupportedImageFileFromTransfer,
    setControlNetImage,
  } = deps

  function handleControlNetImageSelection(id: string, event: Event, checkpointName = '') {
    const target = event.target
    if (!(target instanceof HTMLInputElement)) {
      return
    }

    void setControlNetImage(id, target.files?.[0] ?? null, checkpointName)
    target.value = ''
  }

  function handleControlNetDragEnter(id: string, checkpointName = '') {
    const scopedId = controlNetScopeKey(id, checkpointName)
    controlNetDragDepths.set(scopedId, (controlNetDragDepths.get(scopedId) ?? 0) + 1)
    const controlNet = getControlNetSelection(id, checkpointName)
    if (controlNet) {
      controlNet.isDragging = true
    }
  }

  function handleControlNetDragOver(id: string, event: DragEvent, checkpointName = '') {
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy'
    }

    const controlNet = getControlNetSelection(id, checkpointName)
    if (controlNet) {
      controlNet.isDragging = true
    }
  }

  function handleControlNetDragLeave(id: string, event: DragEvent, checkpointName = '') {
    const currentTarget = event.currentTarget
    const relatedTarget = event.relatedTarget
    if (currentTarget instanceof HTMLElement && relatedTarget instanceof Node) {
      if (currentTarget.contains(relatedTarget)) {
        return
      }
    }

    const scopedId = controlNetScopeKey(id, checkpointName)
    const nextDepth = Math.max(0, (controlNetDragDepths.get(scopedId) ?? 0) - 1)
    controlNetDragDepths.set(scopedId, nextDepth)
    const controlNet = getControlNetSelection(id, checkpointName)
    if (controlNet && nextDepth === 0) {
      controlNet.isDragging = false
    }
  }

  function handleControlNetImageDrop(id: string, event: DragEvent, checkpointName = '') {
    controlNetDragDepths.set(controlNetScopeKey(id, checkpointName), 0)
    const controlNet = getControlNetSelection(id, checkpointName)
    if (controlNet) {
      controlNet.isDragging = false
    }

    const droppedFile = getSupportedImageFileFromTransfer(event.dataTransfer)
    if (droppedFile) {
      void setControlNetImage(id, droppedFile, checkpointName)
    }
  }

  function handleControlNetImagePaste(id: string, event: ClipboardEvent, checkpointName = '') {
    const pastedFile = getSupportedImageFileFromTransfer(event.clipboardData)
    if (!pastedFile) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    void setControlNetImage(id, pastedFile, checkpointName)
  }

  async function pasteControlNetImageFromClipboard(id: string, checkpointName = '') {
    const controlNet = getControlNetSelection(id, checkpointName)
    if (!controlNet) {
      return
    }

    controlNet.uploadError = ''

    try {
      const pastedFile = await getSupportedImageFileFromClipboard()
      await setControlNetImage(id, pastedFile, checkpointName)
    } catch (error) {
      const latestControlNet = getControlNetSelection(id, checkpointName)
      if (latestControlNet) {
        latestControlNet.uploadError =
          error instanceof Error ? error.message : 'Could not paste a ControlNet image from the clipboard.'
      }
    }
  }

  return {
    handleControlNetImageSelection,
    handleControlNetDragEnter,
    handleControlNetDragOver,
    handleControlNetDragLeave,
    handleControlNetImageDrop,
    handleControlNetImagePaste,
    pasteControlNetImageFromClipboard,
  }
}
