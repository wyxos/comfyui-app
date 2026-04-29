import { validateRequestedSize } from './homeJobHelpers'
import type { HomeState } from './homeState'
import {
  coerceTrimmedFieldString,
  formatAspectRatioScale,
  getAspectRatioScaleMultiplier,
  getNormalizedScaledAspectSize,
  normalizeControlNetResolutionFromDimensions,
  normalizeDimensionInput,
} from './homeValueHelpers'

export function createHomeAspectActions(state: HomeState) {
const {
  aspectRatioBaseSize,
  aspectRatioScale,
  controlNets,
  height,
  lockedAspectRatio,
  maintainAspectRatio,
  width,
} = state
let suppressedAspectRatioWatchCount = 0

function parsePositiveDimensionValue(value: string) {
  const parsed = Number.parseFloat(coerceTrimmedFieldString(value))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function captureLockedAspectRatioFromCurrentSize() {
  const parsedWidth = parsePositiveDimensionValue(width.value)
  const parsedHeight = parsePositiveDimensionValue(height.value)
  if (!parsedWidth || !parsedHeight) {
    lockedAspectRatio.value = null
    aspectRatioBaseSize.value = null
    return false
  }

  lockedAspectRatio.value = parsedWidth / parsedHeight
  aspectRatioBaseSize.value = { width: parsedWidth, height: parsedHeight }
  return true
}

function setAspectRatioLock(nextValue: boolean) {
  maintainAspectRatio.value = nextValue
  if (!nextValue) {
    lockedAspectRatio.value = null
    aspectRatioScale.value = '0'
    aspectRatioBaseSize.value = null
    return
  }

  aspectRatioScale.value = '0'
  captureLockedAspectRatioFromCurrentSize()
}

function getAspectRatioBaseSize() {
  if (aspectRatioBaseSize.value) {
    return aspectRatioBaseSize.value
  }

  return captureLockedAspectRatioFromCurrentSize() ? aspectRatioBaseSize.value : null
}

function getScaledAspectRatioSize(baseSize = getAspectRatioBaseSize()) {
  if (!baseSize) {
    return null
  }

  return getNormalizedScaledAspectSize(baseSize.width, baseSize.height, aspectRatioScale.value)
}

function applyAspectRatioScale() {
  const baseSize = getAspectRatioBaseSize()
  const scaledSize = getScaledAspectRatioSize(baseSize)
  if (!baseSize || !scaledSize) {
    return
  }

  suppressedAspectRatioWatchCount = 2
  width.value = String(scaledSize.width)
  height.value = String(scaledSize.height)
  lockedAspectRatio.value = baseSize.width / baseSize.height
}

function setAspectRatioSliderValue(value: string | number) {
  if (!maintainAspectRatio.value) {
    return
  }

  const nextValue = formatAspectRatioScale(value)
  aspectRatioScale.value = nextValue
  applyAspectRatioScale()
}

function resetAspectRatioScale() {
  if (!maintainAspectRatio.value) {
    return
  }

  aspectRatioScale.value = '0'
  applyAspectRatioScale()
}

function applySizeValues(nextWidth: string | number, nextHeight: string | number) {
  suppressedAspectRatioWatchCount += 2
  width.value = String(nextWidth)
  height.value = String(nextHeight)
  if (maintainAspectRatio.value) {
    aspectRatioScale.value = '0'
    captureLockedAspectRatioFromCurrentSize()
  }
}

function syncLinkedSize(changedField: 'width' | 'height') {
  if (!maintainAspectRatio.value) {
    return
  }

  const ratio = lockedAspectRatio.value ?? (captureLockedAspectRatioFromCurrentSize() ? lockedAspectRatio.value : null)
  if (!ratio) {
    return
  }

  const sourceValue = parsePositiveDimensionValue(changedField === 'width' ? width.value : height.value)
  if (!sourceValue) {
    return
  }

  const nextValue =
    changedField === 'width'
      ? Math.max(64, Math.round(sourceValue / ratio))
      : Math.max(64, Math.round(sourceValue * ratio))

  suppressedAspectRatioWatchCount = 1
  if (changedField === 'width') {
    height.value = String(nextValue)
    updateAspectRatioBaseFromScaledSize(sourceValue, nextValue)
  } else {
    width.value = String(nextValue)
    updateAspectRatioBaseFromScaledSize(nextValue, sourceValue)
  }
}

function updateAspectRatioBaseFromScaledSize(targetWidth: number, targetHeight: number) {
  const multiplier = getAspectRatioScaleMultiplier(aspectRatioScale.value)
  aspectRatioBaseSize.value = {
    width: targetWidth / multiplier,
    height: targetHeight / multiplier,
  }
  lockedAspectRatio.value = aspectRatioBaseSize.value.width / aspectRatioBaseSize.value.height
}

function handleLinkedSizeChange(changedField: 'width' | 'height') {
  if (suppressedAspectRatioWatchCount > 0) {
    suppressedAspectRatioWatchCount -= 1
    return
  }

  syncLinkedSize(changedField)
}

function getControlNetResolutionFromRequestedSize() {
  const requestedSize = validateRequestedSize(width.value, height.value)
  if (requestedSize.width === null || requestedSize.height === null) {
    return null
  }

  return normalizeControlNetResolutionFromDimensions(requestedSize.width, requestedSize.height)
}

function normalizeControlNetResolutionFromOutputSize() {
  return getControlNetResolutionFromRequestedSize() ?? 512
}

function getOnlyAvailableControlNetModel() {
  return controlNets.value.length === 1 ? controlNets.value[0]?.name ?? '' : ''
}

function resolveAvailableControlNetModel(model: unknown) {
  const trimmedModel = coerceTrimmedFieldString(model)
  const availableControlNets = new Set(controlNets.value.map((controlNet) => controlNet.name))
  if (trimmedModel && availableControlNets.has(trimmedModel)) {
    return trimmedModel
  }

  return trimmedModel ? '' : getOnlyAvailableControlNetModel()
}

  return {
  applySizeValues,
  captureLockedAspectRatioFromCurrentSize,
  getScaledAspectRatioSize,
  handleLinkedSizeChange,
  normalizeControlNetResolutionFromOutputSize,
  normalizeDimensionInput,
  resolveAvailableControlNetModel,
  setAspectRatioLock,
  setAspectRatioSliderValue,
  resetAspectRatioScale,
  syncLinkedSize,
}
}

export type HomeAspectActions = ReturnType<typeof createHomeAspectActions>
