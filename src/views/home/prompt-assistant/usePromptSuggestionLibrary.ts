import {
  enrichCharacterSuggestion,
  searchPromptSuggestions,
} from './promptSuggestionApi'

export function usePromptSuggestionLibrary() {
  return {
    searchPromptSuggestions,
    enrichCharacterSuggestion,
  }
}
