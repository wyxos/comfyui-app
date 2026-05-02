import type { HomeState } from './homeState'
import type { ControlNetPreviewResponse, ControlNetSelection } from './homeTypes'
import { createClientId, normalizeControlNetNumericField } from './homeValueHelpers'

type HomeControlNetActionDeps = {
  apiJson: <T>(path: string, init?: RequestInit & { timeoutMs?: number }) => Promise<T>
  buildControlNetSelection: () => ControlNetSelection
  getSupportedImageFileFromClipboard: () => Promise<File>
  getSupportedImageFileFromTransfer: (dataTransfer: DataTransfer | null | undefined) => File | null
  loadImageDimensions: (file: File) => Promise<{ width: number; height: number }>
  normalizeControlNetResolutionFromOutputSize: () => number
  uploadInputImage: (file: File) => Promise<string>
}

export function createHomeControlNetActions(state: HomeState, deps: HomeControlNetActionDeps) {
const {
  controlNetDragDepths,
  controlNetImageLoadIds,
  formTab,
  selectedControlNets,
} = state
const {
  apiJson,
  buildControlNetSelection,
  getSupportedImageFileFromClipboard,
  getSupportedImageFileFromTransfer,
  loadImageDimensions,
  normalizeControlNetResolutionFromOutputSize,
  uploadInputImage,
} = deps

function getControlNetSelection(id: string) {
  return selectedControlNets.value.find((controlNet) => controlNet.id === id) ?? null
}

function revokeControlNetPreview(controlNet: ControlNetSelection | null) {
  if (controlNet?.inputImagePreviewUrl.startsWith('blob:')) {
    URL.revokeObjectURL(controlNet.inputImagePreviewUrl)
  }
}

function clearControlNetGeneratedPreview(controlNet: ControlNetSelection | null) {
  if (!controlNet) {
    return
  }

  controlNet.previewImageUrl = ''
  controlNet.previewImageName = ''
  controlNet.previewImageSubfolder = ''
  controlNet.previewImageType = 'output'
  controlNet.previewError = ''
  controlNet.isGeneratingPreview = false
}

function syncOutputDerivedControlNetResolutions(previousResolution: number, nextResolution: number) {
  for (const controlNet of selectedControlNets.value) {
    const currentResolution = normalizeControlNetNumericField(
      controlNet.previewResolution,
      previousResolution,
      64,
      16384,
    )

    if (currentResolution !== previousResolution) {
      continue
    }

    controlNet.previewResolution = String(nextResolution)
    clearControlNetGeneratedPreview(controlNet)
  }
}

function addControlNetInstance() {
  selectedControlNets.value = [...selectedControlNets.value, buildControlNetSelection()]
  formTab.value = 'controlnet'
}

function removeControlNetInstance(id: string) {
  revokeControlNetPreview(getControlNetSelection(id))
  controlNetDragDepths.delete(id)
  controlNetImageLoadIds.delete(id)
  selectedControlNets.value = selectedControlNets.value.filter((controlNet) => controlNet.id !== id)
}

function setControlNetEnabled(id: string, enabled: boolean) {
  const controlNet = getControlNetSelection(id)
  if (controlNet) {
    controlNet.enabled = enabled
  }
}

function setControlNetModel(id: string, model: string) {
  const controlNet = getControlNetSelection(id)
  if (controlNet) {
    controlNet.model = model
  }
}

function setControlNetPreprocessor(id: string, preprocessor: string) {
  const controlNet = getControlNetSelection(id)
  if (controlNet) {
    controlNet.preprocessor = preprocessor
    clearControlNetGeneratedPreview(controlNet)
  }
}

function setControlNetLineartPolarity(id: string, lineartPolarity: 'white-lines' | 'black-lines') {
  const controlNet = getControlNetSelection(id)
  if (controlNet) {
    controlNet.lineartPolarity = lineartPolarity
    clearControlNetGeneratedPreview(controlNet)
  }
}

function setControlNetField(
  id: string,
  field: 'strength' | 'startPercent' | 'endPercent' | 'previewResolution',
  value: string,
) {
  const controlNet = getControlNetSelection(id)
  if (controlNet) {
    controlNet[field] = value
    if (field === 'previewResolution') {
      clearControlNetGeneratedPreview(controlNet)
    }
  }
}

function clearControlNetInstances() {
  selectedControlNets.value.forEach((controlNet) => revokeControlNetPreview(controlNet))
  selectedControlNets.value = []
  controlNetDragDepths.clear()
  controlNetImageLoadIds.clear()
}

function clearControlNetImage(id: string) {
  const controlNet = getControlNetSelection(id)
  if (!controlNet) {
    return
  }

  revokeControlNetPreview(controlNet)
  controlNet.inputImageName = ''
  controlNet.inputImageDisplayName = ''
  controlNet.inputImagePreviewUrl = ''
  controlNet.inputImageWidth = null
  controlNet.inputImageHeight = null
  controlNet.uploadError = ''
  controlNet.isUploading = false
  controlNetImageLoadIds.delete(id)
  clearControlNetGeneratedPreview(controlNet)
}

async function setControlNetImage(id: string, file: File | null) {
  const controlNet = getControlNetSelection(id)
  if (!controlNet) {
    return
  }

  if (!file) {
    clearControlNetImage(id)
    return
  }

  const loadId = createClientId('controlnet-load')
  controlNetImageLoadIds.set(id, loadId)
  revokeControlNetPreview(controlNet)
  Object.assign(controlNet, {
    enabled: true,
    inputImageName: '',
    inputImageDisplayName: file.name,
    inputImagePreviewUrl: URL.createObjectURL(file),
    inputImageWidth: null,
    inputImageHeight: null,
    uploadError: '',
    isUploading: true,
  })
  clearControlNetGeneratedPreview(controlNet)
  let shouldGeneratePreview = false

  try {
    const dimensions = await loadImageDimensions(file)
    if (controlNetImageLoadIds.get(id) === loadId) {
      controlNet.inputImageWidth = dimensions.width
      controlNet.inputImageHeight = dimensions.height
    }

    const inputImageName = await uploadInputImage(file)
    if (controlNetImageLoadIds.get(id) === loadId) {
      controlNet.inputImageName = inputImageName
      shouldGeneratePreview = true
    }
  } catch (error) {
    if (controlNetImageLoadIds.get(id) === loadId) {
      controlNet.inputImageName = ''
      controlNet.uploadError =
        error instanceof Error ? error.message : 'Could not upload the ControlNet image.'
    }
  } finally {
    if (controlNetImageLoadIds.get(id) === loadId) {
      controlNet.isUploading = false
    }
  }

  if (shouldGeneratePreview) {
    await generateControlNetPreview(id)
  }
}

async function generateControlNetPreview(id: string) {
  const controlNet = getControlNetSelection(id)
  if (!controlNet?.inputImageName || controlNet.isUploading || controlNet.isGeneratingPreview) {
    return
  }

  controlNet.previewError = ''
  controlNet.isGeneratingPreview = true

  try {
    const payload = await apiJson<ControlNetPreviewResponse>('/api/controlnet-preview', {
      method: 'POST',
      body: JSON.stringify({
        inputImageName: controlNet.inputImageName,
        preprocessor: controlNet.preprocessor,
        lineartPolarity: controlNet.lineartPolarity,
        resolution: normalizeControlNetNumericField(
          controlNet.previewResolution,
          normalizeControlNetResolutionFromOutputSize(),
          64,
          16384,
        ),
      }),
      timeoutMs: 180000,
    })

    if (!payload.preview?.url) {
      throw new Error('ComfyUI did not return a ControlNet preview image.')
    }

    controlNet.previewImageUrl = `${payload.preview.url}&preview=${Date.now()}`
    controlNet.previewImageName = payload.preview.filename
    controlNet.previewImageSubfolder = payload.preview.subfolder
    controlNet.previewImageType = payload.preview.type
    if (payload.preprocessor) {
      controlNet.preprocessor = payload.preprocessor
    }
    if (payload.lineartPolarity) {
      controlNet.lineartPolarity = payload.lineartPolarity
    }
    if (payload.resolution) {
      controlNet.previewResolution = String(payload.resolution)
    }
  } catch (error) {
    controlNet.previewError =
      error instanceof Error ? error.message : 'Could not generate ControlNet preview.'
  } finally {
    controlNet.isGeneratingPreview = false
  }
}

function handleControlNetImageSelection(id: string, event: Event) {
  const target = event.target
  if (!(target instanceof HTMLInputElement)) {
    return
  }

  void setControlNetImage(id, target.files?.[0] ?? null)
  target.value = ''
}

function handleControlNetDragEnter(id: string) {
  controlNetDragDepths.set(id, (controlNetDragDepths.get(id) ?? 0) + 1)
  const controlNet = getControlNetSelection(id)
  if (controlNet) {
    controlNet.isDragging = true
  }
}

function handleControlNetDragOver(id: string, event: DragEvent) {
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'copy'
  }

  const controlNet = getControlNetSelection(id)
  if (controlNet) {
    controlNet.isDragging = true
  }
}

