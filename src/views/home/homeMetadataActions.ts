import { toast } from 'vue-sonner'

import { createEmptyPromptSections, createEmptyPromptSectionsDrafts } from './homeConstants'
import type { HomeState } from './homeState'
import type { GenerationMetadataFields, GenerationMetadataOptions } from '../../lib/generationMetadata'
import {
  extractGenerationMetadataFields,
  findUnsupportedGenerationMetadataFields,
  parseGenerationMetadataClipboard,
} from '../../lib/generationMetadata'
import { splitPromptDraft } from './homeValueHelpers'

function hasMetadataFields(fields: GenerationMetadataFields) {
  return Object.values(fields).some((value) =>
    typeof value === 'string' ? value.trim() : value === true,
  )
}

function normalizeHash(value: string | undefined) {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

function hashMatches(candidate: string | undefined, expected: string | undefined) {
  const candidateHash = normalizeHash(candidate)
  const expectedHash = normalizeHash(expected)
  return Boolean(
    candidateHash &&
      expectedHash &&
      (candidateHash === expectedHash ||
        candidateHash.startsWith(expectedHash) ||
        expectedHash.startsWith(candidateHash)),
  )
}

function normalizeModelName(value: string | undefined) {
  return typeof value === 'string'
    ? value
        .trim()
        .toLowerCase()
        .replace(/\.(safetensors|ckpt|pt|pth|bin)$/i, '')
        .replace(/[^a-z0-9]+/g, '')
    : ''
}

function parseClipboardMetadataSource(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null
  } catch {
    return null
  }
}

function notifyReplayWarnings(warnings: string[]) {
  if (!warnings.length) {
    return
  }

  toast.warning('Metadata applied with replay warnings.', {
    description: warnings.length === 1
      ? warnings[0]
      : `${warnings.length} replay warnings need review.`,
  })
}

