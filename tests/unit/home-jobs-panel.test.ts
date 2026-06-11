// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
import { computed, defineComponent, h, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'

import HomeJobsPanel from '../../src/views/home/HomeJobsPanel.vue'
import { provideHomeView } from '../../src/views/home/homeViewContext'
import type { JobListEntry, JobOutput, JobResponse } from '../../src/views/home/homeTypes'
import { createMockJob } from '../fixtures/mockApi'

function mountJobsPanel() {
  const latestOutput: JobOutput = {
    filename: 'metadata-output.png',
    subfolder: '',
    type: 'output',
    url: '/api/view?filename=metadata-output.png',
    fullPath: 'C:\\mock\\metadata-output.png',
    parentDirectory: 'C:\\mock',
    variantId: null,
    variantLabel: null,
    promptText: null,
  }
  const job = createMockJob({ prompt: 'fixed rail test prompt' }, 'complete') as JobResponse
  const entry: JobListEntry = {
    key: 'job:prompt-1',
    batchId: null,
    promptIds: ['prompt-1'],
    leadJob: job,
    jobs: [job],
  }
  const mockContext = {
    activePromptId: ref('prompt-1'),
    jobListTab: ref('history'),
    currentNodeLabel: ref('Completed'),
    currentSeed: ref(1234),
    copiedOutputPath: ref(false),
    openingOutputFolder: ref(false),
    outputFolderTooltip: ref('Open output folder'),
    latestOutput: ref(latestOutput),
    queuePanelNotice: ref(''),
    queueActionError: ref(''),
    jobHistory: ref({
      page: 1,
      pageSize: 10,
      totalItems: 548,
      totalPages: 55,
    }),
    visibleJobEntries: ref([entry]),
    visibleJobsEmptyState: ref('No jobs.'),
    historyPageRangeLabel: computed(() => '1-10 of 548'),
    canGoPreviousHistoryPage: ref(false),
    canGoNextHistoryPage: ref(true),
    isCancellingQueuedJobs: ref(false),
    jobListTabs: ref([
      { value: 'running', label: 'Running', count: 0 },
      { value: 'queued', label: 'Queued', count: 0 },
      { value: 'history', label: 'History', count: 548 },
    ]),
    isJobEntryActive: () => true,
    getJobEntryPrimaryLabel: () => 'waiIllustriousSDXL_v170',
    getJobEntryVariantSummary: () => 'Original prompt',
    getJobEntryStateLabel: () => 'Complete',
    getJobEntrySecondaryLabel: () => '1 output ready',
    getJobEntryElapsedMs: () => 7000,
    getJobEntryReferenceLabel: () => '71067b7c...2F1339',
    getJobEntryPreviewVisibleOutputs: () => [latestOutput],
    getJobEntryPreviewHiddenOutputCount: () => 0,
    getJobEntryPreviewOutputKey: () => 'output-1',
    formatElapsed: () => '7s',
    copyOutputPath: vi.fn(),
    cancelQueuedJobs: vi.fn(),
    deleteJobEntry: vi.fn(),
    isDeletingJobEntry: () => false,
    goToHistoryPage: vi.fn(),
    openOutputParentFolder: vi.fn(),
    openGeneratedOutputContextMenu: vi.fn(),
    selectJobEntry: vi.fn(),
  }
  const Wrapper = defineComponent({
    setup() {
      provideHomeView(mockContext as never)

      return () => h(HomeJobsPanel)
    },
  })

  return mount(Wrapper, { attachTo: document.body })
}

describe('HomeJobsPanel', () => {
  it('keeps tabs, pagination, and selected job details outside the scrollable job list', () => {
    const wrapper = mountJobsPanel()

    const header = wrapper.get('[data-testid="home-job-list-header"]')
    const scroll = wrapper.get('[data-testid="home-job-list-scroll"]')
    const footer = wrapper.get('[data-testid="home-job-list-footer"]')

    expect(header.text()).toContain('Running')
    expect(header.text()).toContain('Queued')
    expect(header.text()).toContain('History')

    expect(scroll.text()).toContain('waiIllustriousSDXL_v170')
    expect(scroll.text()).toContain('71067b7c...2F1339')
    expect(scroll.text()).toContain('7s')
    expect(scroll.text()).not.toContain('Time')
    expect(scroll.text()).not.toContain('Prompt Id')
    expect(scroll.text()).not.toContain('Seed')
    expect(scroll.text()).not.toContain('metadata-output.png')
    expect(scroll.text()).not.toContain('Previous')
    expect(scroll.text()).not.toContain('Next')
    expect(scroll.text()).not.toContain('1-10 of 548')
    expect(wrapper.get('[data-testid="job-history-elapsed"]').text()).toBe('7s')

    expect(footer.text()).toContain('Previous')
    expect(footer.text()).toContain('1-10 of 548')
    expect(footer.text()).toContain('Next')
    expect(footer.text()).toContain('Prompt Id')
    expect(footer.text()).toContain('Stage')
    expect(footer.text()).toContain('Seed')
    expect(footer.text()).toContain('Output')
    expect(footer.text()).toContain('metadata-output.png')
  })
})
