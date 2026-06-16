import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export { buildCivitaiImagesQueryParams, buildCivitaiModelsQueryParams } from './civitai-query.mjs'
export { buildCivitaiKeyPreview, serializeCivitaiSettings } from './settings.mjs'
export { createCompanionServer, configureCompanionServerForTests, startCompanionServer } from './app.mjs'
export { createDownloadsResponse, serializeDownload } from './downloads/state.mjs'
export { buildQueueSummaryForPromptIds, extractInputImageNameFromHistory, getQueueSnapshot, normalizeQueueEntries } from './queue-state.mjs'
export { buildRequestedPromptVariants } from './prompt-variants.mjs'
export { buildWorkflow } from './workflow.mjs'
export { buildControlNetPreviewWorkflow } from './controlnet-preview.mjs'
export { extractControlNetEntries, extractRequestedControlNets } from './controlnet-options.mjs'
export {
  classifyControlNetCompatibility,
  classifyLoraCompatibility,
  fetchCivitaiVersionMetadata,
  normalizeBaseModelKey,
  normalizeModelCompatibilityMetadata,
  writeManualModelCompatibilityMetadata,
} from './model-metadata.mjs'
export {
  extractRequestedCheckpoints,
  extractRequestedCheckpointJobs,
  extractRequestedLoras,
  normalizeCfg,
  normalizeDenoise,
  normalizeDimension,
  normalizeSeed,
  normalizeSteps,
  sanitizeFilename,
  sanitizeSubfolder,
} from './model-paths.mjs'
export {
  dedupeTriggerWords,
  extractTriggerWordsFromPayload,
  normalizeTriggerWords,
  readJsonFileIfExists,
  readLoraTriggerWords,
  readSafetensorsMetadata,
} from './model-trigger-words.mjs'
export { mergeJobOutputs } from './job-state.mjs'
export { ensureJobsLoaded, resetJobStoreRuntimeState } from './job-store.mjs'
export {
  installServerConsoleLogger,
  logApiError,
  serverLogPath,
  uninstallServerConsoleLoggerForTests,
  writeServerLog,
} from './server-log.mjs'

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const { startCompanionServer } = await import('./app.mjs')
  startCompanionServer()
}
