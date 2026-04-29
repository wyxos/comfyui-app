import type { HomeSelectionComputed } from './homeSelectionComputed'
import type { HomeState } from './homeState'
import type { InputImageSnapshot, JobResponse } from './homeTypes'
import { coerceTrimmedFieldString } from './homeValueHelpers'

export function createHomeImageSnapshots(state: HomeState, selection: HomeSelectionComputed) {
const { submittedInputImageSnapshots, uploadedInputImageName } = state
const { selectedInputImageName, shouldUseInputImage } = selection

function buildStoredInputImagePreviewUrl(inputImageName: string) {
  const params = new URLSearchParams({
    filename: inputImageName,
    subfolder: '',
    type: 'input',
  })

  return `/api/view?${params.toString()}`
}

function buildInputImageSnapshot(inputImageName: string | null | undefined, displayName?: string | null) {
  const trimmedInputImageName = coerceTrimmedFieldString(inputImageName)
  if (!trimmedInputImageName) {
    return null
  }

  return {
    name: coerceTrimmedFieldString(displayName) || trimmedInputImageName,
    url: buildStoredInputImagePreviewUrl(trimmedInputImageName),
  }
}

function buildCurrentInputImageSnapshot() {
  if (!shouldUseInputImage.value) {
    return null
  }

  return buildInputImageSnapshot(uploadedInputImageName.value, selectedInputImageName.value)
}

function getJobInputImageSnapshot(job: JobResponse | null) {
  if (!job) {
    return null
  }

  return (
    buildInputImageSnapshot(job.inputImageName, job.inputImageDisplayName) ??
    submittedInputImageSnapshots.value[job.promptId] ??
    null
  )
}

function syncSubmittedInputImageSnapshots(promptIds: string[], snapshot: InputImageSnapshot | null) {
  const nextSnapshots = { ...submittedInputImageSnapshots.value }

  for (const promptId of promptIds) {
    if (!promptId) {
      continue
    }

    if (snapshot) {
      nextSnapshots[promptId] = snapshot
    } else {
      delete nextSnapshots[promptId]
    }
  }

  submittedInputImageSnapshots.value = nextSnapshots
}

return {
  buildStoredInputImagePreviewUrl,
  buildInputImageSnapshot,
  buildCurrentInputImageSnapshot,
  getJobInputImageSnapshot,
  syncSubmittedInputImageSnapshots,
}
}
