import { computed } from 'vue'
import { describe, expect, it, vi } from 'vitest'

import { createHomeJobPollingActions } from '../../src/views/home/homeJobPollingActions'
import { createHomeState } from '../../src/views/home/homeState'
import type { JobResponse } from '../../src/views/home/homeTypes'
import { createMockJob } from '../fixtures/mockApi'

function createPollingActionsForState(state = createHomeState()) {
  return createHomeJobPollingActions(
    state,
    { selectedJob: computed(() => null) } as never,
    { previewDisplayItems: computed(() => []) } as never,
    {} as never,
    { visibleJobEntries: computed(() => []) } as never,
    {
      apiJson: vi.fn(),
      formatElapsed: () => '4s',
      setIdleState: vi.fn(),
      syncBatchPreviewState: vi.fn(),
    },
  )
}

describe('home job polling actions', () => {
  it('uses the ComfyUI error as the failed status detail', () => {
    const state = createHomeState()
    const polling = createPollingActionsForState(state)
    const job = createMockJob({}, 'error') as JobResponse
    job.currentNodeLabel = 'Failed'
    job.error = 'ERROR: VAE is invalid: None'

    polling.applySelectedJobState(job)

    expect(state.statusLine.value).toBe('Failed')
    expect(state.detailLine.value).toBe('ERROR: VAE is invalid: None')
    expect(state.errorMessage.value).toBe('ERROR: VAE is invalid: None')
  })
})