function handleControlNetDragLeave(id: string, event: DragEvent) {
  const currentTarget = event.currentTarget
  const relatedTarget = event.relatedTarget
  if (currentTarget instanceof HTMLElement && relatedTarget instanceof Node) {
    if (currentTarget.contains(relatedTarget)) {
      return
    }
  }

  const nextDepth = Math.max(0, (controlNetDragDepths.get(id) ?? 0) - 1)
  controlNetDragDepths.set(id, nextDepth)
  const controlNet = getControlNetSelection(id)
  if (controlNet && nextDepth === 0) {
    controlNet.isDragging = false
  }
}

function handleControlNetImageDrop(id: string, event: DragEvent) {
  controlNetDragDepths.set(id, 0)
  const controlNet = getControlNetSelection(id)
  if (controlNet) {
    controlNet.isDragging = false
  }

  const droppedFile = getSupportedImageFileFromTransfer(event.dataTransfer)
  if (droppedFile) {
    void setControlNetImage(id, droppedFile)
  }
}

function handleControlNetImagePaste(id: string, event: ClipboardEvent) {
  const pastedFile = getSupportedImageFileFromTransfer(event.clipboardData)
  if (!pastedFile) {
    return
  }

  event.preventDefault()
  event.stopPropagation()
  void setControlNetImage(id, pastedFile)
}

