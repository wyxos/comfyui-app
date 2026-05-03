import { spawn } from 'node:child_process'
import { homedir } from 'node:os'
import { join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export let host = process.env.COMFY_COMPANION_HOST ?? '127.0.0.1'
export let port = Number(process.env.COMFY_COMPANION_PORT ?? 3210)
export let comfyUrl = new URL(process.env.COMFYUI_URL ?? 'http://127.0.0.1:8000')
export let comfyClientId = process.env.COMFYUI_CLIENT_ID ?? 'comfyui-companion-app'
export let preferredCheckpoint = process.env.COMFYUI_DEFAULT_CHECKPOINT ?? 'waiIllustriousSDXL_v160.safetensors'
export let ollamaUrl = new URL(process.env.OLLAMA_URL ?? 'http://127.0.0.1:11434')
export let defaultOllamaModel = process.env.OLLAMA_MODEL ?? 'gpt-oss:20b'
export let ollamaTimeoutMs = Number(process.env.OLLAMA_TIMEOUT_MS ?? 600000)

export const defaultRuntimeAdapters = {
  openParentFolder(parentDirectory) {
    const child = spawn('explorer.exe', [parentDirectory], {
      detached: true,
      stdio: 'ignore',
    })
    child.unref()
  },
}
export const runtimeAdapters = { ...defaultRuntimeAdapters }

export const serverDir = fileURLToPath(new URL('.', import.meta.url))
export const appRoot = normalize(join(serverDir, '..'))
export const distDir = join(appRoot, 'dist')
export const indexPath = join(distDir, 'index.html')
export let userConfigRoot = process.env.APPDATA || process.env.XDG_CONFIG_HOME || join(homedir(), '.config')
export let configDir = normalize(
  resolve(process.env.COMFY_COMPANION_CONFIG_DIR || join(userConfigRoot, 'comfyui-companion-app')),
)
export let settingsPath = join(configDir, 'settings.json')
export let downloadsPath = join(configDir, 'downloads.json')
export let jobsDatabasePath = join(configDir, 'jobs.sqlite')
export const downloadsPersistRenameAttempts = 8
export const downloadsPersistRenameDelayMs = 50
export let civitaiDownloadSegmentCount = Math.max(
  1,
  Math.min(8, Number.parseInt(process.env.CIVITAI_DOWNLOAD_SEGMENTS ?? '4', 10) || 4),
)
export let civitaiSegmentedDownloadMinBytes = Math.max(
  0,
  Number.parseInt(process.env.CIVITAI_SEGMENTED_DOWNLOAD_MIN_BYTES ?? `${64 * 1024 * 1024}`, 10) || 64 * 1024 * 1024,
)
export let civitaiSegmentStallTimeoutMs = Math.max(
  5000,
  Number.parseInt(process.env.CIVITAI_SEGMENT_STALL_TIMEOUT_MS ?? '15000', 10) || 15000,
)

export const contentTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.avif', 'image/avif'],
  ['.mp4', 'video/mp4'],
  ['.webm', 'video/webm'],
  ['.mov', 'video/quicktime'],
  ['.m4v', 'video/x-m4v'],
  ['.ico', 'image/x-icon'],
  ['.safetensors', 'application/octet-stream'],
])

