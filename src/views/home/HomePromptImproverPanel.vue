<script setup lang="ts">
import { RefreshCw, Sparkles, Square } from 'lucide-vue-next'
import UiSelect from '../../components/ui/UiSelect.vue'
import { useProvidedHomeView } from './homeViewContext'

const {
  improvedPrompt,
  useImprovedPrompt,
  ollamaModels,
  selectedOllamaModel,
  usePromptImprover,
  llmInstruction,
  promptImprovementError,
  promptImprovementNotice,
  loadingOllamaModels,
  ollamaModelError,
  isImprovingPrompt,
  ollamaModelOptions,
  hasImprovedPromptText,
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
  togglePromptImprover,
  improvePrompt,
  stopPromptImprovement,
} = useProvidedHomeView()
</script>

<template>
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
</template>