async function pasteControlNetImageFromClipboard(id: string) {
  const controlNet = getControlNetSelection(id)
  if (!controlNet) {
    return
  }

  controlNet.uploadError = ''

  try {
    const pastedFile = await getSupportedImageFileFromClipboard()
    await setControlNetImage(id, pastedFile)
  } catch (error) {
    const latestControlNet = getControlNetSelection(id)
    if (latestControlNet) {
      latestControlNet.uploadError =
        error instanceof Error ? error.message : 'Could not paste a ControlNet image from the clipboard.'
    }
  }
}

return {
  getControlNetSelection,
  revokeControlNetPreview,
  clearControlNetGeneratedPreview,
  syncOutputDerivedControlNetResolutions,
  addControlNetInstance,
  removeControlNetInstance,
  setControlNetEnabled,
  setControlNetModel,
  setControlNetPreprocessor,
  setControlNetLineartPolarity,
  setControlNetField,
  clearControlNetInstances,
  clearControlNetImage,
  setControlNetImage,
  generateControlNetPreview,
  handleControlNetImageSelection,
  handleControlNetDragEnter,
  handleControlNetDragOver,
  handleControlNetDragLeave,
  handleControlNetImageDrop,
  handleControlNetImagePaste,
  pasteControlNetImageFromClipboard,
}
}