export function createHomeMetadataActions(state: HomeState) {
const {
  cfg,
  checkpoints,
  height,
  hiresCfg,
  hiresDenoise,
  hiresEnabled,
  hiresHeight,
  hiresSamplerName,
  hiresScheduler,
  hiresSteps,
  hiresUpscale,
  hiresUpscaler,
  hiresWidth,
  imageDenoise,
  isPastingMetadata,
  metadataPasteError,
  metadataPasteNotice,
  metadataReplayWarnings,
  negativePrompt,
  negativePromptDraft,
  negativePromptTags,
  prompt,
  promptSectionDrafts,
  promptSections,
  samplerName,
  samplerOptions,
  scheduler,
  schedulerOptions,
  selectedCheckpoints,
  seed,
  steps,
  clipSkip,
  upscaleModelOptions,
  vaeName,
  vaeNameOptions,
  width,
} = state

function clearMetadataReplayFields() {
  clipSkip.value = ''
  vaeName.value = ''
  hiresEnabled.value = false
  hiresUpscale.value = ''
  hiresWidth.value = ''
  hiresHeight.value = ''
  hiresSteps.value = ''
  hiresCfg.value = ''
  hiresDenoise.value = ''
  hiresUpscaler.value = ''
  hiresSamplerName.value = ''
  hiresScheduler.value = ''
}

function checkpointHashValues(checkpoint: HomeState['checkpoints']['value'][number]) {
  return Object.values(checkpoint.compatibility?.hashes ?? {})
}

function findCheckpointForMetadata(fields: GenerationMetadataFields) {
  if (fields.modelHash) {
    const matchedByHash = checkpoints.value.find((checkpoint) =>
      checkpointHashValues(checkpoint).some((hash) => hashMatches(hash, fields.modelHash)),
    )
    if (matchedByHash) {
      return matchedByHash
    }
  }

  const modelName = normalizeModelName(fields.modelName)
  if (!modelName) {
    return null
  }

  return checkpoints.value.find((checkpoint) => {
    return [
      checkpoint.name,
      checkpoint.displayName,
      checkpoint.compatibility?.modelName,
      checkpoint.compatibility?.versionName,
    ].some((value) => {
      const candidateName = normalizeModelName(value)
      return Boolean(candidateName && (candidateName.includes(modelName) || modelName.includes(candidateName)))
    })
  }) ?? null
}

function applyCheckpointVerification(fields: GenerationMetadataFields, warnings: string[]) {
  if (!fields.modelHash && !fields.modelName) {
    return
  }

  const matchedCheckpoint = findCheckpointForMetadata(fields)
  if (matchedCheckpoint) {
    const existingSelection = selectedCheckpoints.value.find((selection) => selection.name === matchedCheckpoint.name)
    selectedCheckpoints.value = [
      existingSelection
        ? { ...existingSelection, enabled: true }
        : {
            name: matchedCheckpoint.name,
            enabled: true,
            loras: [],
            loraPicker: '',
            controlNets: [],
          },
    ]
    return
  }

  if (fields.modelHash) {
    warnings.push(`Model hash ${fields.modelHash} was not found in local checkpoint metadata.`)
    return
  }

  warnings.push(`Model ${fields.modelName} was not found in the local checkpoint list.`)
}

function buildReplayWarnings(fields: GenerationMetadataFields) {
  const warnings: string[] = []
  applyCheckpointVerification(fields, warnings)

  if (fields.sourceVaeName && !fields.vaeName) {
    warnings.push(`VAE ${fields.sourceVaeName} is not available in local VAE options.`)
  }

  if (fields.vaeHash) {
    warnings.push(`VAE hash ${fields.vaeHash} could not be verified from ComfyUI option data.`)
  }

  if (fields.sourceHiresUpscaler && !fields.hiresUpscaler) {
    warnings.push(`Hires upscaler ${fields.sourceHiresUpscaler} is not available locally.`)
  }

  return warnings
}

function buildUnsupportedMetadataWarnings(meta: Record<string, unknown> | null | undefined) {
  return findUnsupportedGenerationMetadataFields(meta).map((field) =>
    `${field.label} ${field.value} was not applied. ${field.reason}`,
  )
}

function buildAllReplayWarnings(
  fields: GenerationMetadataFields,
  meta: Record<string, unknown> | null | undefined,
) {
  return [
    ...buildReplayWarnings(fields),
    ...buildUnsupportedMetadataWarnings(meta),
  ]
}

function applyGenerationMetadata(fields: GenerationMetadataFields) {
  if (fields.prompt) {
    prompt.value = fields.prompt
    promptSections.value = createEmptyPromptSections()
    promptSections.value.others = splitPromptDraft(fields.prompt)
    promptSectionDrafts.value = createEmptyPromptSectionsDrafts()
  }

  if (fields.negativePrompt) {
    negativePrompt.value = fields.negativePrompt
    negativePromptTags.value = splitPromptDraft(fields.negativePrompt)
    negativePromptDraft.value = ''
  }

  if (fields.width) width.value = fields.width
  if (fields.height) height.value = fields.height
  if (fields.seed) seed.value = fields.seed
  if (fields.steps) steps.value = fields.steps
  if (fields.cfg) cfg.value = fields.cfg
  if (fields.samplerName) samplerName.value = fields.samplerName
  if (fields.scheduler) scheduler.value = fields.scheduler
  if (fields.imageDenoise) imageDenoise.value = fields.imageDenoise
  if (fields.clipSkip) clipSkip.value = fields.clipSkip
  if (fields.vaeName) vaeName.value = fields.vaeName
  if (fields.hiresEnabled) hiresEnabled.value = true
  if (fields.hiresUpscale) hiresUpscale.value = fields.hiresUpscale
  if (fields.hiresWidth) hiresWidth.value = fields.hiresWidth
  if (fields.hiresHeight) hiresHeight.value = fields.hiresHeight
  if (fields.hiresSteps) hiresSteps.value = fields.hiresSteps
  if (fields.hiresCfg) hiresCfg.value = fields.hiresCfg
  if (fields.hiresDenoise) hiresDenoise.value = fields.hiresDenoise
  if (fields.hiresUpscaler) hiresUpscaler.value = fields.hiresUpscaler
  if (fields.hiresSamplerName) hiresSamplerName.value = fields.hiresSamplerName
  if (fields.hiresScheduler) hiresScheduler.value = fields.hiresScheduler
}

function applyGenerationMetadataFromSource(meta: Record<string, unknown> | null | undefined) {
  metadataPasteNotice.value = ''
  metadataPasteError.value = ''
  metadataReplayWarnings.value = []

  const options: GenerationMetadataOptions = {
    samplerOptions: samplerOptions.value,
    schedulerOptions: schedulerOptions.value,
    vaeOptions: vaeNameOptions.value,
    upscaleModelOptions: upscaleModelOptions.value,
  }
  const fields = extractGenerationMetadataFields(meta, options)
  if (!hasMetadataFields(fields)) {
    const message = 'Image metadata did not contain recognized generation fields.'
    metadataPasteError.value = message
    throw new Error(message)
  }

  clearMetadataReplayFields()
  applyGenerationMetadata(fields)
  metadataReplayWarnings.value = buildAllReplayWarnings(fields, meta)
  metadataPasteNotice.value = metadataReplayWarnings.value.length
    ? 'Metadata applied with replay warnings.'
    : 'Metadata applied.'
  notifyReplayWarnings(metadataReplayWarnings.value)
}

async function pasteGenerationMetadataFromClipboard() {
  metadataPasteNotice.value = ''
  metadataPasteError.value = ''
  metadataReplayWarnings.value = []
  isPastingMetadata.value = true

  try {
    const readText = navigator.clipboard?.readText
    if (!readText) {
      throw new Error('Clipboard text is not available in this browser.')
    }

    const options: GenerationMetadataOptions = {
      samplerOptions: samplerOptions.value,
      schedulerOptions: schedulerOptions.value,
      vaeOptions: vaeNameOptions.value,
      upscaleModelOptions: upscaleModelOptions.value,
    }
    const clipboardText = await readText.call(navigator.clipboard)
    const fields = parseGenerationMetadataClipboard(clipboardText, options)
    if (!hasMetadataFields(fields)) {
      throw new Error('Clipboard did not contain recognized generation metadata.')
    }

    clearMetadataReplayFields()
    applyGenerationMetadata(fields)
    metadataReplayWarnings.value = buildAllReplayWarnings(fields, parseClipboardMetadataSource(clipboardText))
    metadataPasteNotice.value = metadataReplayWarnings.value.length
      ? 'Metadata applied with replay warnings.'
      : 'Metadata applied.'
    notifyReplayWarnings(metadataReplayWarnings.value)
  } catch (error) {
    metadataPasteError.value =
      error instanceof Error ? error.message : 'Could not paste generation metadata.'
  } finally {
    isPastingMetadata.value = false
  }
}

return {
  applyGenerationMetadata,
  applyGenerationMetadataFromSource,
  pasteGenerationMetadataFromClipboard,
}
}

export type HomeMetadataActions = ReturnType<typeof createHomeMetadataActions>
