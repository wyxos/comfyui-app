import { nextTick, onBeforeUnmount, ref } from 'vue'
import type { ComponentPublicInstance, Ref } from 'vue'
import type {
  PromptSectionDefinition,
  PromptSectionId,
  PromptSectionsState,
  PromptTag,
  PromptTagDropTarget,
  PromptTagLocation,
} from './homeTypes'

type HomePromptTagInteractionDeps = {
  promptSectionDefinitions: PromptSectionDefinition[]
  promptSections: Ref<PromptSectionsState>
  negativePromptTags: Ref<PromptTag[]>
  movePromptTag: (source: PromptTagLocation, target: PromptTagDropTarget) => void
  updatePromptSectionTagText: (sectionId: PromptSectionId, index: number, text: string) => void
  updateNegativePromptTagText: (index: number, text: string) => void
  togglePromptSectionTagEnabled: (sectionId: PromptSectionId, index: number) => void
  toggleNegativePromptTagEnabled: (index: number) => void
}

export function useHomePromptTagInteractions(deps: HomePromptTagInteractionDeps) {
  const draggedPromptTag = ref<PromptTagLocation | null>(null)
  const editingPromptTag = ref<PromptTagLocation | null>(null)
  const promptTagEditDraft = ref('')
  const promptTagEditInput = ref<HTMLInputElement | null>(null)
  let promptTagClickTimer: number | undefined

  function setPromptTagEditInput(element: Element | ComponentPublicInstance | null) {
    promptTagEditInput.value = element instanceof HTMLInputElement ? element : null
  }

  function isSamePromptTagLocation(first: PromptTagLocation | null, second: PromptTagLocation) {
    if (!first || first.field !== second.field || first.index !== second.index) {
      return false
    }

    if (first.field === 'section' && second.field === 'section') {
      return first.sectionId === second.sectionId
    }

    return true
  }

  function getPromptTagText(location: PromptTagLocation) {
    return location.field === 'section'
      ? deps.promptSections.value[location.sectionId]?.[location.index]?.text ?? ''
      : deps.negativePromptTags.value[location.index]?.text ?? ''
  }

  function isPromptTagDisabled(location: PromptTagLocation) {
    return location.field === 'section'
      ? deps.promptSections.value[location.sectionId]?.[location.index]?.enabled === false
      : deps.negativePromptTags.value[location.index]?.enabled === false
  }

  function parsePromptTagDragData(event: DragEvent) {
    if (draggedPromptTag.value) {
      return draggedPromptTag.value
    }

    const rawValue = event.dataTransfer?.getData('application/x-comfyui-prompt-tag')
    if (!rawValue) {
      return null
    }

    try {
      const parsedValue = JSON.parse(rawValue) as PromptTagLocation
      if (parsedValue.field === 'negative' && Number.isInteger(parsedValue.index)) {
        return parsedValue
      }

      if (
        parsedValue.field === 'section'
        && deps.promptSectionDefinitions.some((section) => section.id === parsedValue.sectionId)
        && Number.isInteger(parsedValue.index)
      ) {
        return parsedValue
      }
    } catch {
      return null
    }

    return null
  }

  function handlePromptTagDragStart(event: DragEvent, location: PromptTagLocation) {
    draggedPromptTag.value = location
    event.dataTransfer?.setData('application/x-comfyui-prompt-tag', JSON.stringify(location))
    event.dataTransfer?.setData('text/plain', getPromptTagText(location))
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move'
    }
  }

  function handlePromptTagDragOver(event: DragEvent) {
    if (!draggedPromptTag.value && !event.dataTransfer?.types.includes('application/x-comfyui-prompt-tag')) {
      return
    }

    event.preventDefault()
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move'
    }
  }

  function handlePromptTagDrop(event: DragEvent, target: PromptTagDropTarget) {
    const source = parsePromptTagDragData(event)
    if (!source) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    deps.movePromptTag(source, target)
    draggedPromptTag.value = null
  }

  function handlePromptTagDragEnd() {
    draggedPromptTag.value = null
  }

  function clearPromptTagClickTimer() {
    window.clearTimeout(promptTagClickTimer)
    promptTagClickTimer = undefined
  }

  function startPromptTagEdit(location: PromptTagLocation) {
    clearPromptTagClickTimer()
    promptTagEditDraft.value = getPromptTagText(location)
    editingPromptTag.value = location
    void nextTick(() => {
      promptTagEditInput.value?.focus()
      promptTagEditInput.value?.select()
    })
  }

  function isEditingPromptTag(location: PromptTagLocation) {
    return isSamePromptTagLocation(editingPromptTag.value, location)
  }

  function commitPromptTagEdit() {
    const location = editingPromptTag.value
    if (!location) {
      return
    }

    if (location.field === 'section') {
      deps.updatePromptSectionTagText(location.sectionId, location.index, promptTagEditDraft.value)
    } else {
      deps.updateNegativePromptTagText(location.index, promptTagEditDraft.value)
    }

    editingPromptTag.value = null
    promptTagEditDraft.value = ''
  }

  function cancelPromptTagEdit() {
    editingPromptTag.value = null
    promptTagEditDraft.value = ''
  }

  function handlePromptTagEditKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      event.preventDefault()
      commitPromptTagEdit()
      return
    }

    if (event.key === 'Escape') {
      event.preventDefault()
      cancelPromptTagEdit()
    }
  }

  function togglePromptTagEnabledAt(location: PromptTagLocation) {
    if (location.field === 'section') {
      deps.togglePromptSectionTagEnabled(location.sectionId, location.index)
      return
    }

    deps.toggleNegativePromptTagEnabled(location.index)
  }

  function handlePromptTagClick(location: PromptTagLocation) {
    if (isEditingPromptTag(location)) {
      return
    }

    clearPromptTagClickTimer()
    promptTagClickTimer = window.setTimeout(() => {
      togglePromptTagEnabledAt(location)
      promptTagClickTimer = undefined
    }, 180)
  }

  function handlePromptTagToggleKeydown(event: KeyboardEvent, location: PromptTagLocation) {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    clearPromptTagClickTimer()
    togglePromptTagEnabledAt(location)
  }

  onBeforeUnmount(() => {
    clearPromptTagClickTimer()
  })

  return {
    draggedPromptTag,
    promptTagEditDraft,
    setPromptTagEditInput,
    isSamePromptTagLocation,
    isPromptTagDisabled,
    handlePromptTagDragStart,
    handlePromptTagDragOver,
    handlePromptTagDrop,
    handlePromptTagDragEnd,
    startPromptTagEdit,
    isEditingPromptTag,
    commitPromptTagEdit,
    handlePromptTagEditKeydown,
    handlePromptTagClick,
    handlePromptTagToggleKeydown,
  }
}
