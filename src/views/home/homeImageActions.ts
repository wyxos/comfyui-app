import type { HomeSelectionComputed } from './homeSelectionComputed'
import type { HomeState } from './homeState'
import type { HomeStatusComputed } from './homeStatusComputed'
import type { ControlNetSelection } from './homeTypes'
import type { UploadInputImageResponse } from './homeTypes'
import { coerceFieldString } from './homeValueHelpers'

type HomeImageActionDeps = {
  apiJson: <T>(path: string, init?: RequestInit & { timeoutMs?: number }) => Promise<T>
  applySizeValues: (nextWidth: string | number, nextHeight: string | number) => void
  clearControlNetGeneratedPreview: (controlNet: ControlNetSelection | null) => void
  generateControlNetPreview: (id: string) => Promise<void>
  getControlNetSelection: (id: string) => ControlNetSelection | null
  normalizeControlNetResolutionFromOutputSize: () => number
}

export function createHomeImageActions(
  state: HomeState,
  selection: HomeSelectionComputed,
  status: HomeStatusComputed,
  deps: HomeImageActionDeps,
) {
const {
  height,
  inputImageField,
  inputImageUploadError,
  isDraggingImage,
  isUploadingInputImage,
  selectedImageDimensions,
  selectedImageDisplayName,
  selectedImageFile,
  selectedImagePreviewUrl,
  uploadedInputImageName,
  useInputImage,
  width,
} = state
void selection
void status
const {
  apiJson,
  applySizeValues,
  clearControlNetGeneratedPreview,
  generateControlNetPreview,
  getControlNetSelection,
  normalizeControlNetResolutionFromOutputSize,
} = deps
let imageDragDepth = 0
let selectedImageLoadId = 0

function handleImageSelection(event: Event) {
  const target = event.target
  if (!(target instanceof HTMLInputElement)) {
    return
  }

  void setSelectedImage(target.files?.[0] ?? null)
}

function clearSelectedImage() {
  useInputImage.value = false
  void setSelectedImage(null)
  if (inputImageField.value) {
    inputImageField.value.value = ''
  }
}

function revokeSelectedImagePreview() {
  if (selectedImagePreviewUrl.value?.startsWith('blob:')) {
    URL.revokeObjectURL(selectedImagePreviewUrl.value)
  }

  selectedImagePreviewUrl.value = null
}

function normalizeDimensionInput(value: number) {
  const clamped = Math.min(Math.max(value, 64), 16384)
  return Math.max(64, Math.round(clamped / 32) * 32)
}

function loadImageDimensions(file: File) {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file)
    const image = new Image()

    image.onload = () => {
      const dimensions = {
        width: image.naturalWidth,
        height: image.naturalHeight,
      }

      URL.revokeObjectURL(objectUrl)
      resolve(dimensions)
    }

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('Could not read the selected image dimensions.'))
    }

    image.src = objectUrl
  })
}

async function uploadInputImage(file: File) {
  const formData = new FormData()
  formData.set('image', file)

  const payload = await apiJson<UploadInputImageResponse>('/api/upload-input-image', {
    method: 'POST',
    body: formData,
    timeoutMs: 120000,
  })

  if (!payload.inputImageName) {
    throw new Error('The companion app did not return a stored image id.')
  }

  return payload.inputImageName
}

async function setSelectedImage(file: File | null) {
  const loadId = ++selectedImageLoadId
  revokeSelectedImagePreview()
  selectedImageFile.value = file
  selectedImageDisplayName.value = file?.name ?? null
  selectedImageDimensions.value = null
  uploadedInputImageName.value = null
  useInputImage.value = Boolean(file)
  inputImageUploadError.value = ''
  isUploadingInputImage.value = false

  if (file) {
    selectedImagePreviewUrl.value = URL.createObjectURL(file)

    try {
      const dimensions = await loadImageDimensions(file)
      if (loadId !== selectedImageLoadId || selectedImageFile.value !== file) {
        return
      }

      selectedImageDimensions.value = dimensions
    } catch {
      if (loadId !== selectedImageLoadId || selectedImageFile.value !== file) {
        return
      }

      selectedImageDimensions.value = null
      inputImageUploadError.value = 'Could not read the selected image dimensions.'
    }

    try {
      isUploadingInputImage.value = true
      const inputImageName = await uploadInputImage(file)
      if (loadId !== selectedImageLoadId || selectedImageFile.value !== file) {
        return
      }

      uploadedInputImageName.value = inputImageName
    } catch (error) {
      if (loadId !== selectedImageLoadId || selectedImageFile.value !== file) {
        return
      }

      uploadedInputImageName.value = null
      inputImageUploadError.value =
        error instanceof Error ? error.message : 'Could not upload the input image.'
    } finally {
      if (loadId === selectedImageLoadId && selectedImageFile.value === file) {
        isUploadingInputImage.value = false
      }
    }
  }
}

