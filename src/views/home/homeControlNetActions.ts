import type { HomeState } from './homeState'
import type {
  ControlNetPreviewResponse,
  ControlNetSelection,
} from './homeTypes'
import { createHomeControlNetCompatibility } from './homeControlNetCompatibility'
import { createHomeControlNetImageEvents } from './homeControlNetImageEvents'
import { createHomeControlNetPreviewClipboard } from './homeControlNetPreviewClipboard'
import { createClientId, normalizeControlNetNumericField } from './homeValueHelpers'

type HomeControlNetActionDeps = {
  apiJson: <T>(path: string, init?: RequestInit & { timeoutMs?: number }) => Promise<T>
  applySizeValues: (nextWidth: string | number, nextHeight: string | number) => void
  buildControlNetSelection: (entry?: Partial<ControlNetSelection>) => ControlNetSelection
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
  controlNets,
  selectedCheckpoints,
} = state
const {
  apiJson,
  applySizeValues,
  buildControlNetSelection,
  getSupportedImageFileFromClipboard,
  getSupportedImageFileFromTransfer,
  loadImageDimensions,
  normalizeControlNetResolutionFromOutputSize,
  uploadInputImage,
} = deps

function controlNetScopeKey(id: string, checkpointName = '') {
  return checkpointName ? `${checkpointName}:${id}` : id
}

function getCheckpointSelection(checkpointName = '') {
  return checkpointName
    ? selectedCheckpoints.value.find((checkpoint) => checkpoint.name === checkpointName) ?? null
    : null
}

function getControlNetCollection(checkpointName = '') {
  const checkpoint = getCheckpointSelection(checkpointName)
  if (!checkpointName) {
    return []
  }

  if (!checkpoint) {
    return []
  }

  if (!Array.isArray(checkpoint.controlNets)) {
    checkpoint.controlNets = []
  }

  return checkpoint.controlNets
}

function setControlNetCollection(nextControlNets: ControlNetSelection[], checkpointName = '') {
  const checkpoint = getCheckpointSelection(checkpointName)
  if (!checkpointName) {
    return
  }

  if (checkpoint) {
    checkpoint.controlNets = nextControlNets
  }
}

function getControlNetSelection(id: string, checkpointName = '') {
  return getControlNetCollection(checkpointName).find((controlNet) => controlNet.id === id) ?? null
}

const {
  clearControlNetPreviewCopyTimer,
  clearControlNetPreviewCopyTimers,
  copyControlNetPreviewToClipboard,
} = createHomeControlNetPreviewClipboard({
  controlNetScopeKey,
  getControlNetSelection,
})

const compatibilityActions = createHomeControlNetCompatibility(controlNets)

function getAllControlNetSelections() {
  return selectedCheckpoints.value.flatMap((checkpoint) => checkpoint.controlNets ?? [])
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
  controlNet.isCopyingPreview = false
  controlNet.previewCopyNotice = ''
  controlNet.previewCopyError = ''
}

