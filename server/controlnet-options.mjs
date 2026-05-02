import { clamp, parseFloatValue } from './civitai-query.mjs'
import { safeTrim } from './shared.mjs'

export const controlNetPreprocessorProfiles = [
  {
    id: 'none',
    label: 'Raw image',
    nodeType: null,
    defaultResolution: 512,
    inputs: {},
  },
  {
    id: 'canny',
    label: 'Canny edges',
    nodeType: 'CannyEdgePreprocessor',
    defaultResolution: 512,
    inputs: { low_threshold: 100, high_threshold: 200 },
  },
  {
    id: 'lineart',
    label: 'Line art',
    nodeType: 'LineArtPreprocessor',
    defaultResolution: 512,
    inputs: { coarse: 'disable' },
  },
  {
    id: 'anime-lineart',
    label: 'Anime line art',
    nodeType: 'AnimeLineArtPreprocessor',
    defaultResolution: 512,
    inputs: {},
  },
  {
    id: 'depth',
    label: 'Depth map',
    nodeType: 'MiDaS-DepthMapPreprocessor',
    defaultResolution: 512,
    inputs: { a: 6.283185307179586, bg_threshold: 0.1 },
  },
  {
    id: 'pose',
    label: 'OpenPose',
    nodeType: 'OpenposePreprocessor',
    defaultResolution: 512,
    inputs: {
      detect_hand: 'enable',
      detect_body: 'enable',
      detect_face: 'enable',
      scale_stick_for_xinsr_cn: 'disable',
    },
  },
  {
    id: 'tile',
    label: 'Tile',
    nodeType: 'TilePreprocessor',
    defaultResolution: 512,
    inputs: { pyrUp_iters: 3 },
  },
]

const controlNetPreprocessorProfilesById = new Map(
  controlNetPreprocessorProfiles.map((profile) => [profile.id, profile]),
)
const lineartPreprocessorIds = new Set(['lineart', 'anime-lineart'])

export function serializeControlNetPreprocessors() {
  return controlNetPreprocessorProfiles.map(({ id, label, defaultResolution }) => ({
    id,
    label,
    defaultResolution,
  }))
}

export function getControlNetPreprocessorProfile(value) {
  const id = safeTrim(value) || 'none'
  return controlNetPreprocessorProfilesById.get(id) ?? controlNetPreprocessorProfilesById.get('none')
}

export function normalizeControlNetLineartPolarity(value) {
  return safeTrim(value) === 'black-lines' ? 'black-lines' : 'white-lines'
}

export function shouldInvertControlNetLineart({ preprocessor, lineartPolarity } = {}) {
  const profile = getControlNetPreprocessorProfile(preprocessor)
  return lineartPreprocessorIds.has(profile?.id) &&
    normalizeControlNetLineartPolarity(lineartPolarity) === 'black-lines'
}

export function normalizeControlNetPreviewResolution(value, fallback = 512) {
  const parsed =
    typeof value === 'number' && Number.isFinite(value)
      ? value
      : Number.parseFloat(safeTrim(value))
  if (!Number.isFinite(parsed)) {
    return fallback
  }

  return Math.max(64, Math.round(clamp(parsed, 64, 16384) / 64) * 64)
}

function normalizeControlNetStrength(value) {
  const parsed = parseFloatValue(value)
  return Math.round(clamp(parsed ?? 1, 0, 10) * 1000) / 1000
}

function normalizeControlNetPercent(value, fallback) {
  const parsed = parseFloatValue(value)
  return Math.round(clamp(parsed ?? fallback, 0, 1) * 1000) / 1000
}

function normalizeControlNetEntry(entry) {
  const rawEntry = typeof entry === 'string' ? tryParseControlNetEntry(entry) : entry
  if (!rawEntry || typeof rawEntry !== 'object' || rawEntry.enabled === false) {
    return null
  }

  const model = safeTrim(rawEntry.model ?? rawEntry.name ?? rawEntry.controlNetName)
  const inputImageName = safeTrim(
    rawEntry.inputImageName ?? rawEntry.imageName ?? rawEntry.image,
  )
  const startPercent = normalizeControlNetPercent(
    rawEntry.startPercent ?? rawEntry.start_percent,
    0,
  )
  const endPercent = Math.max(
    startPercent,
    normalizeControlNetPercent(rawEntry.endPercent ?? rawEntry.end_percent, 1),
  )

  return {
    id: safeTrim(rawEntry.id),
    model,
    inputImageName,
    preprocessor: getControlNetPreprocessorProfile(rawEntry.preprocessor)?.id ?? 'none',
    lineartPolarity: normalizeControlNetLineartPolarity(
      rawEntry.lineartPolarity ?? rawEntry.lineart_polarity,
    ),
    previewResolution: normalizeControlNetPreviewResolution(rawEntry.previewResolution),
    strength: normalizeControlNetStrength(rawEntry.strength),
    startPercent,
    endPercent,
  }
}

function tryParseControlNetEntry(value) {
  const trimmed = safeTrim(value)
  if (!trimmed) {
    return null
  }

  try {
    return JSON.parse(trimmed)
  } catch {
    return { model: trimmed }
  }
}

export function extractRequestedControlNets(body) {
  const rawEntries =
    body instanceof FormData
      ? body.getAll('controlNets')
      : Array.isArray(body?.controlNets)
        ? body.controlNets
        : []

  return rawEntries.map(normalizeControlNetEntry).filter(Boolean)
}
