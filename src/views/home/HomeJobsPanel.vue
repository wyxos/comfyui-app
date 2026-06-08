<script setup lang="ts">
import {
  AlertCircle,
  Check,
  Copy,
  FolderOpen,
  ImageOff,
  LoaderCircle,
  Trash2,
  XCircle,
} from 'lucide-vue-next'
import { computed } from 'vue'
import UiPreloadedMedia from '../../components/ui/UiPreloadedMedia.vue'
import UiTooltip from '../../components/ui/UiTooltip.vue'
import { useProvidedHomeView } from './homeViewContext'

const {
  activePromptId,
  jobListTab,
  currentNodeLabel,
  currentSeed,
  copiedOutputPath,
  openingOutputFolder,
  outputFolderTooltip,
  latestOutput,
  queuePanelNotice,
  jobListTabs,
  queueActionError,
  jobHistory,
  visibleJobEntries,
  visibleJobsEmptyState,
  historyPageRangeLabel,
  canGoPreviousHistoryPage,
  canGoNextHistoryPage,
  isCancellingQueuedJobs,
  isJobEntryActive,
  getJobEntryPrimaryLabel,
  getJobEntryVariantSummary,
  getJobEntryStateLabel,
  getJobEntrySecondaryLabel,
  getJobEntryElapsedMs,
  getJobEntryReferenceLabel,
  getJobEntryPreviewVisibleOutputs,
  getJobEntryPreviewHiddenOutputCount,
  getJobEntryPreviewOutputKey,
  formatElapsed,
  copyOutputPath,
  cancelQueuedJobs,
  deleteJobEntry,
  isDeletingJobEntry,
  goToHistoryPage,
  openOutputParentFolder,
  openGeneratedOutputContextMenu,
  selectJobEntry,
} = useProvidedHomeView()

const queuedJobCount = computed(() => jobListTabs.value.find((tab) => tab.value === 'queued')?.count ?? 0)

function confirmDeleteJob(entry: Parameters<typeof deleteJobEntry>[0]) {
  const label = getJobEntryPrimaryLabel(entry)
  if (window.confirm(`Delete ${label} from companion and ComfyUI history? Generated files will be kept.`)) {
    void deleteJobEntry(entry, false)
  }
}

function confirmDeleteJobAndOutputs(entry: Parameters<typeof deleteJobEntry>[0]) {
  const label = getJobEntryPrimaryLabel(entry)
  if (window.confirm(`Delete ${label} from companion and ComfyUI history, and remove its generated image files? This cannot be undone.`)) {
    void deleteJobEntry(entry, true)
  }
}
</script>