export const outputTypes = new Set(['output', 'input', 'temp'])
export const civitaiModelsUrl = new URL('https://civitai.com/api/v1/models')
export const civitaiModelVersionsUrl = new URL('https://civitai.com/api/v1/model-versions')
export const civitaiImagesUrl = new URL('https://civitai.com/api/v1/images')
export const civitaiModelsQueryParams = new Set([
  'allowCommercialUse',
  'allowDerivatives',
  'allowDifferentLicenses',
  'allowNoCredit',
  'baseModels',
  'cursor',
  'favorites',
  'hidden',
  'ids',
  'limit',
  'modelId',
  'modelVersionId',
  'nsfw',
  'page',
  'period',
  'primaryFileOnly',
  'query',
  'rating',
  'sort',
  'supportsGeneration',
  'tag',
  'types',
  'username',
])
export const civitaiImagesQueryParams = new Set([
  'cursor',
  'imageId',
  'limit',
  'modelId',
  'modelVersionId',
  'nsfw',
  'page',
  'period',
  'postId',
  'sort',
  'username',
])
export const civitaiIntegerQueryParams = new Map([
  ['imageId', { min: 1, max: Number.MAX_SAFE_INTEGER }],
  ['limit', { min: 1, max: 100 }],
  ['modelId', { min: 1, max: Number.MAX_SAFE_INTEGER }],
  ['modelVersionId', { min: 1, max: Number.MAX_SAFE_INTEGER }],
  ['page', { min: 1, max: 100000 }],
  ['postId', { min: 1, max: Number.MAX_SAFE_INTEGER }],
  ['rating', { min: 0, max: 5 }],
])
export const civitaiBooleanQueryParams = new Set([
  'allowDerivatives',
  'allowDifferentLicenses',
  'allowNoCredit',
  'favorites',
  'hidden',
  'nsfw',
  'primaryFileOnly',
  'supportsGeneration',
])
export const samplerProfiles = Object.freeze({
  sdxl: {
    width: 1024,
    height: 1024,
    steps: 20,
    cfg: 5.5,
    samplerName: 'dpmpp_2m',
    scheduler: 'karras',
    txt2imgDenoise: 1,
    img2imgDenoise: 0.75,
  },
  anima: {
    width: 1024,
    height: 1024,
    steps: 20,
    cfg: 4,
    samplerName: 'euler',
    scheduler: 'normal',
    txt2imgDenoise: 1,
    img2imgDenoise: 0.75,
  },
})
export const animaAssets = Object.freeze({
  clipName: 'qwen_3_06b_base.safetensors',
  clipType: 'stable_diffusion',
  vaeName: 'wan_2.1_vae.safetensors',
})
export const maxSeed = 2_147_483_647
export const supportedImageExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp', '.avif'])
export const supportedVideoExtensions = new Set(['.mp4', '.webm', '.mov', '.m4v'])
export const supportedPreviewExtensions = new Set([...supportedImageExtensions, ...supportedVideoExtensions])
export const mimeExtensionMap = new Map([
  ['image/png', '.png'],
  ['image/jpeg', '.jpg'],
  ['image/webp', '.webp'],
  ['image/avif', '.avif'],
])
export const previewMimeExtensionMap = new Map([
  ...mimeExtensionMap,
  ['video/mp4', '.mp4'],
  ['video/webm', '.webm'],
  ['video/quicktime', '.mov'],
  ['video/x-m4v', '.m4v'],
])

export const jobs = new Map()
export const civitaiDownloads = new Map()

export function refreshConfigFromEnv() {
  host = process.env.COMFY_COMPANION_HOST ?? '127.0.0.1'
  port = Number(process.env.COMFY_COMPANION_PORT ?? 3210)
  comfyUrl = new URL(process.env.COMFYUI_URL ?? 'http://127.0.0.1:8000')
  comfyClientId = process.env.COMFYUI_CLIENT_ID ?? 'comfyui-companion-app'
  preferredCheckpoint = process.env.COMFYUI_DEFAULT_CHECKPOINT ?? 'waiIllustriousSDXL_v160.safetensors'
  ollamaUrl = new URL(process.env.OLLAMA_URL ?? 'http://127.0.0.1:11434')
  defaultOllamaModel = process.env.OLLAMA_MODEL ?? 'gpt-oss:20b'
  ollamaTimeoutMs = Number(process.env.OLLAMA_TIMEOUT_MS ?? 600000)
  userConfigRoot = process.env.APPDATA || process.env.XDG_CONFIG_HOME || join(homedir(), '.config')
  configDir = normalize(resolve(process.env.COMFY_COMPANION_CONFIG_DIR || join(userConfigRoot, 'comfyui-companion-app')))
  settingsPath = join(configDir, 'settings.json')
  downloadsPath = join(configDir, 'downloads.json')
  jobsDatabasePath = join(configDir, 'jobs.sqlite')
  civitaiDownloadSegmentCount = Math.max(
    1,
    Math.min(8, Number.parseInt(process.env.CIVITAI_DOWNLOAD_SEGMENTS ?? '4', 10) || 4),
  )
  civitaiSegmentedDownloadMinBytes = Math.max(
    0,
    Number.parseInt(process.env.CIVITAI_SEGMENTED_DOWNLOAD_MIN_BYTES ?? `${64 * 1024 * 1024}`, 10) || 64 * 1024 * 1024,
  )
  civitaiSegmentStallTimeoutMs = Math.max(
    5000,
    Number.parseInt(process.env.CIVITAI_SEGMENT_STALL_TIMEOUT_MS ?? '15000', 10) || 15000,
  )
  jobs.clear()
  civitaiDownloads.clear()
}
