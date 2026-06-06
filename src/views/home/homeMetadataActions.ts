import { createEmptyPromptSections, createEmptyPromptSectionsDrafts } from './homeConstants'
import type { HomeState } from './homeState'
import type { GenerationMetadataFields, GenerationMetadataOptions } from '../../lib/generationMetadata'
import {
  extractGenerationMetadataFields,
  parseGenerationMetadataClipboard,
} from '../../lib/generationMetadata'
import { splitPromptDraft } from './homeValueHelpers'

function hasMetadataFields(fields: GenerationMetadataFields) {
  return Object.values(fields).some((value) => typeof value === 'string' && value.trim())
}

export function createHomeMetadataActions(state: HomeState) {
const {
  cfg,
  height,
  imageDenoise,
  isPastingMetadata,
  metadataPasteError,
  metadataPasteNotice,
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
  seed,
  steps,
  width,
} = state

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
}

function applyGenerationMetadataFromSource(meta: Record<string, unknown> | null | undefined) {
  metadataPasteNotice.value = ''
  metadataPasteError.value = ''

  const options: GenerationMetadataOptions = {
    samplerOptions: samplerOptions.value,
    schedulerOptions: schedulerOptions.value,
  }
  const fields = extractGenerationMetadataFields(meta, options)
  if (!hasMetadataFields(fields)) {
    const message = 'Image metadata did not contain recognized generation fields.'
    metadataPasteError.value = message
    throw new Error(message)
  }

  applyGenerationMetadata(fields)
  metadataPasteNotice.value = 'Metadata applied.'
}

async function pasteGenerationMetadataFromClipboard() {
  metadataPasteNotice.value = ''
  metadataPasteError.value = ''
  isPastingMetadata.value = true

  try {
    const readText = navigator.clipboard?.readText
    if (!readText) {
      throw new Error('Clipboard text is not available in this browser.')
    }

    const options: GenerationMetadataOptions = {
      samplerOptions: samplerOptions.value,
      schedulerOptions: schedulerOptions.value,
    }
    const fields = parseGenerationMetadataClipboard(await readText.call(navigator.clipboard), options)
    if (!hasMetadataFields(fields)) {
      throw new Error('Clipboard did not contain recognized generation metadata.')
    }

    applyGenerationMetadata(fields)
    metadataPasteNotice.value = 'Metadata applied.'
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