<template>
  <aside
    class="flex min-h-0 min-w-0 flex-col border-t border-primary-foreground/12 bg-primary px-4 py-4 text-primary-foreground sm:px-6 lg:border-t-0 lg:border-l"
  >
    <div
      class="shrink-0 space-y-3 pr-1"
      data-testid="home-job-list-header"
    >
      <p
        v-if="queuePanelNotice"
        class="text-xs leading-6 text-primary-foreground/72"
      >
        {{ queuePanelNotice }}
      </p>

      <div class="flex items-stretch gap-2">
        <div class="grid min-w-0 flex-1 grid-cols-3 gap-2 rounded-md border border-primary-foreground/12 bg-primary-foreground/6 p-1">
          <button
            v-for="tab in jobListTabs"
            :key="tab.value"
            type="button"
            class="inline-flex items-center justify-between gap-2 rounded-sm px-3 py-2 text-xs font-semibold transition"
            :class="
              jobListTab === tab.value
                ? 'bg-secondary text-secondary-foreground shadow-sm'
                : 'text-primary-foreground/70 hover:bg-primary-foreground/8 hover:text-accent'
            "
            @click="jobListTab = tab.value"
          >
            <span>{{ tab.label }}</span>
            <span
              class="rounded-sm border border-primary-foreground/14 bg-background px-1.5 py-0.5 text-[10px] leading-none text-primary-foreground"
            >
              {{ tab.count }}
            </span>
          </button>
        </div>

        <UiTooltip
          v-if="queuedJobCount > 0"
          content="Cancel all queued jobs"
        >
          <button
            type="button"
            class="inline-flex h-full w-11 shrink-0 items-center justify-center rounded-md border border-destructive/45 bg-destructive/10 text-destructive transition hover:bg-destructive/16 disabled:cursor-wait disabled:opacity-60"
            aria-label="Cancel all queued jobs"
            :disabled="isCancellingQueuedJobs"
            @click="cancelQueuedJobs"
          >
            <LoaderCircle
              v-if="isCancellingQueuedJobs"
              class="h-4 w-4 animate-spin"
            />
            <XCircle
              v-else
              class="h-4 w-4"
            />
          </button>
        </UiTooltip>
      </div>

      <p
        v-if="queueActionError"
        class="inline-flex items-center gap-2 rounded-sm border border-destructive/45 bg-destructive/16 px-3 py-2 text-xs font-semibold text-destructive"
      >
        <AlertCircle class="h-4 w-4" />
        {{ queueActionError }}
      </p>
    </div>

    <div
      class="companion-scroll mt-3 min-h-0 flex-1 overflow-y-auto pr-1"
      data-testid="home-job-list-scroll"
      aria-label="Generation job list"
    >
      <div
        v-if="visibleJobEntries.length"
        class="space-y-2"
      >
        <div
          v-for="entry in visibleJobEntries"
          :key="entry.key"
          class="relative"
        >
          <button
            type="button"
            class="w-full rounded-md border px-3 py-3 text-left transition"
            :class="
              isJobEntryActive(entry)
                ? 'border-secondary bg-secondary/12 text-primary-foreground'
                : 'border-primary-foreground/12 bg-primary-foreground/6 text-primary-foreground hover:border-accent hover:text-accent'
            "
            @click="selectJobEntry(entry)"
          >
            <div class="flex items-start justify-between gap-3">
              <span class="min-w-0 truncate text-sm font-semibold">
                {{ getJobEntryPrimaryLabel(entry) }}
              </span>
              <span
                class="shrink-0 text-[11px] font-semibold uppercase tracking-[0.16em] text-primary-foreground/62"
                :class="jobListTab === 'history' ? 'mr-20' : ''"
              >
                {{ getJobEntryStateLabel(entry) }}
              </span>
            </div>

            <p class="mt-1 text-xs text-primary-foreground/62">
              {{ getJobEntryVariantSummary(entry) }}
            </p>

            <div class="mt-2 flex items-center justify-between gap-3 text-xs text-primary-foreground/72">
              <span class="min-w-0 truncate">{{ getJobEntrySecondaryLabel(entry) }}</span>
              <span class="shrink-0">{{ formatElapsed(getJobEntryElapsedMs(entry)) }}</span>
            </div>

            <div class="mt-2 flex items-end justify-between gap-3">
              <p class="min-w-0 truncate text-[11px] uppercase tracking-[0.12em] text-primary-foreground/48">
                {{ getJobEntryReferenceLabel(entry) }}
              </p>

              <div
                v-if="jobListTab === 'history' && getJobEntryPreviewVisibleOutputs(entry).length"
                data-testid="job-output-preview-stack"
                class="flex shrink-0 items-center -space-x-4"
                aria-hidden="true"
              >
                <span
                  v-for="(output, index) in getJobEntryPreviewVisibleOutputs(entry)"
                  :key="getJobEntryPreviewOutputKey(output, index)"
                  class="relative h-[100px] w-[100px] overflow-hidden rounded-md border border-primary-foreground/14 bg-primary-foreground/8 ring-2 ring-primary"
                  :style="{ zIndex: getJobEntryPreviewVisibleOutputs(entry).length - index }"
                  @contextmenu="openGeneratedOutputContextMenu($event, output, null)"
                >
                  <UiPreloadedMedia
                    data-testid="job-output-preview"
                    :src="output.url"
                    alt=""
                    label=""
                    media-class="h-full w-full object-cover"
                    loading-class="bg-primary/80 text-primary-foreground"
                    spinner-class="mr-0 h-4 w-4"
                  />
                </span>

                <span
                  v-if="getJobEntryPreviewHiddenOutputCount(entry)"
                  class="relative z-10 inline-flex h-[100px] w-[100px] shrink-0 items-center justify-center rounded-md border border-secondary/40 bg-secondary/14 text-sm font-semibold text-secondary ring-2 ring-primary"
                >
                  +{{ getJobEntryPreviewHiddenOutputCount(entry) }}
                </span>
              </div>
            </div>
          </button>

          <div
            v-if="jobListTab === 'history'"
            class="absolute right-2 top-2 flex items-center gap-1"
          >
            <UiTooltip content="Delete job from companion and ComfyUI history">
              <button
                type="button"
                class="inline-flex h-8 w-8 items-center justify-center rounded-md border border-destructive/40 bg-primary text-destructive shadow-sm transition hover:bg-destructive hover:text-destructive-foreground disabled:cursor-wait disabled:opacity-60"
                :aria-label="`Delete ${getJobEntryPrimaryLabel(entry)} from companion and ComfyUI history`"
                :disabled="isDeletingJobEntry(entry)"
                @click.stop="confirmDeleteJob(entry)"
              >
                <LoaderCircle
                  v-if="isDeletingJobEntry(entry)"
                  class="h-4 w-4 animate-spin"
                />
                <Trash2
                  v-else
                  class="h-4 w-4"
                />
              </button>
            </UiTooltip>

            <UiTooltip content="Delete job from history and remove generated files">
              <button
                type="button"
                class="inline-flex h-8 w-8 items-center justify-center rounded-md border border-destructive/40 bg-primary text-destructive shadow-sm transition hover:bg-destructive hover:text-destructive-foreground disabled:cursor-wait disabled:opacity-60"
                :aria-label="`Delete ${getJobEntryPrimaryLabel(entry)} from history and remove generated files`"
                :disabled="isDeletingJobEntry(entry)"
                @click.stop="confirmDeleteJobAndOutputs(entry)"
              >
                <ImageOff class="h-4 w-4" />
              </button>
            </UiTooltip>
          </div>
        </div>
      </div>

      <p
        v-else
        class="rounded-md border border-primary-foreground/12 bg-primary-foreground/6 px-3 py-3 text-sm text-primary-foreground/62"
      >
        {{ visibleJobsEmptyState }}
      </p>
    </div>

    <div
      class="mt-3 shrink-0 space-y-4 border-t border-primary-foreground/12 pt-3 pr-1"
      data-testid="home-job-list-footer"
    >
      <div
        v-if="jobListTab === 'history' && (canGoPreviousHistoryPage || canGoNextHistoryPage)"
        class="flex items-center justify-between gap-3 rounded-md border border-primary-foreground/12 bg-primary-foreground/6 px-3 py-2"
      >
        <button
          type="button"
          class="inline-flex h-8 items-center rounded-sm border border-primary-foreground/14 px-3 text-xs font-semibold text-primary-foreground/72 transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-45"
          :disabled="!canGoPreviousHistoryPage"
          aria-label="Previous history page"
          @click="goToHistoryPage(jobHistory.page - 1)"
        >
          Previous
        </button>

        <span class="text-xs font-semibold text-primary-foreground/62">
          {{ historyPageRangeLabel }}
        </span>

        <button
          type="button"
          class="inline-flex h-8 items-center rounded-sm border border-primary-foreground/14 px-3 text-xs font-semibold text-primary-foreground/72 transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-45"
          :disabled="!canGoNextHistoryPage"
          aria-label="Next history page"
          @click="goToHistoryPage(jobHistory.page + 1)"
        >
          Next
        </button>
      </div>

      <dl class="grid gap-4 text-sm text-primary-foreground">
        <div>
          <dt class="text-xs font-semibold uppercase tracking-[0.24em] text-primary-foreground/60">
            Prompt Id
          </dt>
          <dd class="mt-2 break-all text-xs leading-6">{{ activePromptId || 'Not started' }}</dd>
        </div>

        <div>
          <dt class="text-xs font-semibold uppercase tracking-[0.24em] text-primary-foreground/60">
            Stage
          </dt>
          <dd class="mt-2">{{ currentNodeLabel || 'Idle' }}</dd>
        </div>

        <div>
          <dt class="text-xs font-semibold uppercase tracking-[0.24em] text-primary-foreground/60">
            Seed
          </dt>
          <dd class="mt-2 break-all text-xs leading-6">
            {{ currentSeed ?? 'Not started' }}
          </dd>
        </div>

        <div>
          <dt class="text-xs font-semibold uppercase tracking-[0.24em] text-primary-foreground/60">
            Output
          </dt>
          <dd class="mt-2">
            <div class="flex min-w-0 items-stretch gap-2">
              <UiTooltip
                v-if="latestOutput"
                class="min-w-0 flex-1"
                :content="latestOutput.fullPath ?? ''"
              >
                <button
                  type="button"
                  class="inline-flex h-11 w-full min-w-0 items-center justify-between gap-2 rounded-md border border-primary-foreground/12 bg-primary-foreground/8 px-3 py-2 text-left text-sm font-medium text-primary-foreground transition hover:border-accent hover:text-accent"
                  @click="copyOutputPath"
                >
                  <span class="truncate">{{ latestOutput.filename }}</span>
                  <Copy
                    v-if="!copiedOutputPath"
                    class="h-4 w-4 shrink-0"
                  />
                  <Check
                    v-else
                    class="h-4 w-4 shrink-0 text-secondary"
                  />
                </button>
              </UiTooltip>

              <span
                v-else
                class="flex h-11 min-w-0 flex-1 items-center rounded-md border border-primary-foreground/12 bg-primary-foreground/8 px-3 py-2 text-sm text-primary-foreground/72"
              >
                <span class="truncate">No output yet</span>
              </span>

              <UiTooltip :content="outputFolderTooltip">
                <button
                  type="button"
                  class="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-primary-foreground/12 bg-primary-foreground/8 text-primary-foreground transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-60"
                  :aria-label="outputFolderTooltip"
                  :disabled="openingOutputFolder"
                  @click="openOutputParentFolder"
                >
                  <FolderOpen class="h-4 w-4" />
                </button>
              </UiTooltip>
            </div>
          </dd>
        </div>
      </dl>
    </div>
  </aside>
</template>
