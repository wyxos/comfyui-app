import { randomUUID } from 'node:crypto'
import { safeTrim } from '../shared.mjs'
import { readFormDataBody, readJsonBody, sendError, sendJson } from '../http.mjs'
import { submitComfyPrompt } from '../comfy-client.mjs'
import { enrichCheckpointOptions, enrichControlNetOptions } from '../model-options.mjs'
import { appendTriggerWordsToPrompt, extractRequestedCheckpointJobs, isFileLike, resolveStoredInputImageName, storeInputImageFile } from '../model-paths.mjs'
import { classifyControlNetCompatibility } from '../model-metadata.mjs'
import { extractControlNetEntries } from '../controlnet-options.mjs'
import { detectCheckpointFamily } from '../checkpoint-family.mjs'
import { buildWorkflow } from '../workflow.mjs'
import { ensureJob } from '../job-state.mjs'
import { buildRequestedPromptVariants, extractPromptRejectionMessage } from '../prompt-variants.mjs'

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
  const promptVariants = buildRequestedPromptVariants(promptText)

  if (!promptVariants.length) {
    return sendError(
      response,
      400,
      'missing-prompt',
      'Prompt text is required.',
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

  async function resolveCheckpointContext(checkpointName) {
    const fallbackFamily = detectCheckpointFamily(checkpointName)
    try {
      const [checkpoint] = await enrichCheckpointOptions([{ name: checkpointName, family: fallbackFamily }])
      return {
        checkpoint: checkpoint ?? null,
        family: checkpoint?.family ?? fallbackFamily,
      }
    } catch {
      return {
        checkpoint: null,
        family: fallbackFamily,
      }
    }
  }

  async function validateControlNetCompatibility(checkpointContext, controlNetEntries) {
    if (!controlNetEntries.length) {
      return { ok: true }
    }

    const checkpoint = checkpointContext.checkpoint
    const checkpointFamily = checkpointContext.family
    let controlNetOptions
    try {
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
          message: `${controlNet.model} is not compatible with ${checkpoint?.displayName ?? checkpoint?.name ?? 'the selected checkpoint'}.`,
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
      const checkpointContext = await resolveCheckpointContext(checkpointJob.name)
      const checkpointPromptVariants = buildRequestedPromptVariants(checkpointPromptText)
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
      const controlNetCompatibility = await validateControlNetCompatibility(checkpointContext, controlNets)
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
        checkpointFamily: checkpointContext.family,
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
