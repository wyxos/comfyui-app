import type { FormTab, PromptSectionDefinition, PromptSectionId, PromptSectionsState, QueueSummary } from './homeTypes'

export const FORM_STATE_STORAGE_KEY = 'comfyui-companion:home-form:v2'
export const IMPROVE_PROMPT_TIMEOUT_MS = 600000
export const PROMPT_IMPROVEMENT_TIMER_INTERVAL_MS = 1000
export const FORM_TAB_QUERY_KEY = 'tab'
export const FORM_TAB_IDS: FormTab[] = ['assets', 'prompt', 'config', 'image']
export const FORM_TABS: Array<{ id: FormTab; label: string; hint: string }> = [
  { id: 'assets', label: 'Assets', hint: 'Checkpoints and LoRAs' },
  { id: 'prompt', label: 'Prompt', hint: 'Prompt text and improver' },
  { id: 'config', label: 'Config', hint: 'Size, steps, seed, and CFG' },
  { id: 'image', label: 'Image', hint: 'Input image and denoise' },
]
export const JOB_ENTRY_PREVIEW_OUTPUT_LIMIT = 3
export const MIN_ASPECT_RATIO_SCALE = -10
export const MAX_ASPECT_RATIO_SCALE = 10
export const ASPECT_RATIO_SCALE_STEP = 0.25
export const MAX_ASPECT_RATIO_MULTIPLIER = 3
export const PROMPT_SECTION_DEFINITIONS: PromptSectionDefinition[] = [
  {
    id: 'subject',
    label: 'Subject',
    hint: 'Who or what the image is about.',
    placeholder: 'portrait of an android botanist',
  },
  {
    id: 'details',
    label: 'Details',
    hint: 'Pose, expression, clothing, props, key traits.',
    placeholder: 'looking over shoulder',
  },
  {
    id: 'environment',
    label: 'Environment',
    hint: 'Place, background, era, weather, atmosphere.',
    placeholder: 'rainy neon greenhouse',
  },
  {
    id: 'style',
    label: 'Style',
    hint: 'Medium, genre, lens, artist-safe art direction.',
    placeholder: 'cinematic concept art',
  },
  {
    id: 'lighting',
    label: 'Lighting',
    hint: 'Light quality, color, contrast, time of day.',
    placeholder: 'soft rim light',
  },
  {
    id: 'quality',
    label: 'Quality',
    hint: 'Positive constraints and finishing details.',
    placeholder: 'sharp focus',
  },
  {
    id: 'others',
    label: 'Others',
    hint: 'Additional tags that do not fit another section.',
    placeholder: 'subtle details',
  },
]

export function createEmptyQueueSummary(): QueueSummary {
  return {
    running: 0,
    pending: 0,
    appRunning: 0,
    appPending: 0,
    externalRunning: 0,
    externalPending: 0,
    unavailable: false,
    error: null,
  }
}

export function createEmptyPromptSections(): PromptSectionsState {
  return PROMPT_SECTION_DEFINITIONS.reduce((sections, section) => {
    sections[section.id] = []
    return sections
  }, {} as PromptSectionsState)
}

export function createEmptyPromptSectionsDrafts(): Record<PromptSectionId, string> {
  return PROMPT_SECTION_DEFINITIONS.reduce((drafts, section) => {
    drafts[section.id] = ''
    return drafts
  }, {} as Record<PromptSectionId, string>)
}
