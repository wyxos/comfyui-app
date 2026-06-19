<script setup lang="ts">
import { Clipboard, ClipboardPaste, LoaderCircle } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import type { NormalizedMetaRow } from './assetPreviewTypes'
import { serializeGenerationMetadataClipboard } from '../../lib/generationMetadata'

const props = withDefaults(
  defineProps<{
    loading?: boolean
    error?: string
    metadataText?: string
    rows?: NormalizedMetaRow[]
    metadataSource?: Record<string, unknown> | null
    applyGenerationMetadata?: (metadata: Record<string, unknown>) => void | Promise<void>
    showAction?: boolean
    showEmpty?: boolean
    emptyMessage?: string
  }>(),
  {
    loading: false,
    error: '',
    metadataText: '',
    rows: () => [],
    metadataSource: null,
    applyGenerationMetadata: undefined,
    showAction: true,
    showEmpty: false,
    emptyMessage: 'No prompt metadata found for this image.',
  },
)

const emit = defineEmits<{
  applied: []
}>()

const notice = ref('')
const actionError = ref('')
const isHandlingAction = ref(false)
const hasApplyAction = computed(() => typeof props.applyGenerationMetadata === 'function')

async function handleMetadataAction() {
  if (isHandlingAction.value) {
    return
  }

  notice.value = ''
  actionError.value = ''
  isHandlingAction.value = true

  try {
    if (!props.metadataSource) {
      throw new Error('No generation metadata is available for this image.')
    }

    if (hasApplyAction.value) {
      await props.applyGenerationMetadata?.(props.metadataSource)
      notice.value = 'Metadata applied.'
      emit('applied')
      return
    }

    await navigator.clipboard.writeText(serializeGenerationMetadataClipboard(props.metadataSource))
    notice.value = 'Metadata copied.'
  } catch (error) {
    actionError.value = error instanceof Error ? error.message : 'Could not use generation metadata.'
  } finally {
    isHandlingAction.value = false
  }
}
</script>

<template>
  <section
    v-if="loading || error || metadataText || rows.length || showEmpty"
    class="min-w-0 space-y-3 border-t border-border pt-5"
  >
    <div class="flex min-w-0 flex-wrap items-center justify-between gap-2">
      <p class="text-xs font-semibold uppercase tracking-[0.22em] text-secondary">
        Metadata
      </p>
      <button
        v-if="showAction && metadataSource"
        type="button"
        class="inline-flex h-8 items-center gap-1.5 rounded-sm border border-border bg-card px-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-card-foreground transition hover:border-secondary hover:text-secondary focus:outline-none focus:ring-2 focus:ring-ring/25"
        :disabled="isHandlingAction"
        @click="handleMetadataAction"
      >
        <ClipboardPaste
          v-if="hasApplyAction"
          class="h-3.5 w-3.5"
        />
        <Clipboard
          v-else
          class="h-3.5 w-3.5"
        />
        {{ hasApplyAction ? 'Apply metadata' : 'Copy metadata' }}
      </button>
    </div>
    <p
      v-if="actionError || notice"
      class="text-xs font-semibold"
      :class="actionError ? 'text-destructive' : 'text-secondary'"
    >
      {{ actionError || notice }}
    </p>
    <div
      class="min-w-0 overflow-hidden rounded-md border border-accent/35 bg-background p-3"
      data-test="asset-preview-metadata-card"
    >
      <p
        v-if="loading"
        class="inline-flex items-center text-xs font-semibold text-muted-foreground"
      >
        <LoaderCircle class="mr-2 h-4 w-4 animate-spin text-secondary" />
        Loading prompt metadata...
      </p>
      <p
        v-else-if="error && !metadataText"
        class="text-xs font-semibold text-destructive"
      >
        {{ error }}
      </p>
      <p
        v-else-if="!metadataText && !rows.length"
        class="text-xs font-semibold text-muted-foreground"
      >
        {{ emptyMessage }}
      </p>
      <dl
        v-if="rows.length"
        class="grid min-w-0 gap-3 text-xs"
      >
        <div
          v-for="row in rows"
          :key="row.label"
          class="min-w-0"
        >
          <dt class="font-semibold uppercase tracking-[0.12em] text-muted-foreground">{{ row.label }}</dt>
          <dd
            class="mt-1 min-w-0 whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-card-foreground"
            :class="row.mono ? 'font-mono leading-5' : 'font-semibold'"
            data-test="asset-preview-metadata-row-value"
          >
            {{ row.value }}
          </dd>
        </div>
      </dl>
      <details
        v-if="metadataText"
        class="mt-3"
        :open="!rows.length"
      >
        <summary class="cursor-pointer text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Raw meta
        </summary>
        <pre class="mt-2 max-h-96 max-w-full overflow-y-auto overflow-x-hidden whitespace-pre-wrap break-words [overflow-wrap:anywhere] rounded-sm bg-primary p-3 text-xs leading-5 text-primary-foreground/85">{{ metadataText }}</pre>
      </details>
    </div>
  </section>
</template>
