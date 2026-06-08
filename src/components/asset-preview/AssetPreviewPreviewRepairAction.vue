<script setup lang="ts">
import { LoaderCircle, RefreshCw } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import { Button } from '@/components/ui/button'
import type { AssetPreviewDownload } from './assetPreviewTypes'

const props = defineProps<{
  download: AssetPreviewDownload | null
  repairDownloadPreviews?: (download: AssetPreviewDownload) => void | Promise<void>
}>()

const notice = ref('')
const error = ref('')
const isRepairing = ref(false)
const canRepair = computed(() =>
  Boolean(props.repairDownloadPreviews && props.download?.id && props.download.state === 'complete'),
)
const downloadLabel = computed(() => props.download?.fileName || 'selected model')

async function repairPreviews() {
  if (!canRepair.value || !props.download || isRepairing.value) {
    return
  }

  notice.value = ''
  error.value = ''
  isRepairing.value = true
  try {
    await props.repairDownloadPreviews?.(props.download)
    notice.value = 'Preview backfill started.'
  } catch (caughtError) {
    error.value = caughtError instanceof Error ? caughtError.message : 'Could not backfill previews.'
  } finally {
    isRepairing.value = false
  }
}

watch(() => props.download?.id ?? '', () => {
  notice.value = ''
  error.value = ''
})
</script>

<template>
  <section
    v-if="canRepair"
    class="border-t border-border pt-5"
  >
    <Button
      type="button"
      variant="outline"
      size="sm"
      class="w-full"
      :disabled="isRepairing"
      :aria-label="`Backfill previews for ${downloadLabel}`"
      @click="repairPreviews"
    >
      <LoaderCircle
        v-if="isRepairing"
        data-icon="inline-start"
        class="animate-spin"
      />
      <RefreshCw
        v-else
        data-icon="inline-start"
      />
      Backfill previews
    </Button>
    <p
      v-if="notice || error"
      class="mt-2 text-xs font-semibold"
      :class="error ? 'text-destructive' : 'text-secondary'"
    >
      {{ error || notice }}
    </p>
  </section>
</template>
