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
})
