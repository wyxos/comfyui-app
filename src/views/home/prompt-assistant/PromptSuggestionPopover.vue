<script setup lang="ts">
import { LoaderCircle } from 'lucide-vue-next'
import type { PromptSuggestion } from './promptSuggestionTypes'

defineProps<{
  suggestions: PromptSuggestion[]
  activeIndex: number
  isLoading: boolean
}>()

const emit = defineEmits<{
  select: [suggestion: PromptSuggestion]
}>()
</script>

<template>
  <div
    v-if="isLoading || suggestions.length"
    class="absolute left-0 right-0 top-full z-[75] mt-1 max-h-64 overflow-y-auto rounded-md border border-border bg-card p-1 text-card-foreground shadow-[0_18px_50px_rgba(0,0,0,0.35)]"
    role="listbox"
  >
    <div
      v-if="isLoading"
      class="flex h-9 items-center px-2 text-muted-foreground"
      role="status"
      aria-label="Searching prompt suggestions"
    >
      <LoaderCircle
        class="h-4 w-4 animate-spin"
        aria-hidden="true"
      />
    </div>
    <button
      v-for="(suggestion, index) in suggestions"
      :key="suggestion.id"
      type="button"
      role="option"
      class="flex w-full min-w-0 items-start gap-2 rounded-sm px-2 py-2 text-left text-xs transition focus:outline-none"
      :class="index === activeIndex ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/12'"
      :aria-selected="index === activeIndex"
      :aria-label="`Add ${suggestion.label} suggestion`"
      @mousedown.prevent="emit('select', suggestion)"
      @click.prevent="emit('select', suggestion)"
    >
      <span class="min-w-0 flex-1">
        <span class="block truncate font-semibold">{{ suggestion.label }}</span>
        <span class="mt-0.5 block truncate text-[11px] opacity-75">{{ suggestion.prompt }}</span>
      </span>
      <span class="shrink-0 rounded-sm border border-current/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] opacity-75">
        {{ suggestion.category }}
      </span>
    </button>
  </div>
</template>
