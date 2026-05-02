import { buildImageUrl, normalizeImage } from './job-state.mjs'
import { comfyFetchJson, submitComfyPrompt } from './comfy-client.mjs'
import { extractErrorFromHistory, extractImagesFromHistory } from './queue-state.mjs'
import {
  getControlNetPreprocessorProfile,
  normalizeControlNetLineartPolarity,
  normalizeControlNetPreviewResolution,
  shouldInvertControlNetLineart,
} from './controlnet-options.mjs'

function createPreviewNodeIdGenerator() {
  let nextId = 3
  return () => String(nextId++)
}

function buildFilenamePrefix(profile) {
  return `controlnet-preview-${profile.id}-${Date.now()}`
}

export function buildControlNetPreviewWorkflow({
  inputImageName,
  preprocessor,
  lineartPolarity,
  resolution,
}) {
  const profile = getControlNetPreprocessorProfile(preprocessor)
  const normalizedLineartPolarity = normalizeControlNetLineartPolarity(lineartPolarity)
  const prompt = {}
  const nextNodeId = createPreviewNodeIdGenerator()
  const loadImageNodeId = nextNodeId()
  let imageRef = [loadImageNodeId, 0]

  prompt[loadImageNodeId] = {
    class_type: 'LoadImage',
    inputs: {
      image: inputImageName,
    },
  }

  if (profile?.nodeType) {
    const preprocessorNodeId = nextNodeId()
    prompt[preprocessorNodeId] = {
      class_type: profile.nodeType,
      inputs: {
        image: imageRef,
        ...profile.inputs,
        resolution: normalizeControlNetPreviewResolution(resolution, profile.defaultResolution),
      },
    }
    imageRef = [preprocessorNodeId, 0]
  }

  if (shouldInvertControlNetLineart({
    preprocessor: profile?.id,
    lineartPolarity: normalizedLineartPolarity,
  })) {
    const invertNodeId = nextNodeId()
    prompt[invertNodeId] = {
      class_type: 'ImageInvert',
      inputs: {
        image: imageRef,
      },
    }
    imageRef = [invertNodeId, 0]
  }

  const saveImageNodeId = nextNodeId()
  prompt[saveImageNodeId] = {
    class_type: 'SaveImage',
    inputs: {
      filename_prefix: buildFilenamePrefix(profile),
      images: imageRef,
    },
  }

  return {
    prompt,
    outputNodeId: saveImageNodeId,
    preprocessor: profile?.id ?? 'none',
    lineartPolarity: normalizedLineartPolarity,
    resolution: normalizeControlNetPreviewResolution(resolution, profile?.defaultResolution ?? 512),
  }
}

async function waitForControlNetPreview(promptId, outputNodeId) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const historyPayload = await comfyFetchJson(`/history/${encodeURIComponent(promptId)}`)
    const historyEntry = historyPayload?.[promptId] ?? null
    const images = extractImagesFromHistory(historyEntry, {}, [outputNodeId])
    if (images[0]) {
      return normalizeImage(images[0])
    }

    const error = extractErrorFromHistory(historyEntry)
    if (error || historyEntry?.status?.status_str === 'error') {
      throw new Error(error ?? 'ControlNet preview failed in ComfyUI.')
    }

    await new Promise((resolveDelay) => {
      setTimeout(resolveDelay, 500)
    })
  }

  throw new Error('ControlNet preview timed out.')
}

export async function generateControlNetPreview({
  inputImageName,
  preprocessor,
  lineartPolarity,
  resolution,
}) {
  const workflow = buildControlNetPreviewWorkflow({
    inputImageName,
    preprocessor,
    lineartPolarity,
    resolution,
  })
  const submission = await submitComfyPrompt(workflow.prompt)
  if (!submission.ok) {
    const error = new Error('ComfyUI rejected the ControlNet preview workflow.')
    error.statusCode = submission.statusCode
    error.payload = submission.payload
    throw error
  }

  const image = await waitForControlNetPreview(submission.payload.prompt_id, workflow.outputNodeId)

  return {
    ok: true,
    promptId: submission.payload.prompt_id,
    preprocessor: workflow.preprocessor,
    lineartPolarity: workflow.lineartPolarity,
    resolution: workflow.resolution,
    preview: {
      ...image,
      url: buildImageUrl(image),
    },
  }
}
