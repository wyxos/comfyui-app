import { computed, type ComputedRef } from 'vue'
import {
  imageNsfwDetectedValue,
  imageNsfwLabel,
  imageSafetyKeyFor,
  isImageNsfw,
} from './assetPreviewHelpers'
import type {
  AssetPreviewModalProps,
  CivitaiImage,
  CivitaiModel,
  PreviewSlide,
} from './assetPreviewTypes'

export function useAssetPreviewImageSafety({
  activeDetailedImage,
  activeImage,
  activeSlide,
  civitaiModel,
  props,
}: {
  activeDetailedImage: ComputedRef<CivitaiImage | null>
  activeImage: ComputedRef<CivitaiImage | null>
  activeSlide: ComputedRef<PreviewSlide | null>
  civitaiModel: ComputedRef<CivitaiModel | null>
  props: Readonly<AssetPreviewModalProps>
}) {
  const activeImageForSafety = computed(() => activeDetailedImage.value ?? activeImage.value)
  const activeImageSafetyKey = computed(() =>
    imageSafetyKeyFor(activeImageForSafety.value, activeSlide.value?.url ?? ''),
  )
  const activeImageNsfwOverride = computed(() => {
    const key = activeImageSafetyKey.value
    return key ? props.compatibility?.imageSafetyOverrides?.[key]?.imageNsfwOverride ?? null : null
  })
  const activeImageDetectedNsfw = computed(() => imageNsfwDetectedValue(activeImageForSafety.value))
  const activeImageIsNsfw = computed(() =>
    activeImageNsfwOverride.value ?? isImageNsfw(civitaiModel.value, activeImageForSafety.value),
  )
  const activeImageSafetyLabel = computed(() => {
    if (activeImageNsfwOverride.value === true) {
      return 'Marked NSFW'
    }
    if (activeImageNsfwOverride.value === false) {
      return 'Marked safe'
    }
    return imageNsfwLabel(civitaiModel.value, activeImageForSafety.value)
  })

  return {
    activeImageSafetyKey,
    activeImageNsfwOverride,
    activeImageDetectedNsfw,
    activeImageIsNsfw,
    activeImageSafetyLabel,
  }
}
