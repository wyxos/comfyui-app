<script setup lang="ts">
import {
  Check,
  ExternalLink,
  FileDown,
  LoaderCircle,
  Pause,
  Play,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-vue-next'
import UiPreloadedMedia from '../../components/ui/UiPreloadedMedia.vue'
import type { AssetDownloadItem, AssetDownloadState } from '../../composables/useAssetDownloads'

type DownloadTableRowState = AssetDownloadState | 'watched'
type DownloadTableRowItem = Omit<AssetDownloadItem, 'state'> & { state: DownloadTableRowState }

const props = withDefaults(defineProps<{
  item: DownloadTableRowItem
  actionKey: string
  blurNsfwPreview?: boolean
}>(), {
  blurNsfwPreview: false,
})

const emit = defineEmits<{
  pause: [item: DownloadTableRowItem]
  resume: [item: DownloadTableRowItem]
  cancel: [item: DownloadTableRowItem]
  redownload: [item: DownloadTableRowItem]
  'delete-file': [item: DownloadTableRowItem]
}>()

type DownloadAction = 'pause' | 'resume' | 'cancel' | 'delete' | 'redownload'

const statusToneClass: Record<DownloadTableRowState, string> = {
  queued: 'border-accent/35 bg-accent/10 text-accent',
  downloading: 'border-accent/35 bg-accent/10 text-accent',
  paused: 'border-secondary/45 bg-secondary/10 text-secondary',
  complete: 'border-secondary/45 bg-secondary/10 text-secondary',
  error: 'border-destructive/45 bg-destructive/10 text-destructive',
  cancelled: 'border-muted bg-muted text-muted-foreground',
  deleted: 'border-border bg-background text-muted-foreground',
  watched: 'border-secondary/45 bg-secondary/10 text-secondary',
}

function normalizedModelType(item: DownloadTableRowItem) {
  const normalized = item.modelType.trim().toLowerCase()
  return normalized === 'checkpoint' ? 'checkpoint' : normalized === 'lora' ? 'lora' : ''
}

function modelTypeLabel(item: DownloadTableRowItem) {
  return normalizedModelType(item) === 'lora' ? 'LoRA' : 'Checkpoint'
}

function statusLabel(item: DownloadTableRowItem) {
  if (item.state === 'complete') {
    return 'Downloaded'
  }

  if (item.state === 'downloading') {
    return item.progressPercent === null || item.progressPercent === undefined
      ? 'Downloading'
      : `${Math.round(item.progressPercent)}%`
  }

  if (item.state === 'queued') {
    return 'Queued'
  }

  if (item.state === 'paused') {
    return 'Paused'
  }

  if (item.state === 'deleted') {
    return 'Deleted'
  }

  if (item.state === 'watched') {
    return 'Watched'
  }

  if (item.state === 'error') {
    return 'Failed'
  }

  return 'Cancelled'
}

function progressWidth(item: DownloadTableRowItem) {
  if (item.state === 'complete') {
    return '100%'
  }

  return `${Math.max(0, Math.min(100, item.progressPercent ?? 0))}%`
}

function previewFor(item: DownloadTableRowItem) {
  return item.previewUrl ?? item.previewPaths?.find((preview) => preview.url)?.url ?? ''
}

function isVideoPreview(item: DownloadTableRowItem) {
  return item.previewPaths?.some((preview) => preview.url === previewFor(item) && preview.mediaType === 'video') ?? false
}

function isNsfwValue(value: unknown) {
  if (typeof value === 'boolean') {
    return value
  }

  if (typeof value === 'number') {
    return value > 0
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    return Boolean(normalized && !['false', '0', 'no', 'n', 'none', 'safe', 'not detected', 'not_detected'].includes(normalized))
  }

  return false
}

function shouldBlurPreview(item: DownloadTableRowItem) {
  return props.blurNsfwPreview && isNsfwValue(item.modelNsfw ?? item.modelMetadata?.nsfw)
}

function formatFileSize(item: DownloadTableRowItem) {
  if (item.state === 'watched') {
    return 'Pending'
  }

  const bytes = item.fileSizeKb ? item.fileSizeKb * 1024 : item.totalBytes || item.bytesDownloaded || 0
  if (!bytes) {
    return 'Unknown'
  }

  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
  }

  if (bytes >= 1024 * 1024) {
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  }

  return `${Math.round(bytes / 1024)} KB`
}

