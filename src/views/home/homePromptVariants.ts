import type { PromptVariant } from './homeTypes'

export function buildPromptVariantsFromFields(
  promptText: string,
  improvedPromptText: string,
  includeOriginal: boolean,
  includeImproved: boolean,
) {
  const variants: PromptVariant[] = []
  if (includeOriginal && promptText) {
    variants.push({
      id: 'original',
      label: includeImproved && improvedPromptText ? 'Original prompt' : 'Prompt',
      promptText,
      isImproved: false,
    })
  }

  if (includeImproved && improvedPromptText) {
    variants.push({
      id: 'improved',
      label: includeOriginal && promptText ? 'Improved prompt' : 'Prompt',
      promptText: improvedPromptText,
      isImproved: true,
    })
  }

  return variants
}