function swapSizeValues() {
  const nextWidth = coerceFieldString(height.value)
  const nextHeight = coerceFieldString(width.value)
  applySizeValues(nextWidth, nextHeight)
}

function applySourceImageResolution() {
  if (!selectedImageDimensions.value) {
    return
  }

  applySizeValues(
    normalizeDimensionInput(selectedImageDimensions.value.width),
    normalizeDimensionInput(selectedImageDimensions.value.height),
  )
}

function applyControlNetOutputResolution(id: string) {
  const controlNet = getControlNetSelection(id)
  if (!controlNet) {
    return
  }

  controlNet.previewResolution = String(normalizeControlNetResolutionFromOutputSize())
  clearControlNetGeneratedPreview(controlNet)
  void generateControlNetPreview(id)
}

function openImagePicker() {
  inputImageField.value?.click()
}

function isSupportedImageFile(file: File) {
  return file.type.startsWith('image/') || /\.(png|jpe?g|webp|avif)$/i.test(file.name)
}

function getSupportedImageFileFromTransfer(dataTransfer: DataTransfer | null | undefined) {
  const transferredFiles = Array.from(dataTransfer?.files ?? [])
  const itemFiles = Array.from(dataTransfer?.items ?? [])
    .filter((item) => item.kind === 'file')
    .map((item) => item.getAsFile())
    .filter((file): file is File => Boolean(file))

  return [...transferredFiles, ...itemFiles].find((file) => isSupportedImageFile(file)) ?? null
}

function getClipboardImageExtension(type: string) {
  if (type === 'image/jpeg') {
    return 'jpg'
  }

  if (type === 'image/webp') {
    return 'webp'
  }

  if (type === 'image/avif') {
    return 'avif'
  }

  return 'png'
}

async function getSupportedImageFileFromClipboard() {
  if (!navigator.clipboard?.read) {
    throw new Error('Clipboard image paste is not available here. Press Ctrl+V over the drop zone instead.')
  }

  const clipboardItems = await navigator.clipboard.read()
  for (const item of clipboardItems) {
    const imageType = item.types.find((type) => type.startsWith('image/'))
    if (!imageType) {
      continue
    }

    const blob = await item.getType(imageType)
    const fileName =
      blob instanceof File && blob.name
        ? blob.name
        : `clipboard-image.${getClipboardImageExtension(blob.type || imageType)}`
    const file = new File([blob], fileName, {
      type: blob.type || imageType,
      lastModified: Date.now(),
    })

    if (isSupportedImageFile(file)) {
      return file
    }
  }

  throw new Error('The clipboard does not contain a supported image.')
}

function handleImageDragEnter() {
  imageDragDepth += 1
  isDraggingImage.value = true
}

function handleImageDragOver(event: DragEvent) {
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'copy'
  }

  isDraggingImage.value = true
}

function handleImageDragLeave(event: DragEvent) {
  const currentTarget = event.currentTarget
  const relatedTarget = event.relatedTarget

  if (currentTarget instanceof HTMLElement && relatedTarget instanceof Node) {
    if (currentTarget.contains(relatedTarget)) {
      return
    }
  }

  imageDragDepth = Math.max(0, imageDragDepth - 1)
  if (imageDragDepth === 0) {
    isDraggingImage.value = false
  }
}

function handleImageDrop(event: DragEvent) {
  imageDragDepth = 0
  isDraggingImage.value = false

  const droppedFile = getSupportedImageFileFromTransfer(event.dataTransfer)

  if (!droppedFile) {
    return
  }

  void setSelectedImage(droppedFile)

  if (inputImageField.value) {
    inputImageField.value.value = ''
  }
}

function handleImagePaste(event: ClipboardEvent) {
  const pastedFile = getSupportedImageFileFromTransfer(event.clipboardData)
  if (!pastedFile) {
    return
  }

  event.preventDefault()
  event.stopPropagation()
  void setSelectedImage(pastedFile)

  if (inputImageField.value) {
    inputImageField.value.value = ''
  }
}

async function pasteImageFromClipboard() {
  inputImageUploadError.value = ''

  try {
    const pastedFile = await getSupportedImageFileFromClipboard()
    await setSelectedImage(pastedFile)

    if (inputImageField.value) {
      inputImageField.value.value = ''
    }
  } catch (error) {
    inputImageUploadError.value =
      error instanceof Error ? error.message : 'Could not paste an image from the clipboard.'
  }
}

return {
  handleImageSelection,
  clearSelectedImage,
  revokeSelectedImagePreview,
  normalizeDimensionInput,
  loadImageDimensions,
  uploadInputImage,
  setSelectedImage,
  swapSizeValues,
  applySourceImageResolution,
  applyControlNetOutputResolution,
  openImagePicker,
  isSupportedImageFile,
  getSupportedImageFileFromTransfer,
  getSupportedImageFileFromClipboard,
  handleImageDragEnter,
  handleImageDragOver,
  handleImageDragLeave,
  handleImageDrop,
  handleImagePaste,
  pasteImageFromClipboard,
}
}
