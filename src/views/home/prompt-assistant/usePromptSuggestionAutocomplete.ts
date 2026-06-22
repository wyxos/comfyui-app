import { ref } from 'vue'
import type { PromptSectionId } from '../homeTypes'
import type { PromptSuggestion, PromptSuggestionTarget } from './promptSuggestionTypes'

type PromptSuggestionInputTarget =
  | { field: 'section'; sectionId: PromptSectionId }
  | { field: 'negative' }

type PromptSuggestionAutocompleteDeps = {
  promptSectionDrafts: { value: Record<PromptSectionId, string> }
  negativePromptDraft: { value: string }
  searchPromptSuggestions: (
    query: string,
    target: PromptSuggestionTarget,
    signal?: AbortSignal,
  ) => Promise<PromptSuggestion[]>
  applyPromptSuggestion: (sectionId: PromptSectionId, suggestion: PromptSuggestion) => boolean
  applyCharacterHelperTags: (rawTags: string[]) => void
  applyNegativePromptSuggestion: (suggestion: PromptSuggestion) => boolean
  enrichCharacterSuggestion: (prompt: string) => Promise<{ helperTags: string[] }>
  addPromptSectionTag: (sectionId: PromptSectionId) => void
  handlePromptSectionTagInput: (sectionId: PromptSectionId) => void
  handlePromptSectionTagKeydown: (event: KeyboardEvent, sectionId: PromptSectionId) => void
  addNegativePromptTag: () => void
  handleNegativePromptTagInput: () => void
  handleNegativePromptTagKeydown: (event: KeyboardEvent) => void
}

function promptSuggestionTargetKey(target: PromptSuggestionInputTarget) {
  return target.field === 'section' ? `section:${target.sectionId}` : 'negative'
}

function getPromptSuggestionSearchTarget(target: PromptSuggestionInputTarget): PromptSuggestionTarget {
  return target.field === 'section' ? target.sectionId : 'negative'
}

