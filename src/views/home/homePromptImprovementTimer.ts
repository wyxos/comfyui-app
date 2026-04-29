import { PROMPT_IMPROVEMENT_TIMER_INTERVAL_MS } from './homeConstants'
import type { HomeState } from './homeState'

export function createHomePromptImprovementTimer(state: HomeState) {
const { promptImprovementElapsedMs, promptImprovementStartedAt } = state
let promptImprovementTimer: number | null = null

function clearPromptImprovementTimer() {
  if (promptImprovementTimer === null) {
    return
  }

  window.clearInterval(promptImprovementTimer)
  promptImprovementTimer = null
}

function syncPromptImprovementElapsed() {
  if (promptImprovementStartedAt.value === null) {
    promptImprovementElapsedMs.value = 0
    return
  }

  promptImprovementElapsedMs.value = Math.max(0, Date.now() - promptImprovementStartedAt.value)
}

function capturePromptImprovementElapsed() {
  syncPromptImprovementElapsed()
  return promptImprovementElapsedMs.value
}

function startPromptImprovementTimer() {
  promptImprovementStartedAt.value = Date.now()
  promptImprovementElapsedMs.value = 0
  clearPromptImprovementTimer()
  syncPromptImprovementElapsed()
  promptImprovementTimer = window.setInterval(syncPromptImprovementElapsed, PROMPT_IMPROVEMENT_TIMER_INTERVAL_MS)
}

function finishPromptImprovementTimer() {
  const elapsedMs = capturePromptImprovementElapsed()
  clearPromptImprovementTimer()
  promptImprovementStartedAt.value = null
  return elapsedMs
}

return {
  capturePromptImprovementElapsed,
  clearPromptImprovementTimer,
  finishPromptImprovementTimer,
  startPromptImprovementTimer,
}
}
