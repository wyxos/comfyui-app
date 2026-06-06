<script setup lang="ts">
import { ClipboardPaste, RotateCcw } from 'lucide-vue-next'
import HomeAssetsTab from './HomeAssetsTab.vue'
import HomePromptTab from './HomePromptTab.vue'
import HomeConfigTab from './HomeConfigTab.vue'
import HomeImageTab from './HomeImageTab.vue'
import { useProvidedHomeView } from './homeViewContext'

const {
  loadingCheckpoints,
  isUploadingInputImage,
  isUploadingAnyControlNetImage,
  formTab,
  submissionError,
  metadataPasteNotice,
  metadataPasteError,
  isPastingMetadata,
  isSubmittingGenerate,
  isCancellingJob,
  formTabs,
  shouldUseInputImage,
  canResetForm,
  canGenerate,
  generateDisabledReason,
  canCancelSelectedJob,
  openResetDialog,
  cancelSelectedJob,
  pasteGenerationMetadataFromClipboard,
  generate,
} = useProvidedHomeView()
</script>

<template>
  <form
    class="flex min-h-0 min-w-0 flex-col overflow-hidden border-b border-primary-foreground/12 bg-primary py-4 pl-4 pr-2 text-primary-foreground sm:pl-6 sm:pr-3 lg:border-b-0 lg:border-r"
    novalidate
    @submit.prevent="generate"
    @keydown.ctrl.enter.prevent="generate"
  >
    <div class="companion-scroll min-h-0 flex-1 overflow-y-auto pr-3 sm:pr-4">
      <div class="sticky top-0 z-10 -mr-3 bg-primary pb-4 pr-3 sm:-mr-4 sm:pr-4">
        <div class="rounded-lg border border-primary-foreground/12 bg-primary-foreground/6 p-1">
          <div class="grid gap-1 sm:grid-cols-2 xl:grid-cols-4">
            <button
              v-for="tab in formTabs"
              :key="tab.id"
              type="button"
              class="flex min-w-0 flex-col items-start gap-1 rounded-md px-3 py-2 text-left transition focus:outline-none focus:ring-2 focus:ring-ring/25"
              :class="
                formTab === tab.id
                  ? 'bg-secondary text-secondary-foreground shadow-sm'
                  : 'text-primary-foreground/72 hover:bg-primary-foreground/8 hover:text-primary-foreground'
              "
              @click="formTab = tab.id"
            >
              <span class="text-sm font-semibold">{{ tab.label }}</span>
              <span
                class="text-[11px]"
                :class="formTab === tab.id ? 'text-secondary-foreground/82' : 'text-primary-foreground/50'"
              >
                {{ tab.hint }}
              </span>
            </button>
          </div>
        </div>
      </div>

      <div class="space-y-5 pb-4">
        <HomeAssetsTab />
        <HomePromptTab />
        <HomeConfigTab />
        <HomeImageTab />
      </div>
    </div>

    <div class="sticky bottom-0 z-10 mt-6 shrink-0 border-t border-primary-foreground/12 bg-primary pt-2">
      <p
        v-if="submissionError"
        class="mb-4 rounded-md border border-destructive/40 bg-destructive/12 px-3 py-2 text-sm font-semibold leading-5 text-destructive shadow-[0_10px_24px_rgba(221,28,26,0.18)] whitespace-pre-line"
      >
        {{ submissionError }}
      </p>
      <p
        v-else-if="generateDisabledReason && !isSubmittingGenerate && !loadingCheckpoints"
        class="mb-4 rounded-md border border-destructive/35 bg-destructive/10 px-3 py-2 text-sm font-semibold leading-5 text-destructive shadow-[0_10px_24px_rgba(221,28,26,0.14)]"
      >
        {{ generateDisabledReason }}
      </p>
      <p
        v-if="metadataPasteError || metadataPasteNotice"
        class="mb-3 text-xs font-semibold"
        :class="metadataPasteError ? 'text-destructive' : 'text-secondary'"
      >
        {{ metadataPasteError || metadataPasteNotice }}
      </p>

      <div class="flex flex-wrap items-center gap-2">
        <button
          type="button"
          class="inline-flex h-11 shrink-0 items-center justify-center rounded-md border border-destructive bg-destructive px-4 py-2 text-sm font-bold uppercase tracking-[0.12em] text-destructive-foreground shadow-[0_12px_30px_rgba(221,28,26,0.2)] transition hover:bg-destructive/92 disabled:cursor-not-allowed disabled:opacity-45"
          :disabled="!canCancelSelectedJob || isCancellingJob"
          @click="cancelSelectedJob"
        >
          {{ isCancellingJob ? 'Cancelling...' : 'Cancel' }}
        </button>

        <button
          type="button"
          class="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-md border border-primary-foreground/12 bg-primary-foreground/6 px-3 py-2 text-xs font-bold uppercase tracking-[0.12em] text-primary-foreground transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-45"
          :disabled="isPastingMetadata"
          @click="pasteGenerationMetadataFromClipboard"
        >
          <ClipboardPaste class="h-4 w-4" />
          {{ isPastingMetadata ? 'Pasting...' : 'Paste metadata' }}
        </button>

        <button
          type="button"
          class="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-md border border-primary-foreground/12 bg-primary-foreground/6 px-3 py-2 text-xs font-bold uppercase tracking-[0.12em] text-primary-foreground transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-45"
          :disabled="!canResetForm"
          @click="openResetDialog"
        >
          <RotateCcw class="h-4 w-4" />
          Reset Form
        </button>

        <button
          type="submit"
          class="inline-flex h-11 flex-1 items-center justify-center rounded-md bg-secondary px-4 py-2 text-sm font-bold uppercase text-secondary-foreground transition hover:brightness-98 disabled:cursor-not-allowed disabled:opacity-55"
          :disabled="!canGenerate || isSubmittingGenerate"
        >
          {{
            isSubmittingGenerate
              ? 'Submitting...'
              : shouldUseInputImage && isUploadingInputImage
                ? 'Uploading image...'
                : isUploadingAnyControlNetImage
                  ? 'Uploading control image...'
                  : 'Generate'
          }}
        </button>
      </div>
    </div>
  </form>
</template>
