<script setup lang="ts">
import {
  Check,
  Copy,
  FolderOpen,
} from 'lucide-vue-next'
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
  visibleJobEntries,
  visibleJobsEmptyState,
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
  openOutputParentFolder,
  selectJobEntry,
} = useProvidedHomeView()
</script>

<template>
      <aside
        class="flex min-h-0 min-w-0 flex-col border-t border-primary-foreground/12 bg-primary px-4 py-4 text-primary-foreground sm:px-6 lg:border-t-0 lg:border-l"
      >
        <div class="companion-scroll min-h-0 flex-1 overflow-y-auto pr-1">
          <dl class="space-y-6 text-sm text-primary-foreground">
            <div>
              <div class="space-y-3">
                <p
                  v-if="queuePanelNotice"
                  class="text-xs leading-6 text-primary-foreground/72"
                >
                  {{ queuePanelNotice }}
                </p>

                <div class="grid grid-cols-3 gap-2 rounded-md border border-primary-foreground/12 bg-primary-foreground/6 p-1">
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

                <div
                  v-if="visibleJobEntries.length"
                  class="space-y-2"
                >
                  <button
                    v-for="entry in visibleJobEntries"
                    :key="entry.key"
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
                      <span class="shrink-0 text-[11px] font-semibold uppercase tracking-[0.16em] text-primary-foreground/62">
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
                        >
                          <img
                            data-testid="job-output-preview"
                            :src="output.url"
                            alt=""
                            class="h-full w-full object-cover"
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
                </div>

                <p
                  v-else
                  class="rounded-md border border-primary-foreground/12 bg-primary-foreground/6 px-3 py-3 text-sm text-primary-foreground/62"
                >
                  {{ visibleJobsEmptyState }}
                </p>
              </div>
            </div>

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
