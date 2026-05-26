import { defaultOllamaModel } from '../config.mjs'
import { safeTrim } from '../shared.mjs'
import { readJsonBody, sendError, sendJson, streamFile } from '../http.mjs'
import { findModelPreviewPath } from '../model-options.mjs'
import {
  getComfyCheckpointDir,
  getComfyLoraDir,
  resolveStoredInputImageName,
  safeModelName,
} from '../model-paths.mjs'
import { generateControlNetPreview } from '../controlnet-preview.mjs'
import { detectCheckpointFamily } from '../workflow.mjs'
import { extractOllamaErrorMessage, improvePromptWithOllama } from '../ollama.mjs'

export async function handleModelPreview(url, response) {
  const modelType = safeTrim(url.searchParams.get('type')).toLowerCase()
  const modelName = safeTrim(url.searchParams.get('name'))
  let rootPath = null

  try {
    if (modelType === 'checkpoint') {
      rootPath = await getComfyCheckpointDir()
    } else if (modelType === 'lora') {
      rootPath = await getComfyLoraDir()
    }
  } catch {}

  if (!rootPath || !modelName) {
    return sendError(response, 404, 'preview-not-found', 'Model preview was not found.')
  }

  const previewPath = await findModelPreviewPath(rootPath, modelName)
  if (!previewPath) {
    return sendError(response, 404, 'preview-not-found', 'Model preview was not found.')
  }

  return streamFile(response, previewPath)
}

export async function handleImprovePrompt(request, response) {
  let body
  try {
    body = await readJsonBody(request)
  } catch {
    return sendError(response, 400, 'invalid-json', 'Request body must be valid JSON.')
  }

  const promptText = safeTrim(body.prompt)
  const negativePrompt = safeTrim(body.negativePrompt)
  const checkpoint = safeTrim(body.checkpoint)
  const instruction = safeTrim(body.llmInstruction)
  const modelName = safeModelName(body.ollamaModel)
  const storedInputImageName = safeTrim(body.inputImageName)

  if (!promptText) {
    return sendError(response, 400, 'missing-prompt', 'Prompt is required to improve it.')
  }

  if (!checkpoint) {
    return sendError(response, 400, 'missing-checkpoint', 'Checkpoint selection is required.')
  }

  let inputImageName
  if (storedInputImageName) {
    try {
      inputImageName = await resolveStoredInputImageName(storedInputImageName)
    } catch (error) {
      return sendError(
        response,
        500,
        'image-lookup-failed',
        'Could not verify the selected input image.',
        error.message,
      )
    }

    if (!inputImageName) {
      return sendError(
        response,
        400,
        'missing-input-image',
        'The selected input image is no longer available. Reattach it and try again.',
      )
    }
  }

  const abortController = new AbortController()
  const abortPendingImprove = () => {
    if (!abortController.signal.aborted && !response.writableEnded) {
      abortController.abort()
    }
  }

  request.once('aborted', abortPendingImprove)
  response.once('close', abortPendingImprove)

  try {
    const improvedPrompt = await improvePromptWithOllama({
      promptText,
      instruction,
      checkpoint,
      family: detectCheckpointFamily(checkpoint),
      negativePrompt,
      usingImageInput: Boolean(inputImageName),
      modelName,
      signal: abortController.signal,
    })

    return sendJson(response, 200, {
      ok: true,
      improvedPrompt,
      model: safeModelName(modelName) ?? defaultOllamaModel,
    })
  } catch (error) {
    if (abortController.signal.aborted) {
      if (!response.destroyed && !response.writableEnded) {
        return sendError(response, 499, 'ollama-improve-cancelled', 'Prompt improvement stopped.')
      }

      return
    }

    return sendError(
      response,
      502,
      'ollama-improve-failed',
      extractOllamaErrorMessage(error),
      error.payload ?? error.message,
    )
  } finally {
    request.off('aborted', abortPendingImprove)
    response.off('close', abortPendingImprove)
  }
}

export async function handleControlNetPreview(request, response) {
  let body
  try {
    body = await readJsonBody(request)
  } catch {
    return sendError(response, 400, 'invalid-json', 'Request body must be valid JSON.')
  }

  const storedInputImageName = safeTrim(body.inputImageName)
  if (!storedInputImageName) {
    return sendError(response, 400, 'missing-controlnet-image', 'ControlNet image is required.')
  }

  let inputImageName
  try {
    inputImageName = await resolveStoredInputImageName(storedInputImageName)
  } catch (error) {
    return sendError(
      response,
      500,
      'controlnet-image-lookup-failed',
      'Could not verify the selected ControlNet image.',
      error.message,
    )
  }

  if (!inputImageName) {
    return sendError(
      response,
      400,
      'missing-controlnet-image',
      'The selected ControlNet image is no longer available. Reattach it and try again.',
    )
  }

  try {
    return sendJson(response, 200, await generateControlNetPreview({
      inputImageName,
      preprocessor: body.preprocessor,
      lineartPolarity: body.lineartPolarity,
      resolution: body.resolution,
    }))
  } catch (error) {
    return sendError(
      response,
      error?.statusCode >= 500 ? 502 : 400,
      'controlnet-preview-failed',
      error instanceof Error ? error.message : 'Could not generate ControlNet preview.',
      error.payload ?? null,
    )
  }
}
