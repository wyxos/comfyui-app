// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'

import { createHomePromptTagActions } from '../../src/views/home/homePromptTagActions'
import { createHomeState } from '../../src/views/home/homeState'

describe('home prompt tags', () => {
  it('splits prompt section drafts into tags as soon as a delimiter appears', () => {
    const state = createHomeState()
    const actions = createHomePromptTagActions(state)

    state.promptSectionDrafts.value.subject = 'blue hair, red eyes, blue hair'
    actions.handlePromptSectionTagInput('subject')

    expect(state.promptSections.value.subject.map((tag) => tag.text)).toEqual(['blue hair', 'red eyes'])
    expect(state.promptSectionDrafts.value.subject).toBe('')
  })

  it('splits negative prompt drafts into tags as soon as a delimiter appears', () => {
    const state = createHomeState()
    const actions = createHomePromptTagActions(state)

    state.negativePromptDraft.value = 'blur, bad hands, text'
    actions.handleNegativePromptTagInput()

    expect(state.negativePromptTags.value.map((tag) => tag.text)).toEqual(['blur', 'bad hands', 'text'])
    expect(state.negativePromptDraft.value).toBe('')
  })

  it('leaves unfinished drafts alone until a delimiter is entered', () => {
    const state = createHomeState()
    const actions = createHomePromptTagActions(state)

    state.promptSectionDrafts.value.subject = 'cinematic portrait'
    actions.handlePromptSectionTagInput('subject')

    expect(state.promptSections.value.subject).toEqual([])
    expect(state.promptSectionDrafts.value.subject).toBe('cinematic portrait')
  })

  it('supports an others prompt section for extra tags', () => {
    const state = createHomeState()
    const actions = createHomePromptTagActions(state)

    state.promptSectionDrafts.value.others = 'subtle detail, atmospheric haze'
    actions.handlePromptSectionTagInput('others')

    expect(state.promptSections.value.others.map((tag) => tag.text)).toEqual(['subtle detail', 'atmospheric haze'])
    expect(state.promptSectionDrafts.value.others).toBe('')
  })

  it('clears all prompt section tags and drafts without touching negative tags', () => {
    const state = createHomeState()
    const actions = createHomePromptTagActions(state)

    state.promptSections.value.subject = [{ text: 'test', strength: '1' }]
    state.promptSections.value.others = [{ text: 'extra detail', strength: '1' }]
    state.promptSectionDrafts.value.details = 'unfinished detail'
    state.negativePromptTags.value = [{ text: 'blur', strength: '1' }]

    actions.clearPromptSectionTags()

    expect(state.promptSections.value.subject).toEqual([])
    expect(state.promptSections.value.others).toEqual([])
    expect(state.promptSectionDrafts.value.details).toBe('')
    expect(state.negativePromptTags.value).toEqual([{ text: 'blur', strength: '1' }])
  })

  it('clears one prompt section without touching the others', () => {
    const state = createHomeState()
    const actions = createHomePromptTagActions(state)

    state.promptSections.value.subject = [{ text: 'test', strength: '1' }]
    state.promptSections.value.others = [{ text: 'extra detail', strength: '1' }]
    state.promptSectionDrafts.value.subject = 'draft subject'
    state.promptSectionDrafts.value.others = 'draft others'

    actions.clearPromptSectionTags('subject')

    expect(state.promptSections.value.subject).toEqual([])
    expect(state.promptSectionDrafts.value.subject).toBe('')
    expect(state.promptSections.value.others).toEqual([{ text: 'extra detail', strength: '1' }])
    expect(state.promptSectionDrafts.value.others).toBe('draft others')
  })

  it('clears negative prompt tags and draft', () => {
    const state = createHomeState()
    const actions = createHomePromptTagActions(state)

    state.negativePromptTags.value = [{ text: 'blur', strength: '1' }]
    state.negativePromptDraft.value = 'unfinished negative'

    actions.clearNegativePromptTags()

    expect(state.negativePromptTags.value).toEqual([])
    expect(state.negativePromptDraft.value).toBe('')
  })

  it('moves prompt section tags to the negative prompt while preserving weight', () => {
    const state = createHomeState()
    const actions = createHomePromptTagActions(state)

    state.promptSections.value.subject = [
      { text: 'blue hair', strength: '1.2' },
      { text: 'red eyes', strength: '1' },
    ]
    state.negativePromptTags.value = [{ text: 'blur', strength: '1' }]

    expect(actions.movePromptTag(
      { field: 'section', sectionId: 'subject', index: 0 },
      { field: 'negative', index: 0 },
    )).toBe(true)

    expect(state.promptSections.value.subject.map((tag) => tag.text)).toEqual(['red eyes'])
    expect(state.negativePromptTags.value).toEqual([
      { text: 'blue hair', strength: '1.2' },
      { text: 'blur', strength: '1' },
    ])
  })

  it('moves negative prompt tags into prompt sections', () => {
    const state = createHomeState()
    const actions = createHomePromptTagActions(state)

    state.promptSections.value.details = [{ text: 'looking away', strength: '1' }]
    state.negativePromptTags.value = [
      { text: 'bad hands', strength: '1.4' },
      { text: 'text', strength: '1' },
    ]

    expect(actions.movePromptTag(
      { field: 'negative', index: 0 },
      { field: 'section', sectionId: 'details', index: 1 },
    )).toBe(true)

    expect(state.negativePromptTags.value.map((tag) => tag.text)).toEqual(['text'])
    expect(state.promptSections.value.details).toEqual([
      { text: 'looking away', strength: '1' },
      { text: 'bad hands', strength: '1.4' },
    ])
  })

  it('reorders tags within the same prompt field', () => {
    const state = createHomeState()
    const actions = createHomePromptTagActions(state)

    state.promptSections.value.quality = [
      { text: 'sharp focus', strength: '1' },
      { text: 'high detail', strength: '1' },
      { text: 'clean lines', strength: '1' },
    ]

    expect(actions.movePromptTag(
      { field: 'section', sectionId: 'quality', index: 2 },
      { field: 'section', sectionId: 'quality', index: 0 },
    )).toBe(true)

    expect(state.promptSections.value.quality.map((tag) => tag.text)).toEqual([
      'clean lines',
      'sharp focus',
      'high detail',
    ])
  })

  it('renames tags without changing weight', () => {
    const state = createHomeState()
    const actions = createHomePromptTagActions(state)

    state.promptSections.value.subject = [{ text: 'blue hair', strength: '1.3' }]
    state.negativePromptTags.value = [{ text: 'blur', strength: '1.1' }]

    expect(actions.updatePromptSectionTagText('subject', 0, '  purple   hair  ')).toBe(true)
    expect(actions.updateNegativePromptTagText(0, 'bad anatomy')).toBe(true)

    expect(state.promptSections.value.subject).toEqual([{ text: 'purple hair', strength: '1.3' }])
    expect(state.negativePromptTags.value).toEqual([{ text: 'bad anatomy', strength: '1.1' }])
  })

  it('toggles prompt tags out of compiled prompts without deleting them', () => {
    const state = createHomeState()
    const actions = createHomePromptTagActions(state)

    state.promptSections.value.subject = [
      { text: 'blue hair', strength: '1' },
      { text: 'red eyes', strength: '1.2' },
    ]
    state.negativePromptTags.value = [
      { text: 'blur', strength: '1' },
      { text: 'text', strength: '1' },
    ]

    expect(actions.togglePromptSectionTagEnabled('subject', 0)).toBe(true)
    expect(actions.toggleNegativePromptTagEnabled(0)).toBe(true)

    expect(state.promptSections.value.subject[0]).toEqual({ text: 'blue hair', strength: '1', enabled: false })
    expect(state.negativePromptTags.value[0]).toEqual({ text: 'blur', strength: '1', enabled: false })
    expect(actions.buildPromptFromSections(state.promptSections.value)).toBe('(red eyes:1.2)')
    expect(actions.buildNegativePromptFromTags()).toBe('text')
    expect(actions.buildPromptSectionsForPersistence().subject[0]).toEqual({
      text: 'blue hair',
      strength: '1',
      enabled: false,
    })

    expect(actions.togglePromptSectionTagEnabled('subject', 0)).toBe(true)

    expect(state.promptSections.value.subject[0]).toEqual({ text: 'blue hair', strength: '1' })
    expect(actions.buildPromptFromSections(state.promptSections.value)).toBe('blue hair, (red eyes:1.2)')
  })

  it('does not move or rename tags into duplicates', () => {
    const state = createHomeState()
    const actions = createHomePromptTagActions(state)

    state.promptSections.value.subject = [
      { text: 'blue hair', strength: '1' },
      { text: 'red eyes', strength: '1' },
    ]
    state.negativePromptTags.value = [{ text: 'blue hair', strength: '1' }]

    expect(actions.movePromptTag(
      { field: 'section', sectionId: 'subject', index: 0 },
      { field: 'negative' },
    )).toBe(false)
    expect(actions.updatePromptSectionTagText('subject', 1, 'blue hair')).toBe(false)

    expect(state.promptSections.value.subject.map((tag) => tag.text)).toEqual(['blue hair', 'red eyes'])
    expect(state.negativePromptTags.value.map((tag) => tag.text)).toEqual(['blue hair'])
  })
})
