import { describe, expect, it } from 'vitest'
import { groupJobResponses } from '../../src/views/home/homeJobHelpers'
import type { JobResponse } from '../../src/views/home/homeTypes'
import { createMockJob } from '../fixtures/mockApi'

function mockJob(overrides: Partial<JobResponse>): JobResponse {
  return {
    ...(createMockJob({}, 'complete') as JobResponse),
    ...overrides,
  }
}

describe('home job helpers', () => {
  it('groups multi-record batches while leaving old unbatched jobs alone', () => {
    const firstBatchJob = mockJob({
      promptId: 'batch-job-1',
      batchId: 'batch-1',
      batchIndex: 1,
      createdAt: 20,
      updatedAt: 40,
    })
    const oldStandaloneJob = mockJob({
      promptId: 'old-job',
      batchId: null,
      batchIndex: null,
      createdAt: 10,
      updatedAt: 30,
    })
    const secondBatchJob = mockJob({
      promptId: 'batch-job-0',
      batchId: 'batch-1',
      batchIndex: 0,
      createdAt: 15,
      updatedAt: 35,
    })
    const singletonBatchJob = mockJob({
      promptId: 'singleton-job',
      batchId: 'batch-2',
      batchIndex: 0,
      createdAt: 5,
      updatedAt: 25,
    })

    const entries = groupJobResponses([firstBatchJob, oldStandaloneJob, secondBatchJob, singletonBatchJob])

    expect(entries).toHaveLength(3)
    expect(entries[0]).toMatchObject({
      key: 'batch:batch-1',
      batchId: 'batch-1',
      promptIds: ['batch-job-0', 'batch-job-1'],
    })
    expect(entries[0].jobs.map((job) => job.promptId)).toEqual(['batch-job-0', 'batch-job-1'])
    expect(entries[1]).toMatchObject({
      key: 'job:old-job',
      batchId: null,
      promptIds: ['old-job'],
    })
    expect(entries[2]).toMatchObject({
      key: 'job:singleton-job',
      batchId: null,
      promptIds: ['singleton-job'],
    })
  })
})
