import { readFile, stat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { civitaiDownloads, refreshConfigFromEnv } from '../server/config.mjs'
import {
  getArchiveSidecarPath,
  inspectCivitaiArchiveForDownload,
  refreshCivitaiArchiveForDownload,
} from '../server/civitai-archive.mjs'
import { ensureDownloadsLoaded, resetDownloadsRuntimeState, writeDownloadsStateNow } from '../server/downloads/state.mjs'

export function parseCivitaiArchiveBackfillArgs(argv = []) {
  const options = {
    dryRun: false,
    missingMediaOnly: false,
  }

  for (const arg of argv) {
    if (arg === '--dry-run' || arg === '-n') {
      options.dryRun = true
      continue
    }
    if (arg === '--missing-media-only') {
      options.missingMediaOnly = true
      continue
    }
    throw new Error(`Unknown argument: ${arg}`)
  }

  return options
}

function summarizeDryRunItem(item) {
  return `[dry-run] ${item.fileName || item.id}: source=${item.source} previews=${item.archivePreviewCount} version=${item.versionPreviewCount} legacy=${item.legacyPreviewCount} existingArchive=${item.existingArchivePreviewCount}`
}

async function fileExists(filePath) {
  try {
    const stats = await stat(filePath)
    return stats.isFile()
  } catch {
    return false
  }
}

async function readArchiveSidecar(download) {
  const candidates = [
    download.sidecarPath,
    download.targetPath ? getArchiveSidecarPath(download.targetPath) : '',
  ].filter(Boolean)

  for (const candidate of candidates) {
    try {
      return JSON.parse(await readFile(candidate, 'utf8'))
    } catch {}
  }

  return null
}

async function hasMissingArchiveMedia(download) {
  const sidecar = await readArchiveSidecar(download)
  if (sidecar?.archiveVersion !== 1) {
    return false
  }

  const images = Array.isArray(sidecar.previewImages)
    ? sidecar.previewImages
    : Array.isArray(sidecar.previewPaths)
      ? sidecar.previewPaths
      : []
  for (const image of images) {
    if (image?.path && !(await fileExists(image.path))) {
      return true
    }
  }

  return false
}

export async function runCivitaiArchiveBackfill({ logger = console, dryRun = false, missingMediaOnly = false } = {}) {
  refreshConfigFromEnv()
  resetDownloadsRuntimeState()
  await ensureDownloadsLoaded()

  const summary = {
    dryRun,
    missingMediaOnly,
    completed: 0,
    partial: 0,
    skipped: 0,
    failed: 0,
    mediaDownloaded: 0,
    mediaReused: 0,
    skipReasons: {},
    items: [],
  }
  let changed = false

  let downloads = [...civitaiDownloads.values()].filter((download) => download?.state === 'complete')
  if (missingMediaOnly) {
    const missingMediaDownloads = []
    for (const download of downloads) {
      if (await hasMissingArchiveMedia(download)) {
        missingMediaDownloads.push(download)
      }
    }
    downloads = missingMediaDownloads
  }
  summary.candidateCount = downloads.length

  for (const download of downloads) {
    try {
      if (dryRun) {
        const result = await inspectCivitaiArchiveForDownload(download)
        if (result.skipped) {
          summary.skipped += 1
          summary.skipReasons[result.reason] = (summary.skipReasons[result.reason] ?? 0) + 1
          logger.log(`[skip] ${download.fileName || download.id}: ${result.reason}`)
          continue
        }

        summary.completed += 1
        summary.items.push(result)
        logger.log(summarizeDryRunItem(result))
        continue
      }

      const result = await refreshCivitaiArchiveForDownload(download)
      if (result.skipped) {
        summary.skipped += 1
        summary.skipReasons[result.reason] = (summary.skipReasons[result.reason] ?? 0) + 1
        logger.log(`[skip] ${download.fileName || download.id}: ${result.reason}`)
        continue
      }

      changed = changed || result.changed === true
      download.updatedAt = Date.now()
      const status = result.archiveStatus ?? {}
      if (status.partial) {
        summary.partial += 1
        logger.log(`[partial] ${download.fileName || download.id}`)
      } else {
        summary.completed += 1
        logger.log(`[ok] ${download.fileName || download.id}`)
      }
      summary.mediaDownloaded += Number(status.mediaFetched ?? status.mediaDownloaded ?? 0) || 0
      summary.mediaReused += Number(status.mediaReused ?? 0) || 0
    } catch (error) {
      summary.failed += 1
      logger.error(
        `[fail] ${download.fileName || download.id}: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  if (changed) {
    await writeDownloadsStateNow()
  }

  logger.log(JSON.stringify(summary, null, 2))
  return summary
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runCivitaiArchiveBackfill(parseCivitaiArchiveBackfillArgs(process.argv.slice(2))).catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
