<script setup lang="ts">
import { computed } from 'vue'
import {
  Minus,
  Plus,
  X,
} from 'lucide-vue-next'
import type { PromptSectionId } from './homeTypes'
import { useHomePromptTagInteractions } from './useHomePromptTagInteractions'
import { useProvidedHomeView } from './homeViewContext'

const {
  prompt,
  negativePrompt,
  promptMode,
  promptSections,
  promptSectionDrafts,
  negativePromptTags,
  negativePromptDraft,
  formTab,
  promptSectionDefinitions,
  compiledPrompt,
  compiledNegativePrompt,
  setPromptMode,
  handlePromptWeightKeydown,
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

const {
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
} = useHomePromptTagInteractions({
  promptSectionDefinitions,
  promptSections,
  negativePromptTags,
  movePromptTag,
  updatePromptSectionTagText,
  updateNegativePromptTagText,
  togglePromptSectionTagEnabled,
  toggleNegativePromptTagEnabled,
})
</script>

<template>
            <div
              v-show="formTab === 'prompt'"
              class="space-y-5"
            >
            <div class="flex flex-wrap items-center justify-between gap-3">
              <span class="field-label">Prompt mode</span>
              <div
                class="inline-flex overflow-hidden rounded-sm border border-primary-foreground/12 bg-card"
                aria-label="Prompt mode"
              >
                <button
                  type="button"
                  class="h-7 px-3 text-xs font-semibold transition focus:outline-none focus:ring-2 focus:ring-ring/25"
                  :class="promptMode === 'tags' ? 'bg-accent text-accent-foreground' : 'text-primary-foreground/68 hover:bg-accent/12 hover:text-accent'"
                  :aria-pressed="promptMode === 'tags'"
                  @click="setPromptMode('tags')"
                >
                  Tags
                </button>
                <button
                  type="button"
                  class="h-7 border-l border-primary-foreground/12 px-3 text-xs font-semibold transition focus:outline-none focus:ring-2 focus:ring-ring/25"
                  :class="promptMode === 'text' ? 'bg-accent text-accent-foreground' : 'text-primary-foreground/68 hover:bg-accent/12 hover:text-accent'"
                  :aria-pressed="promptMode === 'text'"
                  @click="setPromptMode('text')"
                >
                  Text
                </button>
              </div>
            </div>

            <template v-if="promptMode === 'tags'">
            <div class="flex flex-col gap-3">
              <div class="flex items-center justify-between gap-3">
                <span class="field-label">Prompt sections</span>
                <div class="flex flex-wrap items-center justify-end gap-2">
                  <button
                    type="button"
                    class="inline-flex h-6 items-center gap-1 rounded-sm border border-destructive/40 bg-destructive/10 px-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-destructive transition hover:border-destructive hover:bg-destructive hover:text-destructive-foreground focus:outline-none focus:ring-2 focus:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-45"
                    :disabled="!hasPromptSectionTags"
                    @click="() => clearPromptSectionTags()"
                  >
                    <X class="h-3 w-3" />
                    Clear tags
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
            </template>

            <div
              v-else
              class="space-y-4"
            >
              <div class="flex flex-col gap-2">
                <label
                  for="positive-prompt-text"
                  class="field-label"
                >
                  Positive prompt text
                </label>
                <textarea
                  id="positive-prompt-text"
                  v-model="prompt"
                  aria-label="Positive prompt text"
                  class="min-h-48 resize-y rounded-md border border-input bg-card px-3 py-2 text-sm leading-6 text-card-foreground outline-none transition placeholder:text-muted-foreground focus:border-accent focus:ring-2 focus:ring-ring/25"
                  spellcheck="false"
                  @keydown="handlePromptWeightKeydown($event, 'prompt')"
                />
              </div>

              <div class="flex flex-col gap-2">
                <label
                  for="negative-prompt-text"
                  class="field-label"
                >
                  Negative prompt text
                </label>
                <textarea
                  id="negative-prompt-text"
                  v-model="negativePrompt"
                  aria-label="Negative prompt text"
                  class="min-h-36 resize-y rounded-md border border-input bg-card px-3 py-2 text-sm leading-6 text-card-foreground outline-none transition placeholder:text-muted-foreground focus:border-accent focus:ring-2 focus:ring-ring/25"
                  spellcheck="false"
                  @keydown="handlePromptWeightKeydown($event, 'negativePrompt')"
                />
              </div>
            </div>

            </div>
</template>
