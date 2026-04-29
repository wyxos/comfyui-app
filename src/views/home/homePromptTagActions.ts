import { PROMPT_SECTION_DEFINITIONS } from './homeConstants'
import type { HomeState } from './homeState'
import type { PromptSectionId, PromptSectionsState, PromptTag } from './homeTypes'
import {
  formatPromptWeight,
  formatPromptWeightInput,
  getPromptTagKey,
  hasPromptDraftDelimiter,
  isNeutralPromptWeight,
  normalizePromptTag,
  normalizePromptTags,
  splitPromptDraft,
  stepPromptWeight,
} from './homeValueHelpers'

export function createHomePromptTagActions(state: HomeState) {
const {
  improvedPrompt,
  negativePromptDraft,
  negativePromptTags,
  prompt,
  promptSectionDrafts,
  promptSections,
} = state

function buildPromptFromSections(
  sections: PromptSectionsState,
  drafts: Partial<Record<PromptSectionId, string>> = {},
) {
  return PROMPT_SECTION_DEFINITIONS.flatMap((section) => [
    ...(sections[section.id] ?? []),
    ...splitPromptDraft(drafts[section.id] ?? ''),
  ])
    .map(formatCompiledPromptTag)
    .filter(Boolean)
    .join(', ')
}

function buildNegativePromptFromTags(includeDraft = false) {
  const tags = includeDraft
    ? [...negativePromptTags.value, ...splitPromptDraft(negativePromptDraft.value)]
    : negativePromptTags.value

  return tags.map(formatCompiledPromptTag).filter(Boolean).join(', ')
}

function buildPromptSectionsForPersistence() {
  return PROMPT_SECTION_DEFINITIONS.reduce((sections, section) => {
    sections[section.id] = normalizePromptTags([
      ...(promptSections.value[section.id] ?? []),
      ...splitPromptDraft(promptSectionDrafts.value[section.id] ?? ''),
    ])
    return sections
  }, {} as Record<PromptSectionId, PromptTag[]>)
}

function formatCompiledPromptTag(tag: PromptTag) {
  const text = normalizePromptTag(tag.text)
  if (!text) {
    return ''
  }

  const strength = formatPromptWeightInput(tag.strength)
  return isNeutralPromptWeight(strength) ? text : `(${text}:${strength})`
}

function buildPromptForImprovement() {
  return buildPromptFromSections(promptSections.value, promptSectionDrafts.value) || prompt.value.trim()
}

function buildImprovedPromptForGeneration() {
  return improvedPrompt.value.trim()
}

function hasPromptSectionDrafts() {
  return PROMPT_SECTION_DEFINITIONS.some((section) => Boolean(promptSectionDrafts.value[section.id].trim()))
}

function addPromptSectionTag(sectionId: PromptSectionId) {
  const draft = promptSectionDrafts.value[sectionId] ?? ''
  const tags = splitPromptDraft(draft)
  if (!tags.length) {
    promptSectionDrafts.value[sectionId] = ''
    return
  }

  const existing = promptSections.value[sectionId] ?? []
  const seen = new Set(existing.map(getPromptTagKey))
  promptSections.value[sectionId] = [
    ...existing,
    ...tags.filter((tag) => {
      const key = getPromptTagKey(tag)
      if (seen.has(key)) {
        return false
      }

      seen.add(key)
      return true
    }),
  ]
  promptSectionDrafts.value[sectionId] = ''
}

function removePromptSectionTag(sectionId: PromptSectionId, index: number) {
  promptSections.value[sectionId] = (promptSections.value[sectionId] ?? []).filter((_, tagIndex) => tagIndex !== index)
}

function clearPromptSectionTags(sectionId?: PromptSectionId) {
  if (sectionId) {
    promptSections.value[sectionId] = []
    promptSectionDrafts.value[sectionId] = ''
    return
  }

  for (const section of PROMPT_SECTION_DEFINITIONS) {
    promptSections.value[section.id] = []
    promptSectionDrafts.value[section.id] = ''
  }
}

function clearNegativePromptTags() {
  negativePromptTags.value = []
  negativePromptDraft.value = ''
}

function setPromptSectionTagStrength(sectionId: PromptSectionId, index: number, strength: string) {
  const tag = promptSections.value[sectionId]?.[index]
  if (tag) {
    tag.strength = formatPromptWeightInput(strength)
  }
}

function stepPromptSectionTagStrength(sectionId: PromptSectionId, index: number, direction: 1 | -1) {
  const tag = promptSections.value[sectionId]?.[index]
  if (!tag) {
    return
  }

  const currentStrength = Number.parseFloat(tag.strength) || 1
  tag.strength = formatPromptWeight(stepPromptWeight(currentStrength, direction))
}

function handlePromptSectionTagKeydown(event: KeyboardEvent, sectionId: PromptSectionId) {
  if (event.key === 'Enter' || event.key === ',') {
    event.preventDefault()
    addPromptSectionTag(sectionId)
    return
  }

  if (event.key !== 'Backspace' || promptSectionDrafts.value[sectionId]) {
    return
  }

  const tags = promptSections.value[sectionId] ?? []
  if (tags.length) {
    promptSections.value[sectionId] = tags.slice(0, -1)
  }
}

function handlePromptSectionTagInput(sectionId: PromptSectionId) {
  if (hasPromptDraftDelimiter(promptSectionDrafts.value[sectionId] ?? '')) {
    addPromptSectionTag(sectionId)
  }
}

function addNegativePromptTag() {
  const tags = splitPromptDraft(negativePromptDraft.value)
  if (!tags.length) {
    negativePromptDraft.value = ''
    return
  }

  const seen = new Set(negativePromptTags.value.map(getPromptTagKey))
  negativePromptTags.value = [
    ...negativePromptTags.value,
    ...tags.filter((tag) => {
      const key = getPromptTagKey(tag)
      if (seen.has(key)) {
        return false
      }

      seen.add(key)
      return true
    }),
  ]
  negativePromptDraft.value = ''
}

function removeNegativePromptTag(index: number) {
  negativePromptTags.value = negativePromptTags.value.filter((_, tagIndex) => tagIndex !== index)
}

function setNegativePromptTagStrength(index: number, strength: string) {
  const tag = negativePromptTags.value[index]
  if (tag) {
    tag.strength = formatPromptWeightInput(strength)
  }
}

function stepNegativePromptTagStrength(index: number, direction: 1 | -1) {
  const tag = negativePromptTags.value[index]
  if (!tag) {
    return
  }

  const currentStrength = Number.parseFloat(tag.strength) || 1
  tag.strength = formatPromptWeight(stepPromptWeight(currentStrength, direction))
}

function handleNegativePromptTagKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' || event.key === ',') {
    event.preventDefault()
    addNegativePromptTag()
    return
  }

  if (event.key === 'Backspace' && !negativePromptDraft.value && negativePromptTags.value.length) {
    negativePromptTags.value = negativePromptTags.value.slice(0, -1)
  }
}

function handleNegativePromptTagInput() {
  if (hasPromptDraftDelimiter(negativePromptDraft.value)) {
    addNegativePromptTag()
  }
}

return {
  buildPromptFromSections,
  buildNegativePromptFromTags,
  buildPromptSectionsForPersistence,
  formatCompiledPromptTag,
  buildPromptForImprovement,
  buildImprovedPromptForGeneration,
  hasPromptSectionDrafts,
  addPromptSectionTag,
  removePromptSectionTag,
  clearPromptSectionTags,
  clearNegativePromptTags,
  setPromptSectionTagStrength,
  stepPromptSectionTagStrength,
  handlePromptSectionTagKeydown,
  handlePromptSectionTagInput,
  addNegativePromptTag,
  removeNegativePromptTag,
  setNegativePromptTagStrength,
  stepNegativePromptTagStrength,
  handleNegativePromptTagKeydown,
  handleNegativePromptTagInput,
}
}
