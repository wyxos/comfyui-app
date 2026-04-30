<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref } from 'vue'
import type { ComponentPublicInstance } from 'vue'
import { Minus, Plus, RefreshCw, Sparkles, Square, X } from 'lucide-vue-next'
import UiSelect from '../../components/ui/UiSelect.vue'
import type { PromptSectionId, PromptTagDropTarget, PromptTagLocation } from './homeTypes'
import { useProvidedHomeView } from './homeViewContext'

const {
  improvedPrompt,
  promptSections,
  promptSectionDrafts,
  negativePromptTags,
  negativePromptDraft,
  useOriginalPrompt,
  useImprovedPrompt,
  ollamaModels,
  selectedOllamaModel,
  usePromptImprover,
  llmInstruction,
  promptImprovementError,
  promptImprovementNotice,
  formTab,
  promptSectionDefinitions,
  compiledPrompt,
  compiledNegativePrompt,
  loadingOllamaModels,
  ollamaModelError,
  isImprovingPrompt,
  ollamaModelOptions,
  hasImprovedPromptText,
  originalPromptGenerationState,
  improvedPromptGenerationState,
  promptImprovementState,
  promptImprovementElapsedLabel,
  promptImprovementTimeoutLabel,
  shouldShowPromptImprovementStatus,
  promptImprovementStatusTitle,
  promptImprovementStatusMeta,
  promptImprovementStatusTone,
  improvePromptDisabledReason,
  canImprovePrompt,
  addPromptSectionTag,
  removePromptSectionTag,
  movePromptTag,
  updatePromptSectionTagText,
  togglePromptSectionTagEnabled,
  clearPromptSectionTags,
  clearNegativePromptTags,
  setPromptSectionTagStrength,
  stepPromptSectionTagStrength,
  handlePromptSectionTagKeydown,
  handlePromptSectionTagInput,
  addNegativePromptTag,
  removeNegativePromptTag,
  updateNegativePromptTagText,
  toggleNegativePromptTagEnabled,
  setNegativePromptTagStrength,
  stepNegativePromptTagStrength,
  handleNegativePromptTagKeydown,
  handleNegativePromptTagInput,
  togglePromptImprover,
  improvePrompt,
  stopPromptImprovement,
} = useProvidedHomeView()

const hasPromptSectionTags = computed(() =>
  promptSectionDefinitions.some((section) =>
    (promptSections.value[section.id]?.length ?? 0) > 0 || Boolean(promptSectionDrafts.value[section.id]?.trim()),
  ),
)

const hasNegativePromptTagContent = computed(() =>
  negativePromptTags.value.length > 0 || Boolean(negativePromptDraft.value.trim()),
)

function hasPromptSectionContent(sectionId: PromptSectionId) {
  return (promptSections.value[sectionId]?.length ?? 0) > 0 || Boolean(promptSectionDrafts.value[sectionId]?.trim())
}

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
    ? promptSections.value[location.sectionId]?.[location.index]?.text ?? ''
    : negativePromptTags.value[location.index]?.text ?? ''
}

function isPromptTagDisabled(location: PromptTagLocation) {
  return location.field === 'section'
    ? promptSections.value[location.sectionId]?.[location.index]?.enabled === false
    : negativePromptTags.value[location.index]?.enabled === false
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
      && promptSectionDefinitions.some((section) => section.id === parsedValue.sectionId)
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
  movePromptTag(source, target)
  draggedPromptTag.value = null
}