function formatDate(value: number | null | undefined) {
  if (!value) {
    return 'Unknown'
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function canDeleteFile(item: DownloadTableRowItem) {
  return item.state === 'complete'
}

function canRedownload(item: DownloadTableRowItem) {
  return item.state !== 'downloading' && item.state !== 'queued' && item.state !== 'watched'
}

function civitaiModelUrl(item: DownloadTableRowItem) {
  if (!item.modelId) {
    return ''
  }

  const params = new URLSearchParams()
  if (item.versionId) {
    params.set('modelVersionId', String(item.versionId))
  }

  const query = params.toString()
  return `https://civitai.com/models/${item.modelId}${query ? `?${query}` : ''}`
}

function isBusy(action: DownloadAction) {
  return props.actionKey === `${action}:${props.item.id}`
}

function pathLabel(item: DownloadTableRowItem) {
  if (item.state === 'watched') {
    return item.targetPath || 'Waiting for Civitai'
  }

  return item.targetPath || 'Unknown target path'
}
</script>

<template>
  <tr class="bg-card/80 transition hover:bg-accent/5">
    <td class="px-3 py-2">
      <div class="flex min-w-0 items-center gap-3">
        <div class="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-sm border border-border bg-background">
          <UiPreloadedMedia
            v-if="previewFor(item)"
            :src="previewFor(item) ?? ''"
            :is-video="isVideoPreview(item)"
            :alt="`${item.modelName} preview`"
            label=""
            :media-class="[
              'h-full w-full object-cover',
              shouldBlurPreview(item) ? 'scale-110 blur-sm saturate-50' : '',
            ].filter(Boolean).join(' ')"
            loading-class="bg-background text-muted-foreground"
            spinner-class="mr-0 h-4 w-4"
            muted
            playsinline
            preload="metadata"
            :loading="isVideoPreview(item) ? undefined : 'lazy'"
          />
          <FileDown
            v-else
            class="h-5 w-5 text-muted-foreground"
          />
        </div>

        <div class="min-w-0">
          <p
            class="truncate text-sm font-semibold text-card-foreground"
            :title="item.modelName"
          >
            {{ item.modelName }}
          </p>
          <p
            class="mt-0.5 truncate text-[11px] text-muted-foreground"
            :title="`${item.versionName} - ${item.fileName}`"
          >
            {{ item.versionName }} - {{ item.fileName }}
          </p>
          <div class="mt-1 h-1.5 w-44 max-w-full overflow-hidden rounded-full bg-muted">
            <div
              class="h-full rounded-full transition-all"
              :class="item.state === 'error' ? 'bg-destructive' : item.state === 'complete' ? 'bg-secondary' : 'bg-accent'"
              :style="{ width: progressWidth(item) }"
            />
          </div>
        </div>
      </div>
    </td>

    <td class="px-3 py-2">
      <span class="inline-flex rounded-sm border border-border bg-background px-2 py-1 font-semibold text-muted-foreground">
        {{ modelTypeLabel(item) }}
      </span>
    </td>

    <td class="px-3 py-2">
      <span
        class="inline-flex min-w-[6rem] justify-center rounded-sm border px-2 py-1 font-semibold"
        :class="statusToneClass[item.state]"
      >
        <Check
          v-if="item.state === 'complete'"
          class="mr-1 h-3.5 w-3.5"
        />
        <LoaderCircle
          v-else-if="item.state === 'downloading'"
          class="mr-1 h-3.5 w-3.5 animate-spin"
        />
        {{ statusLabel(item) }}
      </span>
    </td>

    <td class="px-3 py-2 text-muted-foreground">
      {{ formatFileSize(item) }}
    </td>

    <td class="max-w-[22rem] px-3 py-2">
      <p
        class="truncate text-[11px] text-muted-foreground"
        :class="item.state === 'watched' ? '' : 'font-mono'"
        :title="pathLabel(item)"
      >
        {{ pathLabel(item) }}
      </p>
      <p
        v-if="item.error"
        class="mt-1 truncate text-[11px] text-destructive"
        :title="item.error"
      >
        {{ item.error }}
      </p>
    </td>

    <td class="px-3 py-2 text-muted-foreground">
      {{ formatDate(item.updatedAt) }}
    </td>

    <td class="px-3 py-2">
      <div class="flex justify-end gap-1.5">
        <button
          v-if="item.state === 'downloading' || item.state === 'queued'"
          class="inline-flex h-8 w-8 items-center justify-center rounded-sm border border-border text-muted-foreground transition hover:border-secondary/60 hover:text-secondary disabled:cursor-wait disabled:opacity-60"
          type="button"
          :disabled="Boolean(actionKey)"
          :aria-label="`Pause ${item.modelName}`"
          @click="emit('pause', item)"
        >
          <LoaderCircle
            v-if="isBusy('pause')"
            class="h-4 w-4 animate-spin"
          />
          <Pause
            v-else
            class="h-4 w-4"
          />
        </button>

        <button
          v-if="item.state === 'paused' || item.state === 'error' || item.state === 'cancelled'"
          class="inline-flex h-8 w-8 items-center justify-center rounded-sm border border-border text-muted-foreground transition hover:border-secondary/60 hover:text-secondary disabled:cursor-wait disabled:opacity-60"
          type="button"
          :disabled="Boolean(actionKey)"
          :aria-label="`Resume ${item.modelName}`"
          @click="emit('resume', item)"
        >
          <LoaderCircle
            v-if="isBusy('resume')"
            class="h-4 w-4 animate-spin"
          />
          <Play
            v-else
            class="h-4 w-4"
          />
        </button>

        <button
          v-if="item.state !== 'complete' && item.state !== 'deleted' && item.state !== 'cancelled' && item.state !== 'watched'"
          class="inline-flex h-8 w-8 items-center justify-center rounded-sm border border-border text-muted-foreground transition hover:border-destructive/70 hover:text-destructive disabled:cursor-wait disabled:opacity-60"
          type="button"
          :disabled="Boolean(actionKey)"
          :aria-label="`Cancel ${item.modelName}`"
          @click="emit('cancel', item)"
        >
          <LoaderCircle
            v-if="isBusy('cancel')"
            class="h-4 w-4 animate-spin"
          />
          <X
            v-else
            class="h-4 w-4"
          />
        </button>

        <a
          v-if="civitaiModelUrl(item)"
          class="inline-flex h-8 w-8 items-center justify-center rounded-sm border border-border text-muted-foreground transition hover:border-secondary/60 hover:text-secondary focus:outline-none focus:ring-2 focus:ring-ring/25"
          :href="civitaiModelUrl(item)"
          target="_blank"
          rel="noopener noreferrer"
          :aria-label="`Open ${item.modelName} on Civitai`"
          :title="`Open ${item.fileName} on Civitai`"
        >
          <ExternalLink class="h-4 w-4" />
        </a>

        <button
          v-if="canRedownload(item)"
          class="inline-flex h-8 w-8 items-center justify-center rounded-sm border border-border text-muted-foreground transition hover:border-accent/70 hover:text-accent disabled:cursor-wait disabled:opacity-60"
          type="button"
          :disabled="Boolean(actionKey)"
          :aria-label="`Redownload ${item.modelName}`"
          @click="emit('redownload', item)"
        >
          <LoaderCircle
            v-if="isBusy('redownload')"
            class="h-4 w-4 animate-spin"
          />
          <RotateCcw
            v-else
            class="h-4 w-4"
          />
        </button>

        <button
          v-if="canDeleteFile(item)"
          class="inline-flex h-8 w-8 items-center justify-center rounded-sm border border-border text-muted-foreground transition hover:border-destructive/70 hover:text-destructive disabled:cursor-wait disabled:opacity-60"
          type="button"
          :disabled="Boolean(actionKey)"
          :aria-label="`Delete ${item.modelName} from disk`"
          @click="emit('delete-file', item)"
        >
          <LoaderCircle
            v-if="isBusy('delete')"
            class="h-4 w-4 animate-spin"
          />
          <Trash2
            v-else
            class="h-4 w-4"
          />
        </button>
      </div>
    </td>
  </tr>
</template>
