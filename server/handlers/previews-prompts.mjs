import { safeTrim } from '../shared.mjs'
import { readJsonBody, sendError, sendJson, streamFile } from '../http.mjs'
import { findModelPreviewPath } from '../model-options.mjs'
import {
  getComfyCheckpointDir,
  getComfyControlNetDir,
  getComfyLoraDir,
  resolveStoredInputImageName,
} from '../model-paths.mjs'
import { generateControlNetPreview } from '../controlnet-preview.mjs'

export async function handleModelPreview(url, response) {
  const modelType = safeTrim(url.searchParams.get('type')).toLowerCase()
  const modelName = safeTrim(url.searchParams.get('name'))
  let rootPath = null

  try {
    if (modelType === 'checkpoint') {
      rootPath = await getComfyCheckpointDir()
    } else if (modelType === 'lora') {
      rootPath = await getComfyLoraDir()
    } else if (modelType === 'controlnet') {
      rootPath = await getComfyControlNetDir()
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