function handlePromptTagDragEnd() {
  draggedPromptTag.value = null
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
    updatePromptSectionTagText(location.sectionId, location.index, promptTagEditDraft.value)
  } else {
    updateNegativePromptTagText(location.index, promptTagEditDraft.value)
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

function clearPromptTagClickTimer() {
  window.clearTimeout(promptTagClickTimer)
  promptTagClickTimer = undefined
}

function togglePromptTagEnabledAt(location: PromptTagLocation) {
  if (location.field === 'section') {
    togglePromptSectionTagEnabled(location.sectionId, location.index)
    return
  }

  toggleNegativePromptTagEnabled(location.index)
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
</script>

<template>
            <div
              v-show="formTab === 'prompt'"
              class="space-y-5"
            >
            <div class="flex flex-col gap-3">
              <div class="flex items-center justify-between gap-3">
                <span class="field-label">Prompt sections</span>
                <div class="flex items-center gap-3">
                  <button
                    type="button"
                    class="inline-flex h-6 items-center gap-1 rounded-sm border border-destructive/40 bg-destructive/10 px-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-destructive transition hover:border-destructive hover:bg-destructive hover:text-destructive-foreground focus:outline-none focus:ring-2 focus:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-45"
                    :disabled="!hasPromptSectionTags"
                    @click="() => clearPromptSectionTags()"
                  >
                    <X class="h-3 w-3" />
                    Clear tags
                  </button>
                  <span class="text-[11px] text-primary-foreground/60">
                    {{ originalPromptGenerationState }}
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-label="Use original prompt for generation"
                    :aria-checked="useOriginalPrompt"
                    class="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition focus:outline-none focus:ring-2 focus:ring-ring/25"
                    :class="
                      useOriginalPrompt
                        ? 'border-secondary bg-secondary'
                        : 'border-primary-foreground/12 bg-primary-foreground/8'
                    "
                    @click="useOriginalPrompt = !useOriginalPrompt"
                  >
                    <span
                      class="inline-block h-4 w-4 rounded-full bg-primary-foreground shadow-sm transition-transform"
                      :class="useOriginalPrompt ? 'translate-x-5' : 'translate-x-1'"
                    />
                  </button>
                </div>
              </div>

              <div class="grid gap-3">
                <div
                  v-for="section in promptSectionDefinitions"
                  :key="section.id"
                  class="rounded-md border border-primary-foreground/12 bg-primary-foreground/6 p-3"
                >
                  <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p class="text-sm font-semibold text-primary-foreground">{{ section.label }}</p>
                      <p class="text-[11px] leading-4 text-primary-foreground/52">{{ section.hint }}</p>
                    </div>
                    <div class="flex items-center gap-2">
                      <span class="text-[11px] font-semibold uppercase tracking-[0.1em] text-primary-foreground/42">
                        {{ promptSections[section.id].length }}
                      </span>
                      <button
                        type="button"
                        class="inline-flex h-6 items-center rounded-sm border border-destructive/40 bg-destructive/10 px-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-destructive transition hover:border-destructive hover:bg-destructive hover:text-destructive-foreground focus:outline-none focus:ring-2 focus:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-45"
                        :disabled="!hasPromptSectionContent(section.id)"
                        @click="clearPromptSectionTags(section.id)"
                      >
                        Clear
                      </button>
                    </div>
                  </div>

                  <div
                    class="flex min-h-11 flex-wrap items-center gap-2 rounded-md border border-input bg-card px-2 py-2 transition"
                    :class="draggedPromptTag ? 'border-accent/60 bg-accent/10' : ''"
                    :data-prompt-drop-target="section.id"
                    @dragover="handlePromptTagDragOver"
                    @drop="handlePromptTagDrop($event, { field: 'section', sectionId: section.id })"
                  >
                    <div
                      v-for="(tag, index) in promptSections[section.id]"
                      :key="`${section.id}-${tag.text}-${index}`"
                      class="inline-flex max-w-full items-stretch text-xs font-medium text-card-foreground transition"
                      :class="isSamePromptTagLocation(draggedPromptTag, { field: 'section', sectionId: section.id, index }) ? 'opacity-45' : ''"
                      @dragover.stop="handlePromptTagDragOver"
                      @drop.stop="handlePromptTagDrop($event, { field: 'section', sectionId: section.id, index })"
                    >
                      <input
                        v-if="isEditingPromptTag({ field: 'section', sectionId: section.id, index })"
                        :ref="setPromptTagEditInput"
                        v-model="promptTagEditDraft"
                        class="h-7 min-w-24 max-w-56 rounded-l-sm border border-secondary/65 bg-card px-2 py-1 text-xs font-semibold text-card-foreground outline-none focus:ring-2 focus:ring-ring/25"
                        :aria-label="`Edit ${tag.text} tag`"
                        @click.stop
                        @dblclick.stop
                        @keydown.stop="handlePromptTagEditKeydown"
                        @blur="commitPromptTagEdit"
                      />
                      <span
                        v-else
                        draggable="true"
                        role="button"
                        tabindex="0"
                        class="min-w-0 cursor-grab select-none break-words rounded-l-sm border px-2 py-1 font-semibold transition active:cursor-grabbing"
                        :class="
                          isPromptTagDisabled({ field: 'section', sectionId: section.id, index })
                            ? 'border-primary-foreground/20 bg-primary-foreground/14 text-primary-foreground/45 line-through'
                            : 'border-secondary/65 bg-secondary text-secondary-foreground'
                        "
                        :aria-pressed="!isPromptTagDisabled({ field: 'section', sectionId: section.id, index })"
                        :aria-label="`${isPromptTagDisabled({ field: 'section', sectionId: section.id, index }) ? 'Enable' : 'Disable'} ${tag.text} tag`"
                        :title="isPromptTagDisabled({ field: 'section', sectionId: section.id, index }) ? 'Click to include. Drag to move. Double-click to edit.' : 'Click to skip. Drag to move. Double-click to edit.'"
                        @click.stop="handlePromptTagClick({ field: 'section', sectionId: section.id, index })"
                        @dragstart="handlePromptTagDragStart($event, { field: 'section', sectionId: section.id, index })"
                        @dragend="handlePromptTagDragEnd"
                        @keydown="handlePromptTagToggleKeydown($event, { field: 'section', sectionId: section.id, index })"
                        @dblclick.stop="startPromptTagEdit({ field: 'section', sectionId: section.id, index })"
                      >
                        {{ tag.text }}
                      </span>
                      <span class="flex shrink-0 items-stretch">
                        <button
                          type="button"
                          class="inline-flex h-7 w-7 items-center justify-center border border-primary-foreground/16 bg-primary text-primary-foreground transition hover:border-accent/60 hover:bg-accent/20 hover:text-accent focus:outline-none focus:ring-2 focus:ring-ring/25"
                          :aria-label="`Decrease ${tag.text} weight`"
                          @click.stop="stepPromptSectionTagStrength(section.id, index, -1)"
                        >
                          <Minus class="h-3 w-3" />
                        </button>
                        <input
                          :value="tag.strength"
                          inputmode="decimal"
                          class="h-7 w-10 border border-primary-foreground/16 bg-card text-center text-[11px] font-semibold text-primary-foreground outline-none focus:bg-primary-foreground/8"
                          :aria-label="`${tag.text} weight`"
                          @change="setPromptSectionTagStrength(section.id, index, ($event.target as HTMLInputElement).value)"
                        />
                        <button
                          type="button"
                          class="inline-flex h-7 w-7 items-center justify-center border border-primary-foreground/16 bg-primary text-primary-foreground transition hover:border-accent/60 hover:bg-accent/20 hover:text-accent focus:outline-none focus:ring-2 focus:ring-ring/25"
                          :aria-label="`Increase ${tag.text} weight`"
                          @click.stop="stepPromptSectionTagStrength(section.id, index, 1)"
                        >
                          <Plus class="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          class="inline-flex h-7 w-7 items-center justify-center rounded-r-sm border border-destructive/65 bg-destructive/10 text-destructive transition hover:border-destructive hover:bg-destructive hover:text-destructive-foreground focus:outline-none focus:ring-2 focus:ring-ring/25"
                          :aria-label="`Remove ${tag.text}`"
                          @click.stop="removePromptSectionTag(section.id, index)"
                        >
                          <X class="h-3 w-3" />
                        </button>
                      </span>
                    </div>

                    <input
                      v-model="promptSectionDrafts[section.id]"
                      :aria-label="section.label"
                      class="min-h-7 min-w-[9rem] flex-1 bg-transparent text-sm text-card-foreground outline-none placeholder:text-muted-foreground"
                      :placeholder="section.placeholder"
                      @input="handlePromptSectionTagInput(section.id)"
                      @keydown="handlePromptSectionTagKeydown($event, section.id)"
                      @blur="addPromptSectionTag(section.id)"
                    />
                  </div>
                </div>
              </div>

              <div class="rounded-md border border-primary-foreground/12 bg-primary-foreground/6 px-3 py-2">
                <p class="text-[11px] font-semibold uppercase tracking-[0.1em] text-primary-foreground/48">
                  ComfyUI positive prompt
                </p>
                <p class="mt-1 min-h-5 break-words text-sm leading-6 text-primary-foreground/78">
                  {{ compiledPrompt || 'No positive prompt tags yet.' }}
                </p>
              </div>
            </div>

            <div class="flex flex-col gap-2">
              <div class="flex items-center justify-between gap-3">
                <span class="field-label">Negative prompt</span>
                <button
                  type="button"
                  class="inline-flex h-6 items-center rounded-sm border border-destructive/40 bg-destructive/10 px-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-destructive transition hover:border-destructive hover:bg-destructive hover:text-destructive-foreground focus:outline-none focus:ring-2 focus:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-45"
                  :disabled="!hasNegativePromptTagContent"
                  @click="clearNegativePromptTags"
                >
                  Clear
                </button>
              </div>
              <div
                class="flex min-h-11 flex-wrap items-center gap-2 rounded-md border border-input bg-card px-2 py-2 transition"
                :class="draggedPromptTag ? 'border-accent/60 bg-accent/10' : ''"
                data-prompt-drop-target="negative"
                @dragover="handlePromptTagDragOver"
                @drop="handlePromptTagDrop($event, { field: 'negative' })"
              >
                <div
                  v-for="(tag, index) in negativePromptTags"
                  :key="`${tag.text}-${index}`"
                  class="inline-flex max-w-full items-stretch text-xs font-medium text-card-foreground transition"
                  :class="isSamePromptTagLocation(draggedPromptTag, { field: 'negative', index }) ? 'opacity-45' : ''"
                  @dragover.stop="handlePromptTagDragOver"
                  @drop.stop="handlePromptTagDrop($event, { field: 'negative', index })"
                >
                  <input
                    v-if="isEditingPromptTag({ field: 'negative', index })"
                    :ref="setPromptTagEditInput"
                    v-model="promptTagEditDraft"
                    class="h-7 min-w-24 max-w-56 rounded-l-sm border border-secondary/65 bg-card px-2 py-1 text-xs font-semibold text-card-foreground outline-none focus:ring-2 focus:ring-ring/25"
                    :aria-label="`Edit ${tag.text} tag`"
                    @click.stop
                    @dblclick.stop
                    @keydown.stop="handlePromptTagEditKeydown"
                    @blur="commitPromptTagEdit"
                  />
                  <span
                    v-else
                    draggable="true"
                    role="button"
                    tabindex="0"
                    class="min-w-0 cursor-grab select-none break-words rounded-l-sm border px-2 py-1 font-semibold transition active:cursor-grabbing"
                    :class="
                      isPromptTagDisabled({ field: 'negative', index })
                        ? 'border-primary-foreground/20 bg-primary-foreground/14 text-primary-foreground/45 line-through'
                        : 'border-secondary/65 bg-secondary text-secondary-foreground'
                    "
                    :aria-pressed="!isPromptTagDisabled({ field: 'negative', index })"
                    :aria-label="`${isPromptTagDisabled({ field: 'negative', index }) ? 'Enable' : 'Disable'} ${tag.text} tag`"
                    :title="isPromptTagDisabled({ field: 'negative', index }) ? 'Click to include. Drag to move. Double-click to edit.' : 'Click to skip. Drag to move. Double-click to edit.'"
                    @click.stop="handlePromptTagClick({ field: 'negative', index })"
                    @dragstart="handlePromptTagDragStart($event, { field: 'negative', index })"
                    @dragend="handlePromptTagDragEnd"
                    @keydown="handlePromptTagToggleKeydown($event, { field: 'negative', index })"
                    @dblclick.stop="startPromptTagEdit({ field: 'negative', index })"
                  >
                    {{ tag.text }}
                  </span>
                  <span class="flex shrink-0 items-stretch">
                    <button
                      type="button"
                      class="inline-flex h-7 w-7 items-center justify-center border border-primary-foreground/16 bg-primary text-primary-foreground transition hover:border-accent/60 hover:bg-accent/20 hover:text-accent focus:outline-none focus:ring-2 focus:ring-ring/25"
                      :aria-label="`Decrease ${tag.text} weight`"
                      @click.stop="stepNegativePromptTagStrength(index, -1)"
                    >
                      <Minus class="h-3 w-3" />
                    </button>
                    <input
                      :value="tag.strength"
                      inputmode="decimal"
                      class="h-7 w-10 border border-primary-foreground/16 bg-card text-center text-[11px] font-semibold text-primary-foreground outline-none focus:bg-primary-foreground/8"
                      :aria-label="`${tag.text} weight`"
                      @change="setNegativePromptTagStrength(index, ($event.target as HTMLInputElement).value)"
                    />
                    <button
                      type="button"
                      class="inline-flex h-7 w-7 items-center justify-center border border-primary-foreground/16 bg-primary text-primary-foreground transition hover:border-accent/60 hover:bg-accent/20 hover:text-accent focus:outline-none focus:ring-2 focus:ring-ring/25"
                      :aria-label="`Increase ${tag.text} weight`"
                      @click.stop="stepNegativePromptTagStrength(index, 1)"
                    >
                      <Plus class="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      class="inline-flex h-7 w-7 items-center justify-center rounded-r-sm border border-destructive/65 bg-destructive/10 text-destructive transition hover:border-destructive hover:bg-destructive hover:text-destructive-foreground focus:outline-none focus:ring-2 focus:ring-ring/25"
                      :aria-label="`Remove ${tag.text}`"
                      @click.stop="removeNegativePromptTag(index)"
                    >
                      <X class="h-3 w-3" />
                    </button>
                  </span>
                </div>

                <input
                  v-model="negativePromptDraft"
                  aria-label="Negative prompt"
                  class="min-h-7 min-w-[9rem] flex-1 bg-transparent text-sm text-card-foreground outline-none placeholder:text-muted-foreground"
                  placeholder="blur, bad hands, text"
                  @input="handleNegativePromptTagInput"
                  @keydown="handleNegativePromptTagKeydown"
                  @blur="addNegativePromptTag"
                />
              </div>
              <p class="break-words text-xs leading-5 text-primary-foreground/56">
                {{ compiledNegativePrompt || 'No negative prompt tags yet.' }}
              </p>
            </div>

            <div class="space-y-3 rounded-md border border-primary-foreground/12 bg-primary-foreground/6 px-3 py-3">
              <div class="flex items-center justify-between gap-3">
                <div class="flex min-w-0 items-center gap-2">
                  <Sparkles class="h-4 w-4 shrink-0 text-secondary" />
                  <span class="field-label">Use Ollama prompt improver</span>
                </div>

                <button
                  type="button"
                  role="switch"
                  aria-label="Use Ollama prompt improver"
                  :aria-checked="usePromptImprover"
                  class="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition focus:outline-none focus:ring-2 focus:ring-ring/25"
                  :class="
                    usePromptImprover
                      ? 'border-secondary bg-secondary'
                      : 'border-primary-foreground/12 bg-primary-foreground/8'
                  "
                  @click="togglePromptImprover"
                >
                  <span
                    class="inline-block h-4 w-4 rounded-full bg-primary-foreground shadow-sm transition-transform"
                    :class="usePromptImprover ? 'translate-x-5' : 'translate-x-1'"
                  />
                </button>
              </div>

              <div class="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
                <label class="flex flex-col gap-2">
                  <span class="field-label">Ollama model</span>
                  <UiSelect
                    v-model="selectedOllamaModel"
                    :options="ollamaModelOptions"
                    :placeholder="loadingOllamaModels ? 'Loading models...' : 'Select model'"
                    :disabled="!usePromptImprover || loadingOllamaModels || !ollamaModels.length"
                  />
                </label>

                <div class="flex flex-col items-stretch justify-end gap-1.5 sm:items-end">
                  <button
                    type="button"
                    class="inline-flex h-11 min-w-[8.5rem] items-center justify-center gap-2 rounded-md border px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-55"
                    :class="
                      isImprovingPrompt
                        ? 'border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/16'
                        : 'border-primary-foreground/12 bg-primary-foreground/8 text-primary-foreground hover:border-accent hover:text-accent'
                    "
                    :disabled="!isImprovingPrompt && !canImprovePrompt"
                    :title="!isImprovingPrompt && improvePromptDisabledReason ? improvePromptDisabledReason : undefined"
                    @click="isImprovingPrompt ? stopPromptImprovement() : improvePrompt()"
                  >
                    <Square
                      v-if="isImprovingPrompt"
                      class="h-3.5 w-3.5 fill-current"
                    />
                    {{ isImprovingPrompt ? 'Stop' : 'Improve' }}
                  </button>
                  <p
                    v-if="!isImprovingPrompt && improvePromptDisabledReason"
                    class="max-w-[13rem] text-right text-[11px] leading-4 text-primary-foreground/52"
                  >
                    {{ improvePromptDisabledReason }}
                  </p>
                </div>
              </div>

              <div
                v-if="shouldShowPromptImprovementStatus"
                class="rounded-md border px-3 py-3 transition"
                :class="promptImprovementStatusTone"
              >
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    <div class="flex items-center gap-2">
                      <RefreshCw
                        class="h-4 w-4 shrink-0"
                        :class="isImprovingPrompt ? 'animate-spin' : ''"
                      />
                      <p class="truncate text-sm font-semibold">{{ promptImprovementStatusTitle }}</p>
                    </div>
                    <p class="mt-1 break-words text-xs leading-5 text-primary-foreground/62">
                      {{ promptImprovementStatusMeta }}
                    </p>
                  </div>

                  <p
                    v-if="isImprovingPrompt"
                    class="shrink-0 text-xs font-semibold tabular-nums text-secondary"
                  >
                    {{ promptImprovementElapsedLabel }}
                  </p>
                </div>

                <div class="mt-3 h-2 overflow-hidden rounded-sm bg-primary-foreground/14">
                  <div
                    v-if="isImprovingPrompt"
                    class="companion-indeterminate h-full w-1/3 bg-secondary"
                  />
                  <div
                    v-else-if="promptImprovementError"
                    class="h-full w-full bg-destructive"
                  />
                  <div
                    v-else-if="promptImprovementNotice || hasImprovedPromptText"
                    class="h-full w-full bg-secondary"
                  />
                </div>

                <div class="mt-3 grid gap-2 text-[11px] font-semibold uppercase tracking-[0.1em] sm:grid-cols-3">
                  <span
                    class="rounded-sm border px-2 py-1"
                    :class="
                      isImprovingPrompt || promptImprovementNotice || promptImprovementError || hasImprovedPromptText
                        ? 'border-secondary/35 bg-secondary/10 text-secondary'
                        : 'border-primary-foreground/12 bg-card text-primary-foreground/48'
                    "
                  >
                    Request sent
                  </span>
                  <span
                    class="rounded-sm border px-2 py-1"
                    :class="
                      isImprovingPrompt
                        ? 'border-secondary/35 bg-secondary/10 text-secondary'
                        : promptImprovementNotice || promptImprovementError || hasImprovedPromptText
                          ? 'border-secondary/22 bg-secondary/8 text-secondary/80'
                          : 'border-primary-foreground/12 bg-card text-primary-foreground/48'
                    "
                  >
                    Waiting on Ollama
                  </span>
                  <span
                    class="rounded-sm border px-2 py-1"
                    :class="
                      promptImprovementError
                        ? 'border-destructive/35 bg-destructive/10 text-destructive'
                        : promptImprovementNotice || hasImprovedPromptText
                          ? 'border-secondary/35 bg-secondary/10 text-secondary'
                          : 'border-primary-foreground/12 bg-card text-primary-foreground/48'
                    "
                  >
                    Result
                  </span>
                </div>

                <p
                  v-if="isImprovingPrompt"
                  class="mt-3 text-[11px] text-primary-foreground/52"
                >
                  Timeout {{ promptImprovementTimeoutLabel }}
                </p>
              </div>

              <label class="flex flex-col gap-2">
                <span class="field-label">LLM instruction</span>
                <textarea
                  v-model="llmInstruction"
                  rows="3"
                  :disabled="!usePromptImprover"
                  class="min-h-[6.25rem] w-full resize-y rounded-md border border-input bg-card px-3 py-2 text-sm leading-7 text-card-foreground outline-none transition placeholder:text-muted-foreground focus:border-accent focus:ring-2 focus:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-55"
                  placeholder="Optional guidance for Ollama. Leave empty to use the default improver instruction."
                />
              </label>

              <div class="flex flex-col gap-2">
                <div class="flex items-center justify-between gap-3">
                  <span class="field-label">Improved prompt</span>
                  <div class="flex items-center gap-3">
                    <span class="text-[11px] text-primary-foreground/60">
                      {{ improvedPromptGenerationState }}
                    </span>
                    <button
                      type="button"
                      role="switch"
                      aria-label="Use improved prompt for generation"
                      :aria-checked="useImprovedPrompt"
                      class="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition focus:outline-none focus:ring-2 focus:ring-ring/25"
                      :class="
                        useImprovedPrompt
                          ? 'border-secondary bg-secondary'
                          : 'border-primary-foreground/12 bg-primary-foreground/8'
                      "
                      @click="useImprovedPrompt = !useImprovedPrompt"
                    >
                      <span
                        class="inline-block h-4 w-4 rounded-full bg-primary-foreground shadow-sm transition-transform"
                        :class="useImprovedPrompt ? 'translate-x-5' : 'translate-x-1'"
                      />
                    </button>
                  </div>
                </div>
                <textarea
                  v-model="improvedPrompt"
                  rows="3"
                  aria-label="Improved prompt"
                  class="min-h-[6.25rem] w-full resize-y rounded-md border border-input bg-card px-3 py-2 text-sm leading-7 text-card-foreground outline-none transition placeholder:text-muted-foreground focus:border-accent focus:ring-2 focus:ring-ring/25"
                  placeholder="Write the improved prompt here"
                />
                <p
                  class="text-xs"
                  :class="
                    promptImprovementError
                      ? 'text-destructive'
                      : improvedPrompt
                        ? 'text-secondary'
                        : 'text-primary-foreground/60'
                  "
                >
                  {{ promptImprovementState }}
                </p>
              </div>

              <p
                v-if="ollamaModelError"
                class="text-xs text-destructive"
              >
                {{ ollamaModelError }}
              </p>
            </div>
            </div>
</template>