export function usePromptSuggestionAutocomplete(deps: PromptSuggestionAutocompleteDeps) {
  const activePromptSuggestionTarget = ref<PromptSuggestionInputTarget | null>(null)
  const activePromptSuggestionIndex = ref(0)
  const promptSuggestionResults = ref<Record<string, PromptSuggestion[]>>({})
  const promptSuggestionLoadingTargets = ref<Record<string, boolean>>({})
  let searchRequestId = 0
  let searchAbortController: AbortController | null = null
  let activeSearchTargetKey: string | null = null

  function isActivePromptSuggestionTarget(target: PromptSuggestionInputTarget) {
    return activePromptSuggestionTarget.value
      ? promptSuggestionTargetKey(activePromptSuggestionTarget.value) === promptSuggestionTargetKey(target)
      : false
  }

  function getPromptSuggestionDraft(target: PromptSuggestionInputTarget) {
    return target.field === 'section'
      ? deps.promptSectionDrafts.value[target.sectionId] ?? ''
      : deps.negativePromptDraft.value
  }

  function getPromptSuggestions(target: PromptSuggestionInputTarget) {
    if (!isActivePromptSuggestionTarget(target)) {
      return []
    }

    return promptSuggestionResults.value[promptSuggestionTargetKey(target)] ?? []
  }

  function isPromptSuggestionLoading(target: PromptSuggestionInputTarget) {
    return isActivePromptSuggestionTarget(target) &&
      Boolean(promptSuggestionLoadingTargets.value[promptSuggestionTargetKey(target)])
  }

  function setPromptSuggestions(target: PromptSuggestionInputTarget, suggestions: PromptSuggestion[]) {
    promptSuggestionResults.value = {
      ...promptSuggestionResults.value,
      [promptSuggestionTargetKey(target)]: suggestions,
    }
  }

  function setPromptSuggestionLoading(key: string, isLoading: boolean) {
    promptSuggestionLoadingTargets.value = {
      ...promptSuggestionLoadingTargets.value,
      [key]: isLoading,
    }
  }

  function closePromptSuggestions(target?: PromptSuggestionInputTarget) {
    if (!target || isActivePromptSuggestionTarget(target)) {
      activePromptSuggestionTarget.value = null
      activePromptSuggestionIndex.value = 0
    }
  }

  async function syncPromptSuggestions(target: PromptSuggestionInputTarget) {
    const query = getPromptSuggestionDraft(target).trim()
    const requestId = searchRequestId + 1
    searchRequestId = requestId
    if (activeSearchTargetKey) {
      setPromptSuggestionLoading(activeSearchTargetKey, false)
      activeSearchTargetKey = null
    }
    searchAbortController?.abort()
    searchAbortController = null

    if (!query) {
      setPromptSuggestions(target, [])
      closePromptSuggestions(target)
      return
    }

    const abortController = new AbortController()
    const targetKey = promptSuggestionTargetKey(target)
    searchAbortController = abortController
    activeSearchTargetKey = targetKey
    activePromptSuggestionTarget.value = target
    activePromptSuggestionIndex.value = 0
    setPromptSuggestions(target, [])
    setPromptSuggestionLoading(targetKey, true)

    try {
      const suggestions = await deps.searchPromptSuggestions(
        query,
        getPromptSuggestionSearchTarget(target),
        abortController.signal,
      )
      if (requestId !== searchRequestId) {
        return
      }

      setPromptSuggestions(target, suggestions)
      if (!suggestions.length) {
        closePromptSuggestions(target)
      }
    } catch (error) {
      if ((error as { name?: string }).name === 'AbortError' || requestId !== searchRequestId) {
        return
      }

      setPromptSuggestions(target, [])
      closePromptSuggestions(target)
    } finally {
      if (requestId === searchRequestId) {
        setPromptSuggestionLoading(targetKey, false)
        if (activeSearchTargetKey === targetKey) {
          activeSearchTargetKey = null
        }
      }
    }
  }

  function applyPromptSuggestionTarget(target: PromptSuggestionInputTarget, suggestion: PromptSuggestion) {
    if (target.field === 'section') {
      deps.applyPromptSuggestion(target.sectionId, suggestion)
      if (suggestion.kind === 'character' && !(suggestion.helperTags?.length)) {
        void deps.enrichCharacterSuggestion(suggestion.prompt)
          .then((result) => {
            if (result.helperTags.length) {
              deps.applyCharacterHelperTags(result.helperTags)
            }
          })
          .catch(() => {})
      }
    } else {
      deps.applyNegativePromptSuggestion(suggestion)
    }

    closePromptSuggestions(target)
  }

  function applyActivePromptSuggestion(target: PromptSuggestionInputTarget) {
    const suggestions = getPromptSuggestions(target)
    const suggestion = suggestions[activePromptSuggestionIndex.value] ?? suggestions[0]
    if (!suggestion) {
      return false
    }

    applyPromptSuggestionTarget(target, suggestion)
    return true
  }

  function handlePromptSuggestionKeydown(event: KeyboardEvent, target: PromptSuggestionInputTarget) {
    const suggestions = getPromptSuggestions(target)

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!suggestions.length) {
        void syncPromptSuggestions(target)
        return false
      }

      event.preventDefault()
      const offset = event.key === 'ArrowDown' ? 1 : -1
      activePromptSuggestionIndex.value =
        (activePromptSuggestionIndex.value + offset + suggestions.length) % suggestions.length
      return true
    }

    if ((event.key === 'Enter' || event.key === 'Tab') && suggestions.length) {
      event.preventDefault()
      return applyActivePromptSuggestion(target)
    }

    if (event.key === 'Escape' && isActivePromptSuggestionTarget(target)) {
      event.preventDefault()
      closePromptSuggestions(target)
      return true
    }

    return false
  }

  function handlePromptSectionSuggestionInput(sectionId: PromptSectionId) {
    deps.handlePromptSectionTagInput(sectionId)
    void syncPromptSuggestions({ field: 'section', sectionId })
  }

  function handlePromptSectionSuggestionKeydown(event: KeyboardEvent, sectionId: PromptSectionId) {
    const target = { field: 'section', sectionId } as const
    if (handlePromptSuggestionKeydown(event, target)) {
      return
    }

    deps.handlePromptSectionTagKeydown(event, sectionId)
  }

  function handlePromptSectionSuggestionBlur(sectionId: PromptSectionId) {
    deps.addPromptSectionTag(sectionId)
    closePromptSuggestions({ field: 'section', sectionId })
  }

  function handleNegativePromptSuggestionInput() {
    deps.handleNegativePromptTagInput()
    void syncPromptSuggestions({ field: 'negative' })
  }

  function handleNegativePromptSuggestionKeydown(event: KeyboardEvent) {
    const target = { field: 'negative' } as const
    if (handlePromptSuggestionKeydown(event, target)) {
      return
    }

    deps.handleNegativePromptTagKeydown(event)
  }

  function handleNegativePromptSuggestionBlur() {
    deps.addNegativePromptTag()
    closePromptSuggestions({ field: 'negative' })
  }

  return {
    activePromptSuggestionIndex,
    getPromptSuggestions,
    isPromptSuggestionLoading,
    syncPromptSuggestions,
    applyPromptSuggestionTarget,
    handlePromptSectionSuggestionInput,
    handlePromptSectionSuggestionKeydown,
    handlePromptSectionSuggestionBlur,
    handleNegativePromptSuggestionInput,
    handleNegativePromptSuggestionKeydown,
    handleNegativePromptSuggestionBlur,
  }
}
