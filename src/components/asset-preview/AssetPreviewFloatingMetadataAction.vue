<script setup lang="ts">
import { computed, ref } from 'vue'
import { Clipboard, ClipboardPaste, LoaderCircle } from 'lucide-vue-next'

import { serializeGenerationMetadataClipboard } from '../../lib/generationMetadata'
import UiTooltip from '../ui/UiTooltip.vue'

const props = defineProps<{
  loading: boolean
  metadataSource: Record<string, unknown> | null
  applyGenerationMetadata?: (metadata: Record<string, unknown>) => void | Promise<void>
}>()

const emit = defineEmits<{
  applied: []
}>()

const pending = ref(false)
const actionError = ref('')
const notice = ref('')
const hasApplyAction = computed(() => typeof props.applyGenerationMetadata === 'function')
const canShow = computed(() =>
  Boolean(props.metadataSource),
)
const actionLabel = computed(() => hasApplyAction.value ? 'Apply metadata' : 'Copy metadata')
const actionTestId = computed(() =>
  hasApplyAction.value
    ? 'asset-preview-floating-apply-metadata'
    : 'asset-preview-floating-copy-metadata',
)

async function handleMetadataAction() {
  const metadata = props.metadataSource
  if (pending.value || !metadata) {
    return
  }

  pending.value = true
  actionError.value = ''
  notice.value = ''

  try {
    if (hasApplyAction.value) {
      await props.applyGenerationMetadata?.(metadata)
      emit('applied')
      return
    }

    await navigator.clipboard.writeText(serializeGenerationMetadataClipboard(metadata))
    notice.value = 'Metadata copied.'
  } catch (error) {
    actionError.value = error instanceof Error ? error.message : 'Could not use generation metadata.'
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <template v-if="canShow">
    <UiTooltip
      class="absolute bottom-4 right-4 z-30"
      :content="actionLabel"
    >
      <button
        type="button"
        :data-test="actionTestId"
        class="inline-flex size-11 items-center justify-center rounded-md border border-secondary/35 bg-secondary text-secondary-foreground shadow-lg shadow-black/35 transition hover:bg-accent hover:text-accent-foreground focus:outline-none focus:ring-2 focus:ring-ring/40 disabled:cursor-wait disabled:opacity-70"
        :disabled="pending"
        :aria-label="actionLabel"
        @click.stop="handleMetadataAction"
      >
        <LoaderCircle
          v-if="pending"
          class="h-4 w-4 animate-spin"
        />
        <ClipboardPaste
          v-else-if="hasApplyAction"
          class="h-4 w-4"
        />
        <Clipboard
          v-else
          class="h-4 w-4"
        />
      </button>
    </UiTooltip>
    <p
      v-if="actionError || notice"
      class="absolute bottom-16 right-4 z-30 max-w-64 rounded-md border bg-background px-3 py-2 text-xs font-semibold shadow-lg"
      :class="actionError ? 'border-destructive/35 text-destructive' : 'border-secondary/35 text-secondary'"
    >
      {{ actionError || notice }}
    </p>
  </template>
</template>
