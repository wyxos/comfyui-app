import type { PromptSectionId } from '../homeTypes'

export type PromptSuggestionTarget = PromptSectionId | 'negative'

export type PromptSuggestion = {
  id: string
  kind: 'character' | 'tag'
  label: string
  prompt: string
  aliases: string[]
  category: string
  targetSections: PromptSuggestionTarget[]
  helperTags?: string[]
}
