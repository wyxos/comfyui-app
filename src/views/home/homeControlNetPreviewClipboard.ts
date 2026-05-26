import type { ControlNetSelection } from './homeTypes'

type HomeControlNetPreviewClipboardDeps = {
  controlNetScopeKey: (id: string, checkpointName?: string) => string
  getControlNetSelection: (id: string, checkpointName?: string) => ControlNetSelection | null
}

export function createHomeControlNetPreviewClipboard(deps: HomeControlNetPreviewClipboardDeps) {
  const controlNetPreviewCopyTimers = new Map<string, number>()

  function clearControlNetPreviewCopyTimer(scopedId: string) {
    const timer = controlNetPreviewCopyTimers.get(scopedId)
    if (timer !== undefined) {
      window.clearTimeout(timer)
      controlNetPreviewCopyTimers.delete(scopedId)
    }
  }

  function clearControlNetPreviewCopyTimers(checkpointName = '') {
    if (!checkpointName) {
      for (const timer of controlNetPreviewCopyTimers.values()) {
        window.clearTimeout(timer)
      }
      controlNetPreviewCopyTimers.clear()
      return
    }

    for (const scopedId of [...controlNetPreviewCopyTimers.keys()]) {
      if (scopedId.startsWith(`${checkpointName}:`)) {
        clearControlNetPreviewCopyTimer(scopedId)
      }
    }
  }

  async function copyControlNetPreviewToClipboard(id: string, checkpointName = '') {
    const controlNet = deps.getControlNetSelection(id, checkpointName)
    if (!controlNet?.previewImageUrl || controlNet.isCopyingPreview) {
      return
    }

    const scopedId = deps.controlNetScopeKey(id, checkpointName)
    clearControlNetPreviewCopyTimer(scopedId)
    controlNet.previewCopyNotice = ''
    controlNet.previewCopyError = ''

    if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
      controlNet.previewCopyError = 'Copying images to clipboard is not available in this browser.'
      return
    }

    controlNet.isCopyingPreview = true

    try {
      const response = await fetch(controlNet.previewImageUrl)
      if (!response.ok) {
        throw new Error('Could not load the ControlNet preview image.')
      }

      const sourceBlob = await response.blob()
      const mimeType = sourceBlob.type || 'image/png'
      const clipboardBlob = sourceBlob.type ? sourceBlob : new Blob([sourceBlob], { type: mimeType })
      await navigator.clipboard.write([
        new ClipboardItem({
          [mimeType]: clipboardBlob,
        }),
      ])
      controlNet.previewCopyNotice = 'Copied preview image'
      controlNetPreviewCopyTimers.set(
        scopedId,
        window.setTimeout(() => {
          controlNet.previewCopyNotice = ''
          controlNetPreviewCopyTimers.delete(scopedId)
        }, 1600),
      )
    } catch (error) {
      controlNet.previewCopyError =
        error instanceof Error ? error.message : 'Could not copy the ControlNet preview image.'
    } finally {
      controlNet.isCopyingPreview = false
    }
  }

  return {
    clearControlNetPreviewCopyTimer,
    clearControlNetPreviewCopyTimers,
    copyControlNetPreviewToClipboard,
  }
}
