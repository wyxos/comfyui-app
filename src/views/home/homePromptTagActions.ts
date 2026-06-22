import { PROMPT_SECTION_DEFINITIONS } from './homeConstants'
import type { HomeState } from './homeState'
import type {
  PromptSectionId,
  PromptSectionsState,
  PromptTag,
  PromptTagDropTarget,
  PromptTagLocation,
} from './homeTypes'
import { resolveCharacterHelperSection } from './prompt-assistant/promptSuggestionRouting'
import type { PromptSuggestion } from './prompt-assistant/promptSuggestionTypes'
import {
  buildPromptTag,
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
  return PROMPT_SECTION_DEFINITIONS.map((section) =>
    [
      ...(sections[section.id] ?? []),
      ...splitPromptDraft(drafts[section.id] ?? ''),
    ]
      .map(formatCompiledPromptTag)
      .filter(Boolean)
      .join(', '),
  )
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
  if (tag.enabled === false) {
    return ''
  }

  const text = normalizePromptTag(tag.text)
  if (!text) {
    return ''
  }

  const strength = formatPromptWeightInput(tag.strength)
  return isNeutralPromptWeight(strength) ? text : `(${text}:${strength})`
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
  prompt.value = ''
}

function clearNegativePromptTags() {
  negativePromptTags.value = []
  negativePromptDraft.value = ''
}

function getPromptTagListLocation(location: PromptTagDropTarget) {
  return location.field === 'section'
    ? { field: location.field, sectionId: location.sectionId } as const
    : { field: location.field } as const
}

function isSamePromptTagList(source: PromptTagLocation, target: PromptTagDropTarget) {
  if (source.field !== target.field) {
    return false
  }

  if (source.field === 'section' && target.field === 'section') {
    return source.sectionId === target.sectionId
  }

  return true
}

function getPromptTagList(location: PromptTagDropTarget) {
  return location.field === 'section'
    ? promptSections.value[location.sectionId] ?? []
    : negativePromptTags.value
}

function setPromptTagList(location: ReturnType<typeof getPromptTagListLocation>, tags: PromptTag[]) {
  if (location.field === 'section') {
    promptSections.value[location.sectionId] = tags
    return
  }

  negativePromptTags.value = tags
}

function appendTagsToPromptSection(sectionId: PromptSectionId, rawTags: string[]) {
  const existing = promptSections.value[sectionId] ?? []
  const seen = new Set(existing.map(getPromptTagKey))
  const nextTags = [...existing]

  for (const rawTag of rawTags) {
    const tag = buildPromptTag(rawTag)
    if (!tag) {
      continue
    }

    const key = getPromptTagKey(tag)
    if (seen.has(key)) {
      continue
    }

    seen.add(key)
    nextTags.push(tag)
  }

  promptSections.value[sectionId] = nextTags
}

function appendTagsToNegativePrompt(rawTags: string[]) {
  const seen = new Set(negativePromptTags.value.map(getPromptTagKey))
  const nextTags = [...negativePromptTags.value]

  for (const rawTag of rawTags) {
    const tag = buildPromptTag(rawTag)
    if (!tag) {
      continue
    }

    const key = getPromptTagKey(tag)
    if (seen.has(key)) {
      continue
    }

    seen.add(key)
    nextTags.push(tag)
  }

  negativePromptTags.value = nextTags
}

function applyCharacterHelperTags(rawTags: string[]) {
  const tagsBySection = new Map<PromptSectionId, string[]>()

  for (const rawTag of rawTags) {
    const sectionId = resolveCharacterHelperSection(rawTag)
    tagsBySection.set(sectionId, [...(tagsBySection.get(sectionId) ?? []), rawTag])
  }

  for (const [sectionId, sectionTags] of tagsBySection) {
    appendTagsToPromptSection(sectionId, sectionTags)
  }
}

function applyPromptSuggestion(sectionId: PromptSectionId, suggestion: PromptSuggestion) {
  appendTagsToPromptSection(sectionId, [suggestion.prompt])
  if (suggestion.kind === 'character' && suggestion.helperTags?.length) {
    applyCharacterHelperTags(suggestion.helperTags)
  }
  promptSectionDrafts.value[sectionId] = ''
  return true
}

function applyNegativePromptSuggestion(suggestion: PromptSuggestion) {
  appendTagsToNegativePrompt([suggestion.prompt])
  negativePromptDraft.value = ''
  return true
}

function clampPromptTagTargetIndex(index: number, length: number) {
  return Math.min(Math.max(index, 0), length)
}

