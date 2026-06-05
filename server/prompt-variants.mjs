import { safeTrim } from './shared.mjs'

export function buildRequestedPromptVariants(promptText) {
  const trimmedPrompt = safeTrim(promptText)
  if (!trimmedPrompt) {
    return []
  }

  return [
    {
      id: 'prompt',
      label: 'Prompt',
      promptText: trimmedPrompt,
    },
  ]
}

export function extractPromptRejectionMessage(payload) {
  const errorMessage = safeTrim(payload?.error?.message)
  const errorDetails = safeTrim(payload?.error?.details)

  if (errorMessage && errorDetails) {
    return `${errorMessage} (${errorDetails})`
  }

  if (errorMessage) {
    return errorMessage
  }

  const firstNodeError = Object.values(payload?.node_errors ?? {}).find((entry) => entry)
  const nodeErrorMessage = safeTrim(firstNodeError?.errors?.[0]?.message)
  if (nodeErrorMessage) {
    return nodeErrorMessage
  }

  return 'ComfyUI rejected the workflow before queueing it.'
}
