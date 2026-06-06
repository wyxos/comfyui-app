import {
  createEmptyPromptSections,
  createEmptyPromptSectionsDrafts,
} from './homeConstants'
import type { HomeSelectionComputed } from './homeSelectionComputed'
import type { HomeState } from './homeState'
import type { PromptMode } from './homeTypes'
import { splitPromptDraft } from './homeValueHelpers'

export function createHomePromptModeActions(state: HomeState, selection: HomeSelectionComputed) {
let promptTextSnapshot = ''
let negativePromptTextSnapshot = ''

function setPromptMode(mode: PromptMode) {
  if (state.promptMode.value === mode) {
    return
  }

  if (mode === 'text') {
    promptTextSnapshot = selection.compiledPrompt.value
    negativePromptTextSnapshot = selection.compiledNegativePrompt.value
    state.prompt.value = promptTextSnapshot
    state.negativePrompt.value = negativePromptTextSnapshot
    state.promptMode.value = mode
    return
  }

  if (
    state.prompt.value.trim() === promptTextSnapshot.trim() &&
    state.negativePrompt.value.trim() === negativePromptTextSnapshot.trim()
  ) {
    state.promptMode.value = mode
    return
  }

  state.promptSections.value = createEmptyPromptSections()
  state.promptSections.value.others = splitPromptDraft(state.prompt.value)
  state.promptSectionDrafts.value = createEmptyPromptSectionsDrafts()
  state.negativePromptTags.value = splitPromptDraft(state.negativePrompt.value)
  state.negativePromptDraft.value = ''
  state.promptMode.value = mode
}

return {
  setPromptMode,
}
}
