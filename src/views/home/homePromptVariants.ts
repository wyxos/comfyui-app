import type { PromptVariant } from './homeTypes'

export function buildPromptVariantsFromFields(promptText: string) {
  const normalizedPrompt = promptText.trim()
  if (!normalizedPrompt) {
    return []
  }

  return [{
    id: 'prompt',
    label: 'Prompt',
    promptText: normalizedPrompt,
  }] satisfies PromptVariant[]
}
