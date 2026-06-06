import { safeTrim } from './shared.mjs'

export function stripModelExtension(modelName) {
  return safeTrim(modelName).replace(/\.[^.]+$/, '')
}

export function buildModelToken(modelName, fallback = 'model') {
  const normalized = stripModelExtension(modelName)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)

  return normalized || fallback
}

export function getGenerationOutputCategory(inputImageName) {
  return inputImageName ? 'img2img' : 'txt2img'
}

export function buildFilenamePrefix(outputCategory, checkpoint, variant, variantCount) {
  const checkpointToken = buildModelToken(checkpoint)
  const variantSuffix = variantCount > 1 ? `-${buildModelToken(variant.id, 'variant')}` : ''
  return `%year%-%month%-%day%/${outputCategory}/${checkpointToken}${variantSuffix}`
}
