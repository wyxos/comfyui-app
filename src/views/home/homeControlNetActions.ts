import type { HomeState } from './homeState'
import type {
  CheckpointEntry,
  ControlNetOption,
  ControlNetPreviewResponse,
  ControlNetSelection,
  ModelCompatibilityMetadata,
  ModelCompatibilityStatus,
} from './homeTypes'
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
const controlNetPreviewCopyTimers = new Map<string, number>()

function controlNetScopeKey(id: string, checkpointName = '') {
  return checkpointName ? `${checkpointName}:${id}` : id
}

function normalizeBaseModelKey(value: unknown) {
  return typeof value === 'string'
    ? value
        .trim()
        .toLowerCase()
        .replace(/\b(stable diffusion|sd)\b/g, 'sd')
        .replace(/[^a-z0-9]+/g, '')
    : ''
}

const sdxlArchitectureBaseModelKeys = new Set(['sdxl', 'pony', 'illustrious'])

function expandBaseModelCompatibilityKeys(...values: unknown[]) {
  const keys = new Set<string>()
  for (const value of values.flat()) {
    const key = normalizeBaseModelKey(value)
    if (!key) {
      continue
    }
    keys.add(key)
    if (sdxlArchitectureBaseModelKeys.has(key)) {
      keys.add('sdxl')
    }
  }
  return keys
}

