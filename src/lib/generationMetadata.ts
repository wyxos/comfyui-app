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
  clipSkip?: string
  vaeName?: string
  hiresEnabled?: boolean
  hiresUpscale?: string
  hiresWidth?: string
  hiresHeight?: string
  hiresSteps?: string
  hiresCfg?: string
  hiresDenoise?: string
  hiresUpscaler?: string
  hiresSamplerName?: string
  hiresScheduler?: string
  modelName?: string
  modelHash?: string
  vaeHash?: string
  sourceVaeName?: string
  sourceHiresUpscaler?: string
}

export type GenerationMetadataOptions = {
  samplerOptions?: string[]
  schedulerOptions?: string[]
  vaeOptions?: string[]
  upscaleModelOptions?: string[]
}

type StringGenerationMetadataField = Exclude<keyof GenerationMetadataFields, 'hiresEnabled'>

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

const schedulerAliases = new Map([
  ['automatic', 'normal'],
  ['normal', 'normal'],
  ['karras', 'karras'],
  ['exponential', 'exponential'],
  ['sgmuniform', 'sgm_uniform'],
  ['simple', 'simple'],
  ['ddimuniform', 'ddim_uniform'],
  ['beta', 'beta'],
  ['linearquadratic', 'linear_quadratic'],
  ['kloptimal', 'kl_optimal'],
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

function stripModelExtension(value: string) {
  return value.replace(/\.(safetensors|ckpt|pt|pth|bin)$/i, '')
}

function normalizeModelOptionLabel(value: string) {
  const filename = value.trim().replace(/\\/g, '/').split('/').pop() ?? ''
  return normalizeOptionLabel(stripModelExtension(filename))
}

function optionByModelNameMatch(value: string, options: string[] = []) {
  const direct = optionByLooseMatch(value, options)
  if (direct) {
    return direct
  }

  const normalizedValue = normalizeModelOptionLabel(value)
  return normalizedValue
    ? options.find((option) => normalizeModelOptionLabel(option) === normalizedValue) ?? ''
    : ''
}

function schedulerFromSampler(value: string, options: string[] = []) {
  const normalizedValue = normalizeOptionLabel(value)
  return [...options]
    .sort((left, right) => right.length - left.length)
    .find((option) => normalizedValue.includes(normalizeOptionLabel(option))) ?? ''
}

function normalizeScheduler(value: string, options: string[] = []) {
  const direct = optionByLooseMatch(value, options)
  if (direct) {
    return direct
  }

  const alias = schedulerAliases.get(normalizeOptionLabel(value))
  return alias && (!options.length || options.includes(alias)) ? alias : value.trim()
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

function parseSizeValue(value: string) {
  const sizeMatch = value.match(/(\d{2,5})\s*[xX*]\s*(\d{2,5})/)
  return sizeMatch ? { width: sizeMatch[1], height: sizeMatch[2] } : {}
}

function parseSize(meta: Record<string, unknown>, widthKeys: string[], heightKeys: string[], sizeKeys: string[]) {
  const width = normalizeNumberString(firstValue(meta, widthKeys))
  const height = normalizeNumberString(firstValue(meta, heightKeys))
  if (width && height) {
    return { width, height }
  }

  const size = firstValue(meta, sizeKeys)
  return size ? parseSizeValue(size) : {}
}

function parseBaseSize(meta: Record<string, unknown>) {
  return parseSize(
    meta,
    ['width', 'Width'],
    ['height', 'Height'],
    ['size', 'Size', 'resolution', 'Resolution', 'Original Size', 'originalSize'],
  )
}

function parseHiresSize(meta: Record<string, unknown>) {
  return parseSize(
    meta,
    ['Hires width', 'hiresWidth', 'Hires Width'],
    ['Hires height', 'hiresHeight', 'Hires Height'],
    ['Hires resize', 'Hires resize to', 'Hires size', 'Hires Size', 'hiresSize'],
  )
}

function scaledSize(size: { width?: string; height?: string }, scaleValue: string) {
  const scale = Number.parseFloat(scaleValue)
  const width = Number.parseFloat(size.width ?? '')
  const height = Number.parseFloat(size.height ?? '')
  if (!Number.isFinite(scale) || !Number.isFinite(width) || !Number.isFinite(height) || scale <= 0) {
    return {}
  }

  return {
    width: String(Math.round(width * scale)),
    height: String(Math.round(height * scale)),
  }
}

function firstHashFromValue(value: unknown) {
  if (typeof value === 'string' || typeof value === 'number') {
    return stringifyValue(value)
  }

  if (!isRecord(value)) {
    return ''
  }

  return firstValue(value, [
    'model',
    'Model',
    'SHA256',
    'sha256',
    'AutoV2',
    'autov2',
    'AutoV3',
    'autov3',
    'CRC32',
    'crc32',
  ])
}

function firstResourceModel(meta: Record<string, unknown>) {
  const resources = Array.isArray(meta.resources) ? meta.resources : []
  for (const resource of resources) {
    if (!isRecord(resource)) {
      continue
    }

    const type = stringifyValue(resource.type ?? resource.modelType).toLowerCase()
    if (type && !['model', 'checkpoint'].includes(type)) {
      continue
    }

    return {
      name: firstValue(resource, ['name', 'modelName', 'model']),
      hash: firstHashFromValue(resource.hashes ?? resource.hash ?? resource.modelHash),
    }
  }

  return { name: '', hash: '' }
}

function isSameChoices(value: string) {
  return normalizeOptionLabel(value) === 'usesamechoices'
}

function normalizeFields(fields: Record<string, unknown>, options: GenerationMetadataOptions) {
  const schedulerValue = firstValue(fields, ['scheduler', 'Scheduler', 'Schedule type', 'Schedule Type'])
  const samplerValue = firstValue(fields, ['samplerName', 'sampler_name', 'sampler', 'Sampler'])
  const scheduler = schedulerValue
    ? normalizeScheduler(schedulerValue, options.schedulerOptions)
    : schedulerFromSampler(samplerValue, options.schedulerOptions)
  const size = parseBaseSize(fields)
  const hiresUpscale = normalizeNumberString(firstValue(fields, ['Hires upscale', 'Hires Upscale', 'hiresUpscale']))
  const parsedHiresSize = parseHiresSize(fields)
  const hiresSize = parsedHiresSize.width && parsedHiresSize.height
    ? parsedHiresSize
    : scaledSize(size, hiresUpscale)
  const hiresSamplerValue = firstValue(fields, ['Hires sampler', 'Hires Sampler', 'hiresSampler'])
  const hiresSchedulerValue =
    firstValue(fields, ['Hires schedule type', 'Hires Schedule type', 'Hires scheduler', 'hiresScheduler']) ||
    schedulerValue
  const sourceVaeName = firstValue(fields, ['vaeName', 'vae_name', 'VAE', 'Vae'])
  const sourceHiresUpscaler = firstValue(fields, [
    'Hires upscaler',
    'Hires Upscaler',
    'Hires Module 1',
    'hiresUpscaler',
  ])
  const resourcesModel = firstResourceModel(fields)
  const modelName = firstValue(fields, ['Model', 'modelName', 'model']) || resourcesModel.name
  const modelHash =
    firstValue(fields, ['Model hash', 'Model Hash', 'modelHash', 'model_hash']) ||
    firstHashFromValue(fields.hashes) ||
    resourcesModel.hash
  const vaeHash = firstValue(fields, ['VAE hash', 'VAE Hash', 'vaeHash', 'vae_hash'])
  const hiresDenoise = normalizeNumberString(firstValue(fields, ['Hires denoising strength', 'Denoising strength', 'Denoising Strength']))
  const hiresEnabled = Boolean(
    hiresUpscale ||
      hiresSize.width ||
      firstValue(fields, ['Hires steps', 'Hires Steps', 'hiresSteps']) ||
      firstValue(fields, ['Hires CFG Scale', 'Hires CFG scale', 'hiresCfg']) ||
      sourceHiresUpscaler,
  )
  const result: GenerationMetadataFields = {}
  const entries: Array<[StringGenerationMetadataField, string]> = [
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
    ['clipSkip', normalizeNumberString(firstValue(fields, ['clipSkip', 'Clip skip', 'Clip Skip']))],
    ['vaeName', sourceVaeName ? optionByModelNameMatch(sourceVaeName, options.vaeOptions) : ''],
    ['hiresUpscale', hiresUpscale],
    ['hiresWidth', hiresSize.width ?? ''],
    ['hiresHeight', hiresSize.height ?? ''],
    ['hiresSteps', normalizeNumberString(firstValue(fields, ['Hires steps', 'Hires Steps', 'hiresSteps']))],
    ['hiresCfg', normalizeNumberString(firstValue(fields, ['Hires CFG Scale', 'Hires CFG scale', 'hiresCfg']))],
    ['hiresDenoise', hiresEnabled ? hiresDenoise : ''],
    [
      'hiresUpscaler',
      sourceHiresUpscaler && !isSameChoices(sourceHiresUpscaler)
        ? optionByModelNameMatch(sourceHiresUpscaler, options.upscaleModelOptions)
        : '',
    ],
    [
      'hiresSamplerName',
      hiresSamplerValue && !isSameChoices(hiresSamplerValue)
        ? normalizeSampler(hiresSamplerValue, options.samplerOptions, scheduler)
        : '',
    ],
    [
      'hiresScheduler',
      hiresEnabled && hiresSchedulerValue
        ? normalizeScheduler(hiresSchedulerValue, options.schedulerOptions)
        : '',
    ],
    ['modelName', modelName],
    ['modelHash', modelHash],
    ['vaeHash', vaeHash],
    ['sourceVaeName', sourceVaeName],
    ['sourceHiresUpscaler', sourceHiresUpscaler],
  ]

  for (const [key, value] of entries) {
    if (value) {
      result[key] = value
    }
  }

  if (hiresEnabled) {
    result.hiresEnabled = true
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
