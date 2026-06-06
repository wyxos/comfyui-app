<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  Check,
  Clock,
  Download,
  LoaderCircle,
  Trash2,
} from 'lucide-vue-next'
import {
  imagesForVersion,
  modelVersionLabel,
  primaryFileForVersion,
} from './assetPreviewHelpers'
import type {
  AssetPreviewDownload,
  CivitaiModel,
  CivitaiModelVersion,
} from './assetPreviewTypes'

const props = defineProps<{
  modelVersions: CivitaiModelVersion[]
  selectedVersion: CivitaiModelVersion | null
  hasDownloadActions: boolean
  civitaiModel: CivitaiModel | null
  queuingDownloadKey: string
  downloadForVersion: (version: CivitaiModelVersion | null | undefined) => AssetPreviewDownload | null
  downloadStatusLabel: (download: AssetPreviewDownload | null) => string
  modelDownloadKey: (model: CivitaiModel, version: CivitaiModelVersion) => string
  canQueueVersion: (version: CivitaiModelVersion) => boolean
  canDeleteVersionDownload: (version: CivitaiModelVersion) => boolean
  versionDownloadButtonLabel: (version: CivitaiModelVersion) => string
}>()

const emit = defineEmits<{
  select: [version: CivitaiModelVersion]
  queueDownload: [version: CivitaiModelVersion]
  deleteDownload: [version: CivitaiModelVersion]
}>()

const selectedBaseModelFilter = ref('')
const baseModelOptions = computed(() => {
  const counts = new Map<string, number>()
  for (const version of props.modelVersions) {
    const baseModel = version.baseModel?.trim()
    if (baseModel) {
      counts.set(baseModel, (counts.get(baseModel) ?? 0) + 1)
    }
  }

  return Array.from(counts, ([baseModel, count]) => ({ baseModel, count }))
})
const hasBaseModelFilters = computed(() => baseModelOptions.value.length > 1)
const filteredModelVersions = computed(() => {
  return selectedBaseModelFilter.value
    ? props.modelVersions.filter((version) => version.baseModel?.trim() === selectedBaseModelFilter.value)
    : props.modelVersions
})

function applyBaseModelFilter(baseModel: string) {
  selectedBaseModelFilter.value = baseModel

  if (!baseModel || props.selectedVersion?.baseModel?.trim() === baseModel) {
    return
  }

  const nextVersion = props.modelVersions.find((version) =>
    version.baseModel?.trim() === baseModel && imagesForVersion(version).length,
  ) ?? props.modelVersions.find((version) => version.baseModel?.trim() === baseModel)

  if (nextVersion) {
    emit('select', nextVersion)
  }
}

watch(
  () => baseModelOptions.value.map((option) => option.baseModel).join('|'),
  () => {
    if (!baseModelOptions.value.some((option) => option.baseModel === selectedBaseModelFilter.value)) {
      selectedBaseModelFilter.value = ''
    }
  },
)
</script>

