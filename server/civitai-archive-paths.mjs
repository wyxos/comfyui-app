import { extname } from 'node:path'
import { getComfyCheckpointDir, getComfyControlNetDir, getComfyLoraDir } from './model-paths.mjs'
import { safeTrim } from './shared.mjs'

export function normalizeArchiveType(value) {
  const normalized = safeTrim(value).toLowerCase().replace(/[\s_-]+/g, '')
  if (normalized === 'checkpoint' || normalized === 'checkpoints') {
    return 'checkpoint'
  }
  if (normalized === 'lora' || normalized === 'loras') {
    return 'lora'
  }
  if (normalized === 'controlnet' || normalized === 'controlnets' || normalized === 'controlnetmodel') {
    return 'controlnet'
  }
  return ''
}

export async function rootForArchiveType(type) {
  if (type === 'checkpoint') {
    return getComfyCheckpointDir()
  }
  if (type === 'lora') {
    return getComfyLoraDir()
  }
  if (type === 'controlnet') {
    return getComfyControlNetDir()
  }
  return null
}

export function archiveModelType(type, fallback = '') {
  if (type === 'checkpoint') {
    return 'Checkpoint'
  }
  if (type === 'lora') {
    return 'LORA'
  }
  if (type === 'controlnet') {
    return 'ControlNet'
  }
  return safeTrim(fallback) || 'Unknown'
}

export function getArchiveBasePath(modelPath) {
  return modelPath.slice(0, -extname(modelPath).length)
}

export function getArchiveSidecarPath(modelPath) {
  return `${modelPath}.civitai.info`
}

export function getArchivePreviewDir(modelPath) {
  return `${getArchiveBasePath(modelPath)}.previews`
}
