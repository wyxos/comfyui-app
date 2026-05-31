const defaultHistoryPageSize = 10
const maxHistoryPageSize = 50

function parsePositiveInteger(value, fallback, max = Number.MAX_SAFE_INTEGER) {
  const parsed = Number.parseInt(String(value ?? ''), 10)
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    return fallback
  }

  return Math.min(parsed, max)
}

function getJobListTabForState(state) {
  if (state === 'queued') {
    return 'queued'
  }

  if (state === 'running' || state === 'cancelling') {
    return 'running'
  }

  return 'history'
}

function getAggregateJobState(groupedJobs) {
  if (groupedJobs.some((job) => job.state === 'running')) {
    return 'running'
  }

  if (groupedJobs.some((job) => job.state === 'cancelling')) {
    return 'cancelling'
  }

  if (groupedJobs.some((job) => job.state === 'queued')) {
    return 'queued'
  }

  if (groupedJobs.some((job) => job.state === 'error')) {
    return 'error'
  }

  if (groupedJobs.some((job) => job.state === 'cancelled')) {
    return 'cancelled'
  }

  if (groupedJobs.some((job) => job.state === 'complete')) {
    return 'complete'
  }

  return groupedJobs[0]?.state ?? 'idle'
}

function groupJobsForList(sortedJobs) {
  const jobsByBatchId = new Map()
  for (const job of sortedJobs) {
    const batchId = typeof job.batchId === 'string' ? job.batchId.trim() : ''
    if (!batchId) {
      continue
    }

    const groupedJobs = jobsByBatchId.get(batchId) ?? []
    groupedJobs.push(job)
    jobsByBatchId.set(batchId, groupedJobs)
  }

  const consumedBatchIds = new Set()
  const groups = []
  for (const job of sortedJobs) {
    const batchId = typeof job.batchId === 'string' ? job.batchId.trim() : ''
    const groupedJobs = batchId ? jobsByBatchId.get(batchId) ?? [] : []
    if (batchId && groupedJobs.length > 1) {
      if (consumedBatchIds.has(batchId)) {
        continue
      }

      consumedBatchIds.add(batchId)
      groups.push({
        tab: getJobListTabForState(getAggregateJobState(groupedJobs)),
        jobs: [...groupedJobs].sort((leftJob, rightJob) => {
          const leftIndex = Number.isInteger(leftJob.batchIndex) ? leftJob.batchIndex : Number.MAX_SAFE_INTEGER
          const rightIndex = Number.isInteger(rightJob.batchIndex) ? rightJob.batchIndex : Number.MAX_SAFE_INTEGER
          if (leftIndex !== rightIndex) {
            return leftIndex - rightIndex
          }

          return leftJob.createdAt - rightJob.createdAt
        }),
      })
      continue
    }

    groups.push({
      tab: getJobListTabForState(job.state),
      jobs: [job],
    })
  }

  return groups
}

export function buildPagedJobList(sortedJobs, url) {
  const groups = groupJobsForList(sortedJobs)
  const runningGroups = groups.filter((group) => group.tab === 'running')
  const queuedGroups = groups.filter((group) => group.tab === 'queued')
  const historyGroups = groups.filter((group) => group.tab === 'history')
  const shouldPageHistory = url.searchParams.has('historyPage') || url.searchParams.has('historyLimit')
  const pageSize = shouldPageHistory
    ? parsePositiveInteger(url.searchParams.get('historyLimit'), defaultHistoryPageSize, maxHistoryPageSize)
    : Math.max(1, historyGroups.length)
  const totalPages = Math.max(1, Math.ceil(historyGroups.length / pageSize))
  const page = Math.min(parsePositiveInteger(url.searchParams.get('historyPage'), 1), totalPages)
  const historyStart = (page - 1) * pageSize
  const pagedHistoryGroups = shouldPageHistory
    ? historyGroups.slice(historyStart, historyStart + pageSize)
    : historyGroups

  return {
    jobs: [
      ...runningGroups,
      ...queuedGroups,
      ...pagedHistoryGroups,
    ].flatMap((group) => group.jobs),
    counts: {
      running: runningGroups.length,
      queued: queuedGroups.length,
      history: historyGroups.length,
    },
    history: {
      page,
      pageSize,
      totalItems: historyGroups.length,
      totalPages,
    },
  }
}