function syncOutputDerivedControlNetResolutions(previousResolution: number, nextResolution: number) {
  for (const controlNet of getAllControlNetSelections()) {
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

function addControlNetInstance(checkpointName = '', model = '') {
  const checkpoint = getCheckpointSelection(checkpointName)
  if (!checkpointName || !checkpoint) {
    return
  }

  const nextSelection = buildControlNetSelection(model ? { model } : {})
  checkpoint.enabled = true
  setControlNetCollection([...getControlNetCollection(checkpointName), nextSelection], checkpointName)
}

async function addControlNetImageFromFile(file: File, checkpointName = '') {
  const targetCheckpoint =
    getCheckpointSelection(checkpointName) ?? selectedCheckpoints.value[0] ?? null
  if (!targetCheckpoint) {
    throw new Error('Select a checkpoint before using an output as ControlNet input.')
  }

  const selectedModels = new Set(
    getControlNetCollection(targetCheckpoint.name)
      .map((controlNet) => controlNet.model)
      .filter(Boolean),
  )
  const model = controlNets.value.find((controlNet) => !selectedModels.has(controlNet.name))?.name ?? ''
  const nextSelection = buildControlNetSelection({ model })
  targetCheckpoint.enabled = true
  setControlNetCollection(
    [...getControlNetCollection(targetCheckpoint.name), nextSelection],
    targetCheckpoint.name,
  )
  await setControlNetImage(nextSelection.id, file, targetCheckpoint.name)
  return nextSelection
}

function removeControlNetInstance(id: string, checkpointName = '') {
  revokeControlNetPreview(getControlNetSelection(id, checkpointName))
  const scopedId = controlNetScopeKey(id, checkpointName)
  clearControlNetPreviewCopyTimer(scopedId)
  controlNetDragDepths.delete(scopedId)
  controlNetImageLoadIds.delete(scopedId)
  setControlNetCollection(
    getControlNetCollection(checkpointName).filter((controlNet) => controlNet.id !== id),
    checkpointName,
  )
}

function setControlNetEnabled(id: string, enabled: boolean, checkpointName = '') {
  const controlNet = getControlNetSelection(id, checkpointName)
  if (controlNet) {
    controlNet.enabled = enabled
  }
}

function setControlNetModel(id: string, model: string, checkpointName = '') {
  const controlNet = getControlNetSelection(id, checkpointName)
  if (controlNet) {
    controlNet.model = model
  }
}

function setControlNetPreprocessor(id: string, preprocessor: string, checkpointName = '') {
  const controlNet = getControlNetSelection(id, checkpointName)
  if (controlNet) {
    controlNet.preprocessor = preprocessor
    clearControlNetGeneratedPreview(controlNet)
  }
}

function setControlNetLineartPolarity(id: string, lineartPolarity: 'white-lines' | 'black-lines', checkpointName = '') {
  const controlNet = getControlNetSelection(id, checkpointName)
  if (controlNet) {
    controlNet.lineartPolarity = lineartPolarity
    clearControlNetGeneratedPreview(controlNet)
  }
}

function setControlNetField(
  id: string,
  field: 'strength' | 'startPercent' | 'endPercent' | 'previewResolution',
  value: string,
  checkpointName = '',
) {
  const controlNet = getControlNetSelection(id, checkpointName)
  if (controlNet) {
    controlNet[field] = value
    if (field === 'previewResolution') {
      clearControlNetGeneratedPreview(controlNet)
    }
  }
}

function clearControlNetInstances(checkpointName = '') {
  getControlNetCollection(checkpointName).forEach((controlNet) => revokeControlNetPreview(controlNet))
  setControlNetCollection([], checkpointName)
  if (!checkpointName) {
    controlNetDragDepths.clear()
    controlNetImageLoadIds.clear()
    clearControlNetPreviewCopyTimers()
    return
  }

  clearControlNetPreviewCopyTimers(checkpointName)
  for (const controlNetKey of [...controlNetDragDepths.keys()]) {
    if (controlNetKey.startsWith(`${checkpointName}:`)) {
      controlNetDragDepths.delete(controlNetKey)
    }
  }
  for (const controlNetKey of [...controlNetImageLoadIds.keys()]) {
    if (controlNetKey.startsWith(`${checkpointName}:`)) {
      controlNetImageLoadIds.delete(controlNetKey)
    }
  }
}

function clearControlNetImage(id: string, checkpointName = '') {
  const controlNet = getControlNetSelection(id, checkpointName)
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
  controlNetImageLoadIds.delete(controlNetScopeKey(id, checkpointName))
  clearControlNetGeneratedPreview(controlNet)
}

function applyControlNetSourceImageResolution(id: string, checkpointName = '') {
  const controlNet = getControlNetSelection(id, checkpointName)
  if (!controlNet?.inputImageWidth || !controlNet.inputImageHeight) {
    return
  }

  applySizeValues(controlNet.inputImageWidth, controlNet.inputImageHeight)
}

async function setControlNetImage(id: string, file: File | null, checkpointName = '') {
  const controlNet = getControlNetSelection(id, checkpointName)
  if (!controlNet) {
    return
  }

  if (!file) {
    clearControlNetImage(id, checkpointName)
    return
  }

  const loadId = createClientId('controlnet-load')
  const scopedId = controlNetScopeKey(id, checkpointName)
  controlNetImageLoadIds.set(scopedId, loadId)
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
    if (controlNetImageLoadIds.get(scopedId) === loadId) {
      controlNet.inputImageWidth = dimensions.width
      controlNet.inputImageHeight = dimensions.height
    }

    const inputImageName = await uploadInputImage(file)
    if (controlNetImageLoadIds.get(scopedId) === loadId) {
      controlNet.inputImageName = inputImageName
      shouldGeneratePreview = true
    }
  } catch (error) {
    if (controlNetImageLoadIds.get(scopedId) === loadId) {
      controlNet.inputImageName = ''
      controlNet.uploadError =
        error instanceof Error ? error.message : 'Could not upload the ControlNet image.'
    }
  } finally {
    if (controlNetImageLoadIds.get(scopedId) === loadId) {
      controlNet.isUploading = false
    }
  }

  if (shouldGeneratePreview) {
    await generateControlNetPreview(id, checkpointName)
  }
}

async function generateControlNetPreview(id: string, checkpointName = '') {
  const controlNet = getControlNetSelection(id, checkpointName)
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

const imageEventActions = createHomeControlNetImageEvents({
  controlNetDragDepths,
  controlNetScopeKey,
  getControlNetSelection,
  getSupportedImageFileFromClipboard,
  getSupportedImageFileFromTransfer,
  setControlNetImage,
})

function addCheckpointControlNet(checkpointName: string, model: string) {
  const checkpoint = getCheckpointSelection(checkpointName)
  const normalizedModel = model.trim()
  if (!checkpoint || !normalizedModel) {
    return
  }

  checkpoint.enabled = true
  const existingSelection = getControlNetCollection(checkpointName).find(
    (controlNet) => controlNet.model === normalizedModel,
  )
  if (existingSelection) {
    existingSelection.enabled = true
    return
  }

  addControlNetInstance(checkpointName, normalizedModel)
}

function clearCheckpointControlNets(checkpointName: string) {
  clearControlNetInstances(checkpointName)
}

function setAllCheckpointControlNetsEnabled(checkpointName: string, enabled: boolean) {
  const checkpoint = getCheckpointSelection(checkpointName)
  if (!checkpoint) {
    return
  }

  checkpoint.controlNets = getControlNetCollection(checkpointName).map((controlNet) => ({
    ...controlNet,
    enabled,
  }))
}

return {
  getControlNetSelection,
  getAllControlNetSelections,
  revokeControlNetPreview,
  clearControlNetGeneratedPreview,
  clearControlNetPreviewCopyTimers,
  syncOutputDerivedControlNetResolutions,
  addControlNetInstance,
  addControlNetImageFromFile,
  removeControlNetInstance,
  setControlNetEnabled,
  setControlNetModel,
  setControlNetPreprocessor,
  setControlNetLineartPolarity,
  setControlNetField,
  clearControlNetInstances,
  clearControlNetImage,
  applyControlNetSourceImageResolution,
  setControlNetImage,
  generateControlNetPreview,
  copyControlNetPreviewToClipboard,
  addCheckpointControlNet,
  clearCheckpointControlNets,
  setAllCheckpointControlNetsEnabled,
  ...imageEventActions,
  ...compatibilityActions,
}
}
