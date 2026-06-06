import { computed, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'

import { createHomePreviewModalActions } from '../../src/views/home/homePreviewModalActions'
import { createHomePreviewPlaceholderHelpers } from '../../src/views/home/homePreviewPlaceholderHelpers'
import type { JobResponse, PreviewDisplayItem } from '../../src/views/home/homeTypes'
import { createMockJob } from '../fixtures/mockApi'

function createRunningPromptJob(): JobResponse {
  return {
    ...(createMockJob({}, 'running') as JobResponse),
    promptId: 'prompt-running',
    currentNodeLabel: 'Sampling prompt',
    progressValue: 14,
    progressMax: 30,
    progressPercent: 47,
  }
}

function createPromptPlaceholder(job: JobResponse): PreviewDisplayItem {
  return {
    key: `${job.promptId}:prompt`,
    promptId: job.promptId,
    checkpointName: job.checkpoint,
    job: null,
    variantId: 'prompt',
    variantLabel: 'Prompt',
    promptText: 'test prompt',
    output: null,
    isPlaceholder: true,
  }
}

describe('home preview placeholder helpers', () => {
  it('shows progress for a running single prompt placeholder', () => {
    const runningJob = createRunningPromptJob()
    const placeholder = createPromptPlaceholder(runningJob)
    const previewDisplayItems = computed(() => [placeholder])
    const helpers = createHomePreviewPlaceholderHelpers({
      errorMessage: ref(''),
      isSubmittingGenerate: ref(false),
      jobsList: ref([runningJob]),
      previewDisplayItems,
      statusLine: ref('Ready'),
    })

    expect(helpers.getPreviewPlaceholderStatus(placeholder)).toBe('Generating')
    expect(helpers.getPreviewPlaceholderProgressPercent(placeholder)).toBe(47)
    expect(helpers.shouldShowPreviewPlaceholderIndeterminate(placeholder)).toBe(false)
  })

  it('uses the same running placeholder progress in modal actions', () => {
    const runningJob = createRunningPromptJob()
    const placeholder = createPromptPlaceholder(runningJob)
    const previewDisplayItems = computed(() => [placeholder])
    const actions = createHomePreviewModalActions({
      activePreviewIndex: ref(0),
      canNavigatePreviewModal: computed(() => false),
      closeResetDialog: vi.fn(),
      errorMessage: ref(''),
      isPreviewModalDragging: ref(false),
      isPreviewModalOpen: ref(false),
      isPreviewModalPannable: computed(() => false),
      isResetDialogOpen: ref(false),
      isSubmittingGenerate: ref(false),
      jobsList: ref([runningJob]),
      previewDisplayItems,
      previewModalOffsetX: ref(0),
      previewModalOffsetY: ref(0),
      previewModalOutputIndexes: computed(() => []),
      previewModalPanField: ref(null),
      previewModalScale: ref(1),
      previewModalViewport: ref(null),
      selectedPreviewModalOutputPosition: computed(() => -1),
      statusLine: ref('Ready'),
    })

    expect(actions.getPreviewPlaceholderStatus(placeholder)).toBe('Generating')
    expect(actions.getPreviewPlaceholderProgressPercent(placeholder)).toBe(47)
    expect(actions.shouldShowPreviewPlaceholderIndeterminate(placeholder)).toBe(false)
  })
})
