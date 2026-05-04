import { randomUUID } from 'node:crypto'
import { defaultOllamaModel } from '../config.mjs'
import { safeTrim } from '../shared.mjs'
import { readFormDataBody, readJsonBody, sendError, sendJson, streamFile } from '../http.mjs'
import { submitComfyPrompt } from '../comfy-client.mjs'
import { enrichCheckpointOptions, enrichControlNetOptions, findModelPreviewPath } from '../model-options.mjs'
import { appendTriggerWordsToPrompt, extractRequestedCheckpointJobs, getComfyCheckpointDir, getComfyLoraDir, isFileLike, resolveStoredInputImageName, safeModelName, storeInputImageFile } from '../model-paths.mjs'
import { classifyControlNetCompatibility } from '../model-metadata.mjs'
import { extractControlNetEntries } from '../controlnet-options.mjs'
import { generateControlNetPreview } from '../controlnet-preview.mjs'
import { buildWorkflow, detectCheckpointFamily } from '../workflow.mjs'
import { ensureJob } from '../job-state.mjs'
import { buildRequestedPromptVariants, extractOllamaErrorMessage, extractPromptRejectionMessage, improvePromptWithOllama, normalizeImprovedPromptText } from '../ollama.mjs'

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

export async function handleGenerate(request, response) {
  const contentType = request.headers['content-type'] ?? ''
  let body
  try {
    body = contentType.includes('multipart/form-data')
      ? await readFormDataBody(request)
      : await readJsonBody(request)
  } catch {
    return sendError(
      response,
      400,
      'invalid-request',
      'Request body must be valid JSON or multipart form data.',
    )
  }

  const promptText = safeTrim(body instanceof FormData ? body.get('prompt') : body.prompt)
  const improvedPromptText = normalizeImprovedPromptText(
    body instanceof FormData ? body.get('improvedPrompt') : body.improvedPrompt,
  )
  const negativePrompt = safeTrim(
    body instanceof FormData ? body.get('negativePrompt') : body.negativePrompt,
  )
  const checkpointJobs = extractRequestedCheckpointJobs(body)
  const width = body instanceof FormData ? body.get('width') : body.width
  const height = body instanceof FormData ? body.get('height') : body.height
  const steps = body instanceof FormData ? body.get('steps') : body.steps
  const seed = body instanceof FormData ? body.get('seed') : body.seed
  const cfg = body instanceof FormData ? body.get('cfg') : body.cfg
  const imageDenoise = body instanceof FormData ? body.get('imageDenoise') : body.imageDenoise
  const storedInputImageName = safeTrim(
    body instanceof FormData ? body.get('inputImageName') : body.inputImageName,
  )
  const inputImageDisplayName = safeTrim(
    body instanceof FormData ? body.get('inputImageDisplayName') : body.inputImageDisplayName,
  )
  const promptVariants = buildRequestedPromptVariants(promptText, improvedPromptText)

  if (!promptVariants.length) {
    return sendError(
      response,
      400,
      'missing-prompt',
      'Provide an original prompt, an improved prompt, or both.',
    )
  }

  if (!checkpointJobs.length) {
    return sendError(response, 400, 'missing-checkpoint', 'Checkpoint selection is required.')
  }

  let inputImageName = null
  if (body instanceof FormData) {
    const imageFile = body.get('image')
    if (isFileLike(imageFile) && imageFile.size > 0) {
      try {
        inputImageName = await storeInputImageFile(imageFile)
      } catch (error) {
        if (error.code === 'unsupported-image-type') {
          return sendError(response, 400, 'unsupported-image-type', error.message)
        }

        return sendError(
          response,
          500,
          'image-upload-failed',
          'Could not store the input image for ComfyUI.',
          error.message,
        )
      }
    }
  }

  if (!inputImageName && storedInputImageName) {
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

  async function resolveControlNetImages(controlNetEntries) {
    const resolvedControlNets = []
    for (const controlNet of controlNetEntries) {
      if (!controlNet.model || !controlNet.inputImageName) {
        return {
          ok: false,
          status: 400,
          error: 'invalid-controlnet',
          message: 'Each enabled ControlNet needs a model and uploaded control image.',
        }
      }

      let controlImageName
      try {
        controlImageName = await resolveStoredInputImageName(controlNet.inputImageName)
      } catch (error) {
        return {
          ok: false,
          status: 500,
          error: 'controlnet-image-lookup-failed',
          message: 'Could not verify a selected ControlNet image.',
          details: error.message,
        }
      }

      if (!controlImageName) {
        return {
          ok: false,
          status: 400,
          error: 'missing-controlnet-image',
          message: 'A selected ControlNet image is no longer available. Reattach it and try again.',
        }
      }

      resolvedControlNets.push({
        ...controlNet,
        inputImageName: controlImageName,
      })
    }

    return {
      ok: true,
      controlNets: resolvedControlNets,
    }
  }

  async function validateControlNetCompatibility(checkpointName, controlNetEntries) {
    if (!controlNetEntries.length) {
      return { ok: true }
    }

    const checkpointFamily = detectCheckpointFamily(checkpointName)
    let checkpoint
    let controlNetOptions
    try {
      ;[checkpoint] = await enrichCheckpointOptions([{ name: checkpointName, family: checkpointFamily }])
      controlNetOptions = await enrichControlNetOptions(
        [...new Set(controlNetEntries.map((controlNet) => controlNet.model))]
          .map((name) => ({ name, displayName: name })),
      )
    } catch {
      return { ok: true }
    }

    const controlNetMetadataByName = new Map(
      controlNetOptions.map((controlNet) => [controlNet.name, controlNet.compatibility ?? null]),
    )

    for (const controlNet of controlNetEntries) {
      const status = classifyControlNetCompatibility(
        checkpoint?.compatibility ?? null,
        controlNetMetadataByName.get(controlNet.model) ?? null,
        checkpointFamily,
      )
      if (status === 'incompatible') {
        return {
          ok: false,
          status: 400,
          error: 'invalid-controlnet',
          message: `${controlNet.model} is not compatible with ${checkpoint?.displayName ?? checkpointName}.`,
        }
      }
    }

    return { ok: true }
  }

  try {
    const submittedJobs = []
    const batchId = checkpointJobs.length > 1 ? randomUUID() : null

    for (const [checkpointIndex, checkpointJob] of checkpointJobs.entries()) {
      const loras = checkpointJob.loras.map((lora) => ({
        name: lora.name,
        strength: lora.strength,
      }))
      const loraTriggerWords = checkpointJob.loras.flatMap((lora) => lora.triggerWords ?? [])
      const checkpointPromptText = appendTriggerWordsToPrompt(promptText, loraTriggerWords)
      const checkpointImprovedPromptText = improvedPromptText
        ? appendTriggerWordsToPrompt(improvedPromptText, loraTriggerWords)
        : ''
      const checkpointPromptVariants = buildRequestedPromptVariants(
        checkpointPromptText,
        checkpointImprovedPromptText,
      )
      const nestedControlNets = extractControlNetEntries(checkpointJob.controlNets)
      const resolvedCheckpointControlNets = await resolveControlNetImages(nestedControlNets)
      if (!resolvedCheckpointControlNets.ok) {
        return sendError(
          response,
          resolvedCheckpointControlNets.status,
          resolvedCheckpointControlNets.error,
          resolvedCheckpointControlNets.message,
          resolvedCheckpointControlNets.details ?? null,
        )
      }
      const controlNets = resolvedCheckpointControlNets.controlNets ?? []
      const controlNetCompatibility = await validateControlNetCompatibility(checkpointJob.name, controlNets)
      if (!controlNetCompatibility.ok) {
        return sendError(
          response,
          controlNetCompatibility.status,
          controlNetCompatibility.error,
          controlNetCompatibility.message,
        )
      }
      const {
        prompt,
        nodeLabels,
        saveNodeMeta,
        outputNodeOrder,
        family,
        width: normalizedWidth,
        height: normalizedHeight,
        steps: normalizedSteps,
        cfg: normalizedCfg,
        denoise: normalizedDenoise,
        seed: normalizedSeed,
      } = buildWorkflow({
        promptVariants: checkpointPromptVariants,
        negativePrompt,
        checkpoint: checkpointJob.name,
        loras,
        width,
        height,
        steps,
        cfg,
        denoise: imageDenoise,
        seed,
        inputImageName,
        controlNets,
      })

      const submission = await submitComfyPrompt(prompt)

      if (!submission.ok) {
        if (submittedJobs.length) {
          return sendJson(response, 200, {
            ok: true,
            promptId: submittedJobs[0].promptId,
            promptIds: submittedJobs.map((job) => job.promptId),
            batchId,
            state: 'queued',
            seed: submittedJobs[0].seed,
            promptVariants: submittedJobs[0].promptVariants,
            improvedPrompt:
              submittedJobs[0].promptVariants.find((variant) => variant.isImproved)?.promptText ?? null,
            promptImprovementError: null,
            inputImageName,
            inputImageDisplayName,
            partialFailure: true,
            message: `Queued ${submittedJobs.length} workflow(s), but ${checkpointJob.name} failed to submit.`,
          })
        }

        return sendError(
          response,
          submission.statusCode >= 500 ? 502 : 400,
          'comfyui-rejected',
          extractPromptRejectionMessage(submission.payload),
          submission.payload,
        )
      }

      const promptId = submission.payload.prompt_id
      ensureJob(promptId, {
        batchId,
        batchIndex: batchId ? checkpointIndex : null,
        promptText,
        negativePrompt,
        promptVariants: checkpointPromptVariants,
        promptImprovementError: null,
        checkpoint: checkpointJob.name,
        loras,
        family,
        width: normalizedWidth,
        height: normalizedHeight,
        steps: normalizedSteps,
        cfg: normalizedCfg,
        denoise: normalizedDenoise,
        seed: normalizedSeed,
        inputImageName,
        inputImageDisplayName,
        controlNets,
        state: 'queued',
        currentNodeLabel: 'Queued in ComfyUI',
        nodeLabels,
        saveNodeMeta,
        outputNodeOrder,
      })

      submittedJobs.push({
        promptId,
        checkpoint: checkpointJob.name,
        promptVariants: checkpointPromptVariants,
        seed: normalizedSeed,
        inputImageName,
        inputImageDisplayName,
      })
    }

    return sendJson(response, 200, {
      ok: true,
      promptId: submittedJobs[0]?.promptId ?? '',
      promptIds: submittedJobs.map((job) => job.promptId),
      batchId,
      state: 'queued',
      seed: submittedJobs[0]?.seed ?? null,
      promptVariants: submittedJobs[0]?.promptVariants ?? promptVariants,
      improvedPrompt:
        submittedJobs[0]?.promptVariants?.find((variant) => variant.isImproved)?.promptText ?? null,
      promptImprovementError: null,
      inputImageName,
      inputImageDisplayName,
    })
  } catch (error) {
    return sendError(
      response,
      502,
      'comfyui-submit-failed',
      'Could not submit the workflow to ComfyUI.',
      error.payload ?? error.message,
    )
  }
}
