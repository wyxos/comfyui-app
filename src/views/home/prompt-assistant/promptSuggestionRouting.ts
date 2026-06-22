import type { PromptSectionId } from '../homeTypes'

type CharacterHelperSectionRule = {
  sectionId: PromptSectionId
  pattern: RegExp
}

const CHARACTER_HELPER_SECTION_RULES: CharacterHelperSectionRule[] = [
  {
    sectionId: 'environment',
    pattern: /\b(background|outdoors?|indoors?|sky|cloud|city|forest|beach|room|street|school|garden|landscape|scenery|water|ocean|mountain|rooftop)\b/,
  },
  {
    sectionId: 'lighting',
    pattern: /\b(light|lighting|shadow|backlight|rim|glow|sunlight|moonlight|neon|ambient)\b/,
  },
  {
    sectionId: 'style',
    pattern: /\b(style|medium|monochrome|greyscale|comic|pixel|realistic|photo|painting|anime|chibi|sketch|watercolor|lineart)\b/,
  },
  {
    sectionId: 'quality',
    pattern: /\b(highres|absurdres|masterpiece|quality|detailed|official art|sharp focus)\b/,
  },
  {
    sectionId: 'details',
    pattern: /\b(eye|eyes|hair|face|hand|hands|pose|clothes|dress|shirt|skirt|weapon|expression|smile|twintails|ponytail|braid|bangs|jacket|uniform|coat|hat|gloves|boots|socks|ears|tail|wings|horns|accessory|looking|standing|sitting|holding)\b/,
  },
]

function normalizeHelperTag(value: string) {
  return value.trim().replace(/[_\s]+/g, ' ').toLowerCase()
}

export function resolveCharacterHelperSection(rawTag: string): PromptSectionId {
  const tag = normalizeHelperTag(rawTag)
  const rule = CHARACTER_HELPER_SECTION_RULES.find(({ pattern }) => pattern.test(tag))

  return rule?.sectionId ?? 'others'
}
