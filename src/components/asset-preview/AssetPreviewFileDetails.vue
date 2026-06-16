<script setup lang="ts">
import {
  fileSizeKb,
  formatFileSize,
} from './assetPreviewHelpers'
import type { CivitaiModelFile } from './assetPreviewTypes'

defineProps<{
  file: CivitaiModelFile
  fallbackFileName?: string | null
}>()
</script>

<template>
  <section class="space-y-3 border-t border-border pt-5">
    <p class="text-xs font-semibold uppercase tracking-[0.22em] text-secondary">Selected version</p>
    <dl
      class="overflow-hidden rounded-md border border-border bg-background text-xs text-card-foreground divide-y divide-border/70"
      data-test="asset-preview-file-detail-group"
    >
      <div class="flex items-center justify-between gap-3 px-3 py-2.5">
        <dt class="text-muted-foreground">File</dt>
        <dd
          class="min-w-0 truncate font-semibold"
          data-test="asset-preview-selected-version-file-name"
        >
          {{ file.name ?? fallbackFileName ?? 'Unknown' }}
        </dd>
      </div>
      <div class="flex items-center justify-between gap-3 px-3 py-2.5">
        <dt class="text-muted-foreground">Size</dt>
        <dd class="font-semibold">{{ formatFileSize(fileSizeKb(file)) }}</dd>
      </div>
      <div class="flex items-center justify-between gap-3 px-3 py-2.5">
        <dt class="text-muted-foreground">Format</dt>
        <dd class="font-semibold">{{ file.metadata?.format ?? 'Unknown' }}</dd>
      </div>
      <div class="flex items-center justify-between gap-3 px-3 py-2.5">
        <dt class="text-muted-foreground">Pickle scan</dt>
        <dd class="font-semibold">{{ file.pickleScanResult ?? 'Unknown' }}</dd>
      </div>
      <div class="flex items-center justify-between gap-3 px-3 py-2.5">
        <dt class="text-muted-foreground">Virus scan</dt>
        <dd class="font-semibold">{{ file.virusScanResult ?? 'Unknown' }}</dd>
      </div>
    </dl>
  </section>
</template>
