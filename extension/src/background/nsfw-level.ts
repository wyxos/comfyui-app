type NsfwLevelSource = { nsfwLevel?: string | number | null }
type NsfwModelVersion = NsfwLevelSource & { images?: NsfwLevelSource[] }
type NsfwModel = NsfwLevelSource & { modelVersions?: NsfwModelVersion[] }

const NSFW_LEVEL_BITS = [32, 16, 8, 4, 2, 1] as const
const NSFW_LEVEL_ALIASES: Record<string, number> = {
  false: 0,
  none: 0,
  safe: 1,
  pg: 1,
  soft: 2,
  'pg-13': 2,
  pg13: 2,
  r: 4,
  mature: 7,
  x: 8,
  xxx: 16,
  blocked: 32,
  'not detected': 0,
  not_detected: 0,
}

function safeTrim(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeNsfwLevelNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value)
  }

  const normalized = safeTrim(value).toLowerCase()
  if (!normalized) {
    return null
  }

  const numericLevel = Number(normalized)
  if (Number.isFinite(numericLevel)) {
    return Math.trunc(numericLevel)
  }

  return NSFW_LEVEL_ALIASES[normalized] ?? null
}

function highestNsfwLevel(value: unknown): number | null {
  const level = normalizeNsfwLevelNumber(value)
  if (level === null) {
    return null
  }

  for (const bit of NSFW_LEVEL_BITS) {
    if ((level & bit) === bit) {
      return bit
    }
  }

  return level >= 4 ? level : 0
}

function nsfwLevelDetectedValue(value: unknown): boolean | null {
  const highestLevel = highestNsfwLevel(value)
  if (highestLevel === null) {
    return null
  }

  return highestLevel >= 4
}

export function modelHasNsfwContent(model: NsfwModel): boolean {
  const modelVersions = Array.isArray(model.modelVersions) ? model.modelVersions : []
  return [
    { nsfwLevel: model.nsfwLevel },
    ...modelVersions,
    ...modelVersions.flatMap((version) => Array.isArray(version.images) ? version.images : []),
  ].some((source) => nsfwLevelDetectedValue(source?.nsfwLevel) === true)
}