<template>
  <section class="space-y-3 border-t border-border pt-5">
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <p class="text-xs font-semibold uppercase tracking-[0.22em] text-secondary">Model versions</p>
        <p
          v-if="hasDownloadActions && selectedVersion && downloadForVersion(selectedVersion)"
          class="mt-1 text-xs text-muted-foreground"
        >
          {{ downloadStatusLabel(downloadForVersion(selectedVersion)) }}
        </p>
      </div>
    </div>

    <div
      v-if="hasBaseModelFilters"
      class="flex flex-wrap gap-1.5"
      aria-label="Filter model versions by base model"
    >
      <button
        class="inline-flex h-7 items-center rounded-sm border px-2 text-[11px] font-semibold transition"
        :class="!selectedBaseModelFilter ? 'border-secondary bg-secondary text-secondary-foreground' : 'border-border bg-background text-muted-foreground hover:border-secondary hover:text-secondary'"
        type="button"
        aria-label="Show all versions"
        :aria-pressed="!selectedBaseModelFilter"
        @click="applyBaseModelFilter('')"
      >
        All
      </button>
      <button
        v-for="option in baseModelOptions"
        :key="option.baseModel"
        class="inline-flex h-7 items-center gap-1 rounded-sm border px-2 text-[11px] font-semibold transition"
        :class="selectedBaseModelFilter === option.baseModel ? 'border-secondary bg-secondary text-secondary-foreground' : 'border-border bg-background text-muted-foreground hover:border-secondary hover:text-secondary'"
        type="button"
        :aria-label="`Show ${option.baseModel} versions`"
        :aria-pressed="selectedBaseModelFilter === option.baseModel"
        @click="applyBaseModelFilter(option.baseModel)"
      >
        {{ option.baseModel }}
        <span class="text-current/70">{{ option.count }}</span>
      </button>
    </div>

    <ul class="grid max-h-64 gap-1 overflow-auto rounded-md border border-border bg-background text-xs">
      <li
        v-for="version in filteredModelVersions"
        :key="version.id"
        class="grid min-w-0 border-b border-border/60 last:border-b-0"
        :class="[
          hasDownloadActions && civitaiModel ? 'grid-cols-[minmax(0,1fr)_auto]' : 'grid-cols-1',
          version.id === selectedVersion?.id
            ? 'border-secondary/40'
            : downloadForVersion(version)
              ? 'border-accent/35'
              : 'border-border/80',
        ]"
      >
        <button
          class="min-w-0 px-2 py-2 text-left text-card-foreground transition hover:bg-accent/10 disabled:cursor-not-allowed disabled:opacity-45"
          type="button"
          :disabled="!imagesForVersion(version).length"
          @click="emit('select', version)"
        >
          <span class="block truncate font-semibold">
            {{ modelVersionLabel(version) }}
          </span>
          <span class="mt-1 block truncate text-muted-foreground">
            {{ primaryFileForVersion(version)?.name ?? 'No model file' }}
          </span>
        </button>

        <div
          v-if="hasDownloadActions && civitaiModel"
          class="flex items-stretch border-l border-border/70"
        >
          <button
            class="inline-flex min-w-[6.5rem] items-center justify-center gap-1 px-2 py-2 font-semibold text-muted-foreground transition hover:bg-secondary hover:text-secondary-foreground disabled:cursor-not-allowed disabled:opacity-50"
            type="button"
            :disabled="!canQueueVersion(version) || queuingDownloadKey === modelDownloadKey(civitaiModel, version)"
            @click.stop="emit('queueDownload', version)"
          >
            <Check
              v-if="downloadForVersion(version)?.state === 'complete'"
              class="h-3.5 w-3.5 text-secondary"
            />
            <LoaderCircle
              v-else-if="downloadForVersion(version)?.state === 'downloading' || queuingDownloadKey === modelDownloadKey(civitaiModel, version)"
              class="h-3.5 w-3.5 animate-spin text-accent"
            />
            <Clock
              v-else-if="downloadForVersion(version)"
              class="h-3.5 w-3.5 text-accent"
            />
            <Download
              v-else
              class="h-3.5 w-3.5"
            />
            {{ versionDownloadButtonLabel(version) }}
          </button>

          <button
            v-if="canDeleteVersionDownload(version)"
            class="inline-flex w-9 items-center justify-center border-l border-destructive/25 text-destructive transition hover:bg-destructive hover:text-destructive-foreground focus:outline-none focus:ring-2 focus:ring-ring/25"
            type="button"
            :aria-label="`Delete ${primaryFileForVersion(version)?.name ?? modelVersionLabel(version)} from disk`"
            title="Delete downloaded file"
            @click.stop="emit('deleteDownload', version)"
          >
            <Trash2 class="h-3.5 w-3.5" />
          </button>
        </div>
      </li>
    </ul>
  </section>
</template>
