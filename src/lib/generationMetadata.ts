export type GenerationMetadataFields = {
  prompt?: string
  negativePrompt?: string
  seed?: string
  steps?: string
  cfg?: string
  samplerName?: string
  scheduler?: string
  imageDenoise?: string
  width?: string
  height?: string
}

export type GenerationMetadataOptions = {
  samplerOptions?: string[]
  schedulerOptions?: string[]
}

type ClipboardPayload = {
  source?: string
  kind?: string
  version?: number
  fields?: Record<string, unknown>
}

const clipboardSource = 'comfyui-companion'
const clipboardKind = 'generation-metadata'

const samplerAliases = new Map([
  ['eulera', 'euler_ancestral'],
  ['eulerancestral', 'euler_ancestral'],
  ['dpmpp2m', 'dpmpp_2m'],
  ['dpm2m', 'dpmpp_2m'],
  ['dpmpp2msde', 'dpmpp_2m_sde'],
  ['dpmppsde', 'dpmpp_sde'],
  ['dpmpp3msde', 'dpmpp_3m_sde'],
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function stringifyValue(value: unknown) {
  if (typeof value === 'string') {
    return value.trim()
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }

  return ''
}

function firstValue(meta: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = stringifyValue(meta[key])
    if (value) {
      return value
    }
  }

  return ''
}

function normalizeOptionLabel(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\+\+/g, 'pp')
    .replace(/\+/g, 'p')
    .replace(/[^a-z0-9]+/g, '')
}

function optionByLooseMatch(value: string, options: string[] = []) {
  const normalizedValue = normalizeOptionLabel(value)
  if (!normalizedValue) {
    return ''
  }

  return options.find((option) => normalizeOptionLabel(option) === normalizedValue) ?? ''
}

function schedulerFromSampler(value: string, options: string[] = []) {
  const normalizedValue = normalizeOptionLabel(value)
  return [...options]
    .sort((left, right) => right.length - left.length)
    .find((option) => normalizedValue.includes(normalizeOptionLabel(option))) ?? ''
}

function normalizeSampler(value: string, options: string[] = [], scheduler = '') {
  const schedulerToken = scheduler ? normalizeOptionLabel(scheduler) : ''
  const normalizedValue = normalizeOptionLabel(value)
  const withoutScheduler = schedulerToken
    ? normalizedValue.replace(schedulerToken, '')
    : normalizedValue
  const direct = optionByLooseMatch(withoutScheduler, options) || optionByLooseMatch(value, options)
  if (direct) {
    return direct
  }

  const alias = samplerAliases.get(withoutScheduler) ?? samplerAliases.get(normalizedValue)
  return alias && options.includes(alias) ? alias : value.trim()
}

function normalizeNumberString(value: string) {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? String(parsed) : ''
}

function parseSize(meta: Record<string, unknown>) {
  const width = normalizeNumberString(firstValue(meta, ['width', 'Width']))
  const height = normalizeNumberString(firstValue(meta, ['height', 'Height']))
  if (width && height) {
    return { width, height }
  }

  const size = firstValue(meta, ['size', 'Size', 'resolution', 'Resolution'])
  const sizeMatch = size.match(/(\d{2,5})\s*[xX*]\s*(\d{2,5})/)
  return sizeMatch ? { width: sizeMatch[1], height: sizeMatch[2] } : {}
}

function normalizeFields(fields: Record<string, unknown>, options: GenerationMetadataOptions) {
  const schedulerValue = firstValue(fields, ['scheduler', 'Scheduler'])
  const samplerValue = firstValue(fields, ['samplerName', 'sampler_name', 'sampler', 'Sampler'])
  const scheduler = schedulerValue
    ? optionByLooseMatch(schedulerValue, options.schedulerOptions) || schedulerValue
    : schedulerFromSampler(samplerValue, options.schedulerOptions)
  const size = parseSize(fields)
  const result: GenerationMetadataFields = {}
  const entries: Array<[keyof GenerationMetadataFields, string]> = [
    ['prompt', firstValue(fields, ['prompt', 'Prompt'])],
    ['negativePrompt', firstValue(fields, ['negativePrompt', 'negative_prompt', 'Negative prompt', 'Negative Prompt'])],
    ['seed', normalizeNumberString(firstValue(fields, ['seed', 'Seed']))],
    ['steps', normalizeNumberString(firstValue(fields, ['steps', 'Steps']))],
    ['cfg', normalizeNumberString(firstValue(fields, ['cfg', 'cfgScale', 'cfg_scale', 'CFG scale', 'Cfg Scale']))],
    ['imageDenoise', normalizeNumberString(firstValue(fields, ['denoise', 'Denoise', 'Denoising strength', 'Denoising Strength']))],
    ['scheduler', scheduler],
    ['samplerName', samplerValue ? normalizeSampler(samplerValue, options.samplerOptions, scheduler) : ''],
    ['width', size.width ?? ''],
    ['height', size.height ?? ''],
  ]

  for (const [key, value] of entries) {
    if (value) {
      result[key] = value
    }
  }

  return result
}

export function extractGenerationMetadataFields(
  meta: Record<string, unknown> | null | undefined,
  options: GenerationMetadataOptions = {},
) {
  return isRecord(meta) ? normalizeFields(meta, options) : {}
}

export function serializeGenerationMetadataClipboard(
  meta: Record<string, unknown> | null | undefined,
  options: GenerationMetadataOptions = {},
) {
  return JSON.stringify({
    source: clipboardSource,
    kind: clipboardKind,
    version: 1,
    fields: extractGenerationMetadataFields(meta, options),
  })
}

export function parseGenerationMetadataClipboard(
  value: string,
  options: GenerationMetadataOptions = {},
) {
  try {
    const parsed = JSON.parse(value) as ClipboardPayload | Record<string, unknown>
    if (isRecord(parsed) && parsed.source === clipboardSource && parsed.kind === clipboardKind) {
      return normalizeFields(isRecord(parsed.fields) ? parsed.fields : {}, options)
    }

    return extractGenerationMetadataFields(parsed, options)
  } catch {
    return {}
  }
}
