import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, open, readFile, stat, writeFile } from 'node:fs/promises'
import { dirname, extname, join, normalize, resolve, sep } from 'node:path'
import { maxSeed, mimeExtensionMap, supportedImageExtensions } from './config.mjs'
import { safeTrim } from './shared.mjs'
import { comfyFetchJson } from './comfy-client.mjs'
import { clamp, parseFloatValue, parseInteger } from './civitai-query.mjs'
let comfyOutputDir = process.env.COMFYUI_OUTPUT_DIR ?? null
let comfyInputDir = process.env.COMFYUI_INPUT_DIR ?? null
let comfyLoraDir = process.env.COMFYUI_LORA_DIR ?? null
let comfyCheckpointDir = process.env.COMFYUI_CHECKPOINT_DIR ?? null
export function resetComfyModelDirsFromEnv() {
  comfyOutputDir = process.env.COMFYUI_OUTPUT_DIR ?? null
  comfyInputDir = process.env.COMFYUI_INPUT_DIR ?? null
  comfyLoraDir = process.env.COMFYUI_LORA_DIR ?? null
  comfyCheckpointDir = process.env.COMFYUI_CHECKPOINT_DIR ?? null
}
export function safeModelName(value) {
  const trimmed = safeTrim(value)
  return trimmed || null
}
export function normalizeNumericField(value, fallback) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseFloat(value)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }
  return fallback
}
export function extractRequestedCheckpoints(body) {
  const rawEntries =
    body instanceof FormData
      ? body.getAll('checkpoints')
      : Array.isArray(body?.checkpoints)
        ? body.checkpoints
        : [body?.checkpoint]
  const requested = []
  const seen = new Set()
  for (const entry of rawEntries) {
    const name =
      typeof entry === 'string'
        ? safeTrim(entry)
        : entry && typeof entry === 'object'
          ? safeTrim(entry.name)
          : ''
    if (!name || seen.has(name)) {
      continue
    }
    seen.add(name)
    requested.push(name)
  }
  return requested
}
function normalizeRequestedLoraTriggerWord(entry) {
  const word =
    typeof entry === 'string'
      ? safeTrim(entry)
      : entry && typeof entry === 'object'
        ? safeTrim(entry.word ?? entry.text ?? entry.name)
        : ''
  if (!word) {
    return null
  }

  const weight =
    entry && typeof entry === 'object'
      ? normalizeNumericField(entry.weight ?? entry.strength, 1)
      : 1
  return {
    word,
    weight,
  }
}
function extractRequestedLoraEntries(rawEntries, defaultStrength = 1) {
  const requested = []
  const seen = new Set()
  for (const entry of rawEntries) {
    let name = ''
    let strength = defaultStrength
    let triggerWords = []
    if (typeof entry === 'string') {
      name = safeTrim(entry)
    } else if (entry && typeof entry === 'object') {
      name = safeTrim(entry.name)
      strength = normalizeNumericField(entry.strength, defaultStrength)
      triggerWords = Array.isArray(entry.triggerWords)
        ? entry.triggerWords.map(normalizeRequestedLoraTriggerWord).filter(Boolean)
        : []
    }
    if (!name || seen.has(name)) {
      continue
    }
    seen.add(name)
    requested.push({
      name,
      strength,
      ...(triggerWords.length ? { triggerWords } : {}),
    })
  }
  return requested
}
export function extractRequestedLoras(body, defaultStrength = 1) {
  const rawEntries =
    body instanceof FormData
      ? body.getAll('loras')
      : Array.isArray(body?.loras)
        ? body.loras
        : []
  return extractRequestedLoraEntries(rawEntries, defaultStrength)
}
export function extractRequestedCheckpointJobs(body, defaultStrength = 1) {
  const rawEntries =
    body instanceof FormData
      ? body.getAll('checkpoints')
      : Array.isArray(body?.checkpoints)
        ? body.checkpoints
        : [body?.checkpoint]
  const requested = []
  const seen = new Set()
  for (const entry of rawEntries) {
    const name =
      typeof entry === 'string'
        ? safeTrim(entry)
        : entry && typeof entry === 'object'
          ? safeTrim(entry.name)
          : ''
    if (!name || seen.has(name)) {
      continue
    }

    const loras =
      entry && typeof entry === 'object' && Array.isArray(entry.loras)
        ? extractRequestedLoraEntries(entry.loras, defaultStrength)
        : []
    seen.add(name)
    requested.push({
      name,
      loras,
    })
  }
  return requested
}
export function appendTriggerWordsToPrompt(promptText, triggerWords) {
  const trimmedPrompt = safeTrim(promptText)
  const requestedTriggerWords = Array.isArray(triggerWords) ? triggerWords : []
  const existingSegmentKeys = new Set(
    trimmedPrompt
      .split(',')
      .map((segment) => segment.trim().toLowerCase().replace(/^\((.+):\s*\d+(?:\.\d+)?\)$/, '$1'))
      .filter(Boolean),
  )
  const formatted = []
  for (const triggerWord of requestedTriggerWords) {
    const word = safeTrim(triggerWord?.word ?? triggerWord)
    const key = word.toLowerCase()
    if (!word || existingSegmentKeys.has(key)) {
      continue
    }

    existingSegmentKeys.add(key)
    const weight = normalizeNumericField(triggerWord?.weight, 1)
    formatted.push(`(${word}:${Number.isInteger(weight) ? weight : weight.toFixed(1).replace(/\.0$/, '')})`)
  }

  if (!formatted.length) {
    return trimmedPrompt
  }

  return trimmedPrompt ? `${trimmedPrompt}, ${formatted.join(', ')}` : formatted.join(', ')
}
export function normalizeDimension(value, fallback) {
  const parsed = parseInteger(value)
  if (parsed === null) {
    return fallback
  }
  const clamped = clamp(parsed, 64, 16384)
  return Math.max(64, Math.round(clamped / 32) * 32)
}
export function normalizeCfg(value, fallback) {
  const parsed = parseFloatValue(value)
  if (parsed === null) {
    return fallback
  }
  return Math.round(clamp(parsed, 0, 30) * 100) / 100
}
export function normalizeDenoise(value, fallback) {
  const parsed = parseFloatValue(value)
  if (parsed === null) {
    return fallback
  }
  return Math.round(clamp(parsed, 0, 1) * 100) / 100
}
export function normalizeSeed(value) {
  const parsed = parseInteger(value)
  if (parsed === null || parsed < 0) {
    return Math.floor(Math.random() * maxSeed)
  }
  return clamp(parsed, 0, maxSeed)
}
export function isFileLike(value) {
  return typeof File === 'function' && value instanceof File
}
export function sanitizeFilename(value) {
  if (typeof value !== 'string') {
    return null
  }
  const trimmed = value.trim()
  if (!trimmed || trimmed.includes('/') || trimmed.includes('\\') || trimmed.includes('..')) {
    return null
  }
  return trimmed
}
export function sanitizeSubfolder(value) {
  if (typeof value !== 'string' || value === '') {
    return ''
  }
  if (value.includes('\\') || value.includes('..') || value.startsWith('/')) {
    return null
  }
  return value
}
export function resolveInsideRoot(rootPath, ...segments) {
  const normalizedRoot = normalize(resolve(rootPath))
  const resolvedPath = normalize(resolve(normalizedRoot, ...segments))
  const normalizedRootLower = normalizedRoot.toLowerCase()
  const resolvedPathLower = resolvedPath.toLowerCase()
  const rootPrefix = normalizedRootLower.endsWith(sep)
    ? normalizedRootLower
    : `${normalizedRootLower}${sep}`
  if (resolvedPathLower !== normalizedRootLower && !resolvedPathLower.startsWith(rootPrefix)) {
    return null
  }
  return resolvedPath
}
export function extractArgValue(argv, flag) {
  if (!Array.isArray(argv)) {
    return null
  }
  const index = argv.indexOf(flag)
  if (index === -1) {
    return null
  }
  const nextValue = argv[index + 1]
  return typeof nextValue === 'string' ? nextValue : null
}
export async function getComfyOutputDir() {
  if (comfyOutputDir) {
    return comfyOutputDir
  }
  const stats = await comfyFetchJson('/system_stats')
  const outputDirectory = extractArgValue(stats?.system?.argv, '--output-directory')
  if (!outputDirectory) {
    throw new Error('ComfyUI output directory could not be determined.')
  }
  comfyOutputDir = normalize(outputDirectory)
  return comfyOutputDir
}
export async function getComfyInputDir() {
  if (comfyInputDir) {
    return comfyInputDir
  }
  const stats = await comfyFetchJson('/system_stats')
  const inputDirectory = extractArgValue(stats?.system?.argv, '--input-directory')
  if (!inputDirectory) {
    throw new Error('ComfyUI input directory could not be determined.')
  }
  comfyInputDir = normalize(inputDirectory)
  return comfyInputDir
}
export async function getComfyLoraDir() {
  if (comfyLoraDir) {
    return comfyLoraDir
  }
  const candidateDirs = []
  try {
    candidateDirs.push(join(dirname(await getComfyInputDir()), 'models', 'loras'))
  } catch {}
  try {
    candidateDirs.push(join(dirname(await getComfyOutputDir()), 'models', 'loras'))
  } catch {}
  for (const candidate of candidateDirs) {
    if (!candidate) {
      continue
    }
    const normalizedCandidate = normalize(candidate)
    if (existsSync(normalizedCandidate)) {
      comfyLoraDir = normalizedCandidate
      return comfyLoraDir
    }
  }
  throw new Error('ComfyUI LoRA directory could not be determined.')
}
export async function getComfyCheckpointDir() {
  if (comfyCheckpointDir) {
    return comfyCheckpointDir
  }
  const candidateDirs = []
  try {
    candidateDirs.push(join(dirname(await getComfyInputDir()), 'models', 'checkpoints'))
  } catch {}
  try {
    candidateDirs.push(join(dirname(await getComfyOutputDir()), 'models', 'checkpoints'))
  } catch {}
  for (const candidate of candidateDirs) {
    if (!candidate) {
      continue
    }
    const normalizedCandidate = normalize(candidate)
    if (existsSync(normalizedCandidate)) {
      comfyCheckpointDir = normalizedCandidate
      return comfyCheckpointDir
    }
  }
  throw new Error('ComfyUI checkpoint directory could not be determined.')
}
export function resolveModelPath(rootPath, modelName) {
  const normalizedName = safeTrim(modelName).replace(/\\/g, '/')
  if (!normalizedName || normalizedName.startsWith('/') || normalizedName.includes('..')) {
    return null
  }
  const segments = normalizedName.split('/').filter(Boolean)
  if (!segments.length) {
    return null
  }
  return resolveInsideRoot(rootPath, ...segments)
}
export function normalizeTriggerWords(value) {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => normalizeTriggerWords(entry))
  }
  if (typeof value !== 'string') {
    return []
  }
  const trimmedValue = value.trim()
  if (!trimmedValue) {
    return []
  }
  if (
    (trimmedValue.startsWith('[') && trimmedValue.endsWith(']')) ||
    (trimmedValue.startsWith('{') && trimmedValue.endsWith('}'))
  ) {
    try {
      return normalizeTriggerWords(JSON.parse(trimmedValue))
    } catch {}
  }
  return trimmedValue
    .split(/[\r\n,|]+/g)
    .map((entry) => entry.trim())
    .filter(Boolean)
}
export function dedupeTriggerWords(values) {
  const seen = new Set()
  const triggerWords = []
  for (const value of values) {
    const normalizedValue = safeTrim(value)
    const key = normalizedValue.toLowerCase()
    if (!normalizedValue || seen.has(key)) {
      continue
    }
    seen.add(key)
    triggerWords.push(normalizedValue)
  }
  return triggerWords
}
export function extractTriggerWordsFromPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return []
  }
  const candidates = [
    payload.trainedWords,
    payload.triggerWords,
    payload.trigger_words,
    payload.activationText,
    payload.activation_text,
    payload['activation text'],
    payload.metadata?.trainedWords,
    payload.metadata?.triggerWords,
    payload.metadata?.trigger_words,
    payload.metadata?.activationText,
    payload.metadata?.activation_text,
    payload.model?.trainedWords,
    payload.model?.triggerWords,
    payload.modelVersion?.trainedWords,
    payload.modelVersion?.triggerWords,
  ]
  return dedupeTriggerWords(candidates.flatMap((candidate) => normalizeTriggerWords(candidate)))
}
export async function readJsonFileIfExists(filePath) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'))
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return null
    }
    return null
  }
}
export async function readSafetensorsMetadata(filePath) {
  const handle = await open(filePath, 'r')
  try {
    const sizeBuffer = Buffer.alloc(8)
    await handle.read(sizeBuffer, 0, 8, 0)
    const headerLength = Number(sizeBuffer.readBigUInt64LE(0))
    if (!Number.isFinite(headerLength) || headerLength <= 0 || headerLength > 8_000_000) {
      return null
    }
    const headerBuffer = Buffer.alloc(headerLength)
    await handle.read(headerBuffer, 0, headerLength, 8)
    const header = JSON.parse(headerBuffer.toString('utf8'))
    return header?.__metadata__ && typeof header.__metadata__ === 'object' ? header.__metadata__ : null
  } catch {
    return null
  } finally {
    await handle.close()
  }
}
export async function readLoraTriggerWords(loraName) {
  try {
    const loraDir = await getComfyLoraDir()
    const resolvedLoraPath = resolveModelPath(loraDir, loraName)
    if (!resolvedLoraPath) {
      return []
    }
    const sidecarCandidates = [
      `${resolvedLoraPath}.civitai.info`,
      `${resolvedLoraPath}.cm-info.json`,
      `${resolvedLoraPath}.json`,
      `${resolvedLoraPath.slice(0, -extname(resolvedLoraPath).length)}.civitai.info`,
      `${resolvedLoraPath.slice(0, -extname(resolvedLoraPath).length)}.cm-info.json`,
      `${resolvedLoraPath.slice(0, -extname(resolvedLoraPath).length)}.json`,
    ]
    for (const candidate of sidecarCandidates) {
      const payload = await readJsonFileIfExists(candidate)
      const triggerWords = extractTriggerWordsFromPayload(payload)
      if (triggerWords.length) {
        return triggerWords
      }
    }
    return extractTriggerWordsFromPayload(await readSafetensorsMetadata(resolvedLoraPath))
  } catch {
    return []
  }
}
export async function storeInputImageFile(imageFile) {
  const inputDirectory = await getComfyInputDir()
  await mkdir(inputDirectory, { recursive: true })
  const filenameExtension = extname(imageFile.name).toLowerCase()
  const extension = supportedImageExtensions.has(filenameExtension)
    ? filenameExtension
    : mimeExtensionMap.get(imageFile.type)
  if (!extension) {
    const error = new Error('Input image must be png, jpg, webp, or avif.')
    error.code = 'unsupported-image-type'
    throw error
  }
  const inputImageName = `companion-input-${Date.now()}-${randomUUID()}${extension}`
  const targetPath = resolveInsideRoot(inputDirectory, inputImageName)
  if (!targetPath) {
    throw new Error('Input image path resolved outside the ComfyUI input directory.')
  }
  await writeFile(targetPath, Buffer.from(await imageFile.arrayBuffer()))
  return inputImageName
}
export async function resolveStoredInputImageName(value) {
  const filename = sanitizeFilename(value)
  if (!filename) {
    return null
  }
  const inputDirectory = await getComfyInputDir()
  const targetPath = resolveInsideRoot(inputDirectory, filename)
  if (!targetPath) {
    return null
  }
  try {
    const fileStats = await stat(targetPath)
    return fileStats.isFile() ? filename : null
  } catch {
    return null
  }
}
export async function buildOutputFileMeta(image) {
  const outputDir = await getComfyOutputDir()
  const relativeSegments = image.subfolder ? [image.subfolder, image.filename] : [image.filename]
  const fullPath = resolveInsideRoot(outputDir, ...relativeSegments)
  if (!fullPath) {
    throw new Error('Output path resolved outside the ComfyUI output directory.')
  }
  return {
    fullPath,
    parentDirectory: dirname(fullPath),
  }
}
