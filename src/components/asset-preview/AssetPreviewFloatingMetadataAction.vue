<script setup lang="ts">
import { computed, ref } from 'vue'
import { ClipboardPaste, LoaderCircle } from 'lucide-vue-next'

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
const canShow = computed(() =>
  !props.loading &&
  typeof props.applyGenerationMetadata === 'function' &&
  Boolean(props.metadataSource),
)

async function applyMetadata() {
  if (
    pending.value ||
    !props.metadataSource ||
    typeof props.applyGenerationMetadata !== 'function'
  ) {
    return
  }

  pending.value = true
  actionError.value = ''

  try {
    await props.applyGenerationMetadata(props.metadataSource)
    emit('applied')
  } catch (error) {
    actionError.value = error instanceof Error ? error.message : 'Could not apply generation metadata.'
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <template v-if="canShow">
    <UiTooltip
      class="absolute bottom-4 right-4 z-30"
      content="Apply metadata"
    >
      <button
        type="button"
        data-test="asset-preview-floating-apply-metadata"
        class="inline-flex size-11 items-center justify-center rounded-md border border-secondary/35 bg-secondary text-secondary-foreground shadow-lg shadow-black/35 transition hover:bg-accent hover:text-accent-foreground focus:outline-none focus:ring-2 focus:ring-ring/40 disabled:cursor-wait disabled:opacity-70"
        :disabled="pending"
        aria-label="Apply metadata"
        @click.stop="applyMetadata"
      >
        <LoaderCircle
          v-if="pending"
          class="h-4 w-4 animate-spin"
        />
        <ClipboardPaste
          v-else
          class="h-4 w-4"
        />
      </button>
    </UiTooltip>
    <p
      v-if="actionError"
      class="absolute bottom-16 right-4 z-30 max-w-64 rounded-md border border-destructive/35 bg-background px-3 py-2 text-xs font-semibold text-destructive shadow-lg"
    >
      {{ actionError }}
    </p>
  </template>
</template>
