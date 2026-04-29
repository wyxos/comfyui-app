import type { HomeState } from './homeState'
import type { PromptField } from './homeTypes'
import { transformWeightedPrompt } from './homeValueHelpers'

export function createHomePromptWeightActions(state: HomeState) {
const { negativePrompt, prompt } = state

function getPromptFieldRef(field: PromptField) {
  return field === 'prompt' ? prompt : negativePrompt
}

function handlePromptWeightKeydown(event: KeyboardEvent, field: PromptField) {
  if (
    !event.ctrlKey ||
    event.altKey ||
    event.shiftKey ||
    (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')
  ) {
    return
  }

  const target = event.target
  if (!(target instanceof HTMLTextAreaElement)) {
    return
  }

  const selectionStart = target.selectionStart ?? 0
  const selectionEnd = target.selectionEnd ?? 0
  const direction: 1 | -1 = event.key === 'ArrowUp' ? 1 : -1
  const fieldRef = getPromptFieldRef(field)
  const transformed = transformWeightedPrompt(fieldRef.value, selectionStart, selectionEnd, direction)

  if (!transformed) {
    return
  }

  event.preventDefault()

  fieldRef.value = transformed.nextText
  target.value = transformed.nextText
  target.setSelectionRange(transformed.selectionStart, transformed.selectionEnd)

  requestAnimationFrame(() => {
    target.setSelectionRange(transformed.selectionStart, transformed.selectionEnd)
  })
}

return {
  getPromptFieldRef,
  handlePromptWeightKeydown,
}
}