function getCompatibilityMetadataBaseKey(metadata: ModelCompatibilityMetadata | null | undefined) {
  return metadata?.baseModelKey || normalizeBaseModelKey(metadata?.baseModel)
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

async function copyControlNetPreviewToClipboard(id: string, checkpointName = '') {
  const controlNet = getControlNetSelection(id, checkpointName)
  if (!controlNet?.previewImageUrl || controlNet.isCopyingPreview) {
    return
  }

  const scopedId = controlNetScopeKey(id, checkpointName)
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

function controlNetHasExplicitCheckpointMatch(
  checkpoint: CheckpointEntry,
  controlNetMetadata: ModelCompatibilityMetadata | null | undefined,
) {
  const checkpointNameKeys = new Set(
    [checkpoint.name, checkpoint.displayName, checkpoint.compatibility?.modelName, checkpoint.compatibility?.versionName]
      .filter(Boolean)
      .map((value) => (typeof value === 'string' ? value.trim().toLowerCase() : '')),
  )
  const checkpointNames = Array.isArray(controlNetMetadata?.checkpointNames)
    ? controlNetMetadata.checkpointNames
    : []
  if (checkpointNames.some((name) => checkpointNameKeys.has(name.toLowerCase()))) {
    return true
  }

  const checkpointHashes = new Set(
    Object.values(checkpoint.compatibility?.hashes ?? {}).map((hash) => hash.toLowerCase()),
  )
  return Object.values(controlNetMetadata?.checkpointHashes ?? {}).some((hash) =>
    checkpointHashes.has(hash.toLowerCase()),
  )
}

function getControlNetCompatibilityStatus(
  checkpoint: CheckpointEntry,
  controlNet: ControlNetOption,
): ModelCompatibilityStatus {
  if (controlNetHasExplicitCheckpointMatch(checkpoint, controlNet.compatibility)) {
    return 'compatible'
  }

  const checkpointKeys = expandBaseModelCompatibilityKeys(
    getCompatibilityMetadataBaseKey(checkpoint.compatibility),
    checkpoint.compatibility?.baseModel,
    checkpoint.family,
  )
  const controlNetKeys = expandBaseModelCompatibilityKeys(
    getCompatibilityMetadataBaseKey(controlNet.compatibility),
    controlNet.compatibility?.baseModel,
    controlNet.compatibility?.compatibleBaseModelKeys ?? [],
    controlNet.compatibility?.compatibleBaseModels ?? [],
  )

  if ([...checkpointKeys].some((key) => controlNetKeys.has(key))) {
    return 'compatible'
  }

  if (checkpointKeys.size && controlNetKeys.size) {
    return 'incompatible'
  }

  return 'unverified'
}

function getControlNetCompatibilityLabel(checkpoint: CheckpointEntry, controlNetName: string) {
  const controlNet = controlNets.value.find((entry) => entry.name === controlNetName)
  if (!controlNet) {
    return 'Unverified'
  }

  const status = getControlNetCompatibilityStatus(checkpoint, controlNet)
  if (status === 'compatible') {
    const bases = controlNet.compatibility?.compatibleBaseModels ?? []
    return bases.length ? `Compatible with ${bases.join(', ')}` : 'Compatible'
  }
  if (status === 'incompatible') {
    const base = controlNet.compatibility?.baseModel || controlNet.compatibility?.compatibleBaseModels?.[0]
    return base ? `Incompatible with ${checkpoint.displayName} (${base})` : 'Incompatible'
  }

  return controlNet.compatibility?.status === 'loading' ? 'Metadata loading' : 'Unverified'
}

function getCheckpointControlNetOptions(checkpoint: CheckpointEntry) {
  const selectedNames = new Set((checkpoint.controlNets ?? []).map((selection) => selection.model))
  return controlNets.value
    .map((controlNet) => ({
      controlNet,
      status: getControlNetCompatibilityStatus(checkpoint, controlNet),
    }))
    .filter((entry) => entry.status !== 'incompatible' && !selectedNames.has(entry.controlNet.name))
    .sort((first, second) => {
      if (first.status !== second.status) {
        return first.status === 'compatible' ? -1 : 1
      }

      return (first.controlNet.displayName ?? first.controlNet.name)
        .localeCompare(second.controlNet.displayName ?? second.controlNet.name)
    })
    .map(({ controlNet, status }) => ({
      label: `${controlNet.displayName ?? controlNet.name}${status === 'unverified' ? ' · Unverified' : ''}`,
      value: controlNet.name,
      typeLabel: controlNet.controlType || 'ControlNet',
    }))
}

function getCheckpointControlNetModelOptions(checkpoint: CheckpointEntry, currentModel = '') {
  if (!checkpoint) {
    return []
  }

  const selectedNames = new Set(
    (checkpoint.controlNets ?? [])
      .map((selection) => selection.model)
      .filter((model) => model && model !== currentModel),
  )

  return controlNets.value
    .map((controlNet) => ({
      controlNet,
      status: getControlNetCompatibilityStatus(checkpoint, controlNet),
    }))
    .filter((entry) =>
      !selectedNames.has(entry.controlNet.name) &&
        (entry.status !== 'incompatible' || entry.controlNet.name === currentModel),
    )
    .sort((first, second) => {
      if (first.controlNet.name === currentModel) {
        return -1
      }
      if (second.controlNet.name === currentModel) {
        return 1
      }
      if (first.status !== second.status) {
        return first.status === 'compatible' ? -1 : 1
      }

      return (first.controlNet.displayName ?? first.controlNet.name)
        .localeCompare(second.controlNet.displayName ?? second.controlNet.name)
    })
    .map(({ controlNet, status }) => ({
      label: `${controlNet.displayName ?? controlNet.name}${status === 'unverified' ? ' · Unverified' : status === 'incompatible' ? ' · Incompatible' : ''}`,
      value: controlNet.name,
      typeLabel: controlNet.controlType || 'ControlNet',
    }))
}

function getCheckpointControlNetPickerPlaceholder(checkpoint: CheckpointEntry) {
  return getCheckpointControlNetOptions(checkpoint).length ? 'Add ControlNet' : 'No compatible ControlNets'
}

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
  handleControlNetImageSelection,
  handleControlNetDragEnter,
  handleControlNetDragOver,
  handleControlNetDragLeave,
  handleControlNetImageDrop,
  handleControlNetImagePaste,
  pasteControlNetImageFromClipboard,
  getControlNetCompatibilityStatus,
  getControlNetCompatibilityLabel,
  getCheckpointControlNetOptions,
  getCheckpointControlNetModelOptions,
  getCheckpointControlNetPickerPlaceholder,
  addCheckpointControlNet,
  clearCheckpointControlNets,
  setAllCheckpointControlNetsEnabled,
}
}
