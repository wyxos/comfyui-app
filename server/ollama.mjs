import { defaultOllamaModel, ollamaTimeoutMs, ollamaUrl } from './config.mjs'
import { safeTrim, tryParseJson } from './shared.mjs'
import { safeModelName } from './model-paths.mjs'

export async function ollamaFetchJson(pathname, options = {}) {
  const { method = 'POST', payload, signal: externalSignal = null } = options
  const controller = new AbortController()
  let didAbortByCaller = false
  const handleExternalAbort = () => {
    didAbortByCaller = true
    controller.abort()
  }

  if (externalSignal) {
    if (externalSignal.aborted) {
      handleExternalAbort()
    } else {
      externalSignal.addEventListener('abort', handleExternalAbort, { once: true })
    }
  }

  const timeoutId = setTimeout(() => {
    controller.abort()
  }, ollamaTimeoutMs)

  try {
    const requestInit = {
      method,
      signal: controller.signal,
    }

    if (method !== 'GET') {
      requestInit.headers = {
        'Content-Type': 'application/json; charset=utf-8',
      }
      requestInit.body = JSON.stringify(payload ?? {})
    }

    const response = await fetch(new URL(pathname, ollamaUrl), requestInit)

    const text = await response.text()
    const parsedPayload = text ? tryParseJson(text) ?? text : null

    if (!response.ok) {
      const error = new Error('Ollama request failed.')
      error.statusCode = response.status
      error.payload = parsedPayload
      throw error
    }

    return parsedPayload
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      if (didAbortByCaller) {
        throw new Error('Ollama request cancelled.', { cause: error })
      }

      throw new Error('Ollama request timed out.', { cause: error })
    }

    throw error
  } finally {
    externalSignal?.removeEventListener('abort', handleExternalAbort)
    clearTimeout(timeoutId)
  }
}

export function extractOllamaErrorMessage(error) {
  const payloadMessage =
    safeTrim(error?.payload?.error) ||
    safeTrim(error?.payload?.message?.content) ||
    safeTrim(error?.payload?.response)

  if (payloadMessage) {
    return payloadMessage
  }

  return safeTrim(error?.message) || 'Ollama prompt improvement failed.'
}

export function normalizeImprovedPromptText(value) {
  let normalized = safeTrim(value)
  if (!normalized) {
    return ''
  }

  const fencedBlockMatch = normalized.match(/^```(?:[\w-]+)?\s*([\s\S]*?)\s*```$/)
  if (fencedBlockMatch) {
    normalized = fencedBlockMatch[1].trim()
  }

  normalized = normalized.replace(/^improved prompt\s*:\s*/i, '').trim()
  return normalized
}

export function extractOllamaModels(payload) {
  const rawModels = Array.isArray(payload?.models) ? payload.models : []
  const seenModels = new Set()

  return rawModels
    .map((model) => safeTrim(model?.name))
    .filter((modelName) => {
      if (!modelName || seenModels.has(modelName)) {
        return false
      }

      seenModels.add(modelName)
      return true
    })
}

export function getPreferredOllamaModel(modelNames) {
  if (modelNames.includes(defaultOllamaModel)) {
    return defaultOllamaModel
  }

  return modelNames[0] ?? defaultOllamaModel
}

export function buildRequestedPromptVariants(promptText, improvedPromptText) {
  const variants = []
  const trimmedPrompt = safeTrim(promptText)
  const trimmedImprovedPrompt = normalizeImprovedPromptText(improvedPromptText)

  if (trimmedPrompt) {
    variants.push({
      id: 'original',
      label: 'Original prompt',
      promptText: trimmedPrompt,
      isImproved: false,
    })
  }

  if (trimmedImprovedPrompt) {
    variants.push({
      id: 'improved',
      label: 'Improved prompt',
      promptText: trimmedImprovedPrompt,
      isImproved: true,
    })
  }

  return variants
}

export async function improvePromptWithOllama({
  promptText,
  instruction,
  checkpoint,
  family,
  negativePrompt,
  usingImageInput,
  modelName,
  signal,
}) {
  const effectiveInstruction =
    instruction ||
    'Improve the image-generation prompt while preserving the original intent. Strengthen clarity, composition, subject detail, and model-relevant style cues without adding commentary.'
  const selectedModel = safeModelName(modelName) ?? defaultOllamaModel

  const payload = await ollamaFetchJson('/api/chat', {
    signal,
    payload: {
      model: selectedModel,
      stream: false,
      options: {
        temperature: 0.2,
      },
      messages: [
        {
          role: 'system',
          content:
            'You improve positive prompts for local image generation workflows. Return only the improved prompt as plain text. Do not add explanations, markdown, code fences, labels, or quotes.',
        },
        {
          role: 'user',
          content: [
            `Checkpoint family: ${family}`,
            `Checkpoint: ${checkpoint}`,
            `Input image attached: ${usingImageInput ? 'yes' : 'no'}`,
            negativePrompt ? `Negative prompt: ${negativePrompt}` : '',
            '',
            'Improvement instruction:',
            effectiveInstruction,
            '',
            'Original prompt:',
            promptText,
            '',
            'Rewrite the original prompt and return only the improved prompt.',
          ]
            .filter(Boolean)
            .join('\n'),
        },
      ],
    },
  })

  const improvedPrompt = normalizeImprovedPromptText(
    payload?.message?.content ?? payload?.response ?? '',
  )

  if (!improvedPrompt) {
    throw new Error('Ollama returned an empty improved prompt.')
  }

  return improvedPrompt
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
