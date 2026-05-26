import { open, readFile } from 'node:fs/promises'
import { extname } from 'node:path'
import { safeTrim } from './shared.mjs'
import { getComfyLoraDir, resolveModelPath } from './model-paths.mjs'

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
    const sidecarBasePath = resolvedLoraPath.slice(0, -extname(resolvedLoraPath).length)
    const sidecarCandidates = [
      `${resolvedLoraPath}.civitai.info`,
      `${resolvedLoraPath}.cm-info.json`,
      `${resolvedLoraPath}.json`,
      `${sidecarBasePath}.civitai.info`,
      `${sidecarBasePath}.cm-info.json`,
      `${sidecarBasePath}.json`,
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