function targetHasPromptTagDuplicate(
  targetTags: PromptTag[],
  tag: PromptTag,
  source: PromptTagLocation,
  target: PromptTagDropTarget,
) {
  const key = getPromptTagKey(tag)
  return targetTags.some((targetTag, targetIndex) => {
    if (isSamePromptTagList(source, target) && targetIndex === source.index) {
      return false
    }

    return getPromptTagKey(targetTag) === key
  })
}

function movePromptTag(source: PromptTagLocation, target: PromptTagDropTarget) {
  const sourceLocation = getPromptTagListLocation(source)
  const targetLocation = getPromptTagListLocation(target)
  const sourceTags = getPromptTagList(source)
  const tag = sourceTags[source.index]
  if (!tag) {
    return false
  }

  const sameList = isSamePromptTagList(source, target)
  const targetTags = sameList ? sourceTags : getPromptTagList(target)
  if (targetHasPromptTagDuplicate(targetTags, tag, source, target)) {
    return false
  }

  const sourceWithoutTag = sourceTags.filter((_, tagIndex) => tagIndex !== source.index)
  const rawTargetIndex = target.index ?? targetTags.length

  if (sameList) {
    const targetIndex = clampPromptTagTargetIndex(
      rawTargetIndex > source.index ? rawTargetIndex - 1 : rawTargetIndex,
      sourceWithoutTag.length,
    )
    const nextTags = [...sourceWithoutTag]
    nextTags.splice(targetIndex, 0, tag)
    setPromptTagList(sourceLocation, nextTags)
    return true
  }

  const targetIndex = clampPromptTagTargetIndex(rawTargetIndex, targetTags.length)
  const nextTargetTags = [...targetTags]
  nextTargetTags.splice(targetIndex, 0, tag)
  setPromptTagList(sourceLocation, sourceWithoutTag)
  setPromptTagList(targetLocation, nextTargetTags)
  return true
}

function updatePromptTagText(location: PromptTagLocation, text: string) {
  const listLocation = getPromptTagListLocation(location)
  const tags = getPromptTagList(location)
  const tag = tags[location.index]
  const nextText = normalizePromptTag(text)
  if (!tag || !nextText) {
    return false
  }

  const nextTag = { ...tag, text: nextText }
  if (targetHasPromptTagDuplicate(tags, nextTag, location, location)) {
    return false
  }

  const nextTags = [...tags]
  nextTags[location.index] = nextTag
  setPromptTagList(listLocation, nextTags)
  return true
}

function updatePromptSectionTagText(sectionId: PromptSectionId, index: number, text: string) {
  return updatePromptTagText({ field: 'section', sectionId, index }, text)
}

function updateNegativePromptTagText(index: number, text: string) {
  return updatePromptTagText({ field: 'negative', index }, text)
}

function setPromptTagEnabled(location: PromptTagLocation, enabled: boolean) {
  const listLocation = getPromptTagListLocation(location)
  const tags = getPromptTagList(location)
  const tag = tags[location.index]
  if (!tag) {
    return false
  }

  const tagWithoutEnabled = { ...tag }
  delete tagWithoutEnabled.enabled
  const nextTags = [...tags]
  nextTags[location.index] = enabled ? tagWithoutEnabled : { ...tagWithoutEnabled, enabled: false }
  setPromptTagList(listLocation, nextTags)
  return true
}

function togglePromptTagEnabled(location: PromptTagLocation) {
  const tag = getPromptTagList(location)[location.index]
  if (!tag) {
    return false
  }

  return setPromptTagEnabled(location, tag.enabled === false)
}

function togglePromptSectionTagEnabled(sectionId: PromptSectionId, index: number) {
  return togglePromptTagEnabled({ field: 'section', sectionId, index })
}

function toggleNegativePromptTagEnabled(index: number) {
  return togglePromptTagEnabled({ field: 'negative', index })
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
  hasPromptSectionDrafts,
  addPromptSectionTag,
  removePromptSectionTag,
  movePromptTag,
  applyPromptSuggestion,
  applyCharacterHelperTags,
  applyNegativePromptSuggestion,
  updatePromptSectionTagText,
  togglePromptSectionTagEnabled,
  clearPromptSectionTags,
  clearNegativePromptTags,
  setPromptSectionTagStrength,
  stepPromptSectionTagStrength,
  handlePromptSectionTagKeydown,
  handlePromptSectionTagInput,
  addNegativePromptTag,
  removeNegativePromptTag,
  updateNegativePromptTagText,
  toggleNegativePromptTagEnabled,
  setNegativePromptTagStrength,
  stepNegativePromptTagStrength,
  handleNegativePromptTagKeydown,
  handleNegativePromptTagInput,
}
}
