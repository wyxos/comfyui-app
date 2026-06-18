import { fileURLToPath } from 'node:url'

import { collectDownloadedAtlasTargets } from './atlas-downloaded-assets-targets.mjs'
import { delay, safeTrim } from '../server/shared.mjs'
import { getStoredAtlasSettings } from '../server/settings.mjs'

const defaultDelayMs = 1000
const favoriteReactionType = 'love'

export function parseAtlasFavoriteArgs(argv = []) {
  const options = { delayMs: defaultDelayMs, dryRun: false, help: false }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]

    if (arg === '--dry-run' || arg === '-n') {
      options.dryRun = true
      continue
    }

    if (arg === '--help' || arg === '-h') {
      options.help = true
      continue
    }

    if (arg === '--delay-ms') {
      index += 1
      options.delayMs = parseDelayMs(argv[index], arg)
      continue
    }

    if (arg.startsWith('--delay-ms=')) {
      options.delayMs = parseDelayMs(arg.slice('--delay-ms='.length), '--delay-ms')
      continue
    }

    throw new Error(`Unknown argument: ${arg}`)
  }

  return options
}

export function atlasFavoriteUsage() {
  return `Usage: node scripts/atlas-favorite-downloaded-assets.mjs [--dry-run] [--delay-ms=1000]

Favorites every archived preview for completed Civitai downloads in Atlas,
then opens an Atlas Civitai model tab for each downloaded model version.

Options:
  -n, --dry-run       Print planned Atlas requests without sending them.
      --delay-ms N    Delay between Atlas requests. Default: 1000.
  -h, --help          Show this help text.`
}

function parseDelayMs(value, label) {
  const parsed = Number.parseInt(String(value ?? ''), 10)
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`${label} must be a non-negative integer.`)
  }
  return parsed
}

function atlasResourceType(modelType) {
  const normalized = safeTrim(modelType).toLowerCase()
  return normalized === 'lora' || normalized === 'loras' || normalized === 'lycoris' ? 'LoRA' : 'Checkpoint'
}

function atlasItemFor(preview, asset, version) {
  return {
    request_id: `civitai:${preview.id}`,
    id: preview.id,
    url: preview.url,
    type: preview.type,
    nsfwLevel: preview.nsfwLevel,
    width: preview.width,
    height: preview.height,
    hash: preview.hash,
    postId: preview.postId,
    username: preview.username || asset.creator?.username,
    meta: preview.meta,
    modelId: asset.id,
    modelVersionId: version.id,
    modelType: asset.type,
    resource_containers: [{
      type: atlasResourceType(asset.type),
      modelId: asset.id,
      modelVersionId: version.id,
      referrerUrl: `https://civitai.com/models/${asset.id}?modelVersionId=${version.id}`,
    }],
  }
}

function openTabPayload(asset, version) {
  return {
    model_id: asset.id,
    model_version_id: version.id,
    type: 'all',
    sort: 'Newest',
    period: 'AllTime',
    nsfw: true,
  }
}

function atlasUrl(baseUrl, pathname) {
  return new URL(pathname, baseUrl).toString()
}

async function postAtlas(pathname, body, { atlasSettings, fetchImpl }) {
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json; charset=utf-8',
  }
  if (atlasSettings.apiKey) {
    headers['X-Atlas-Api-Key'] = atlasSettings.apiKey
  }

  const response = await fetchImpl(atlasUrl(atlasSettings.baseUrl, pathname), {
    method: 'POST',
    headers,
    body: JSON.stringify(body ?? {}),
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const error = new Error(payload?.message ?? `Atlas returned ${response.status}.`)
    error.status = response.status
    error.payload = payload
    throw error
  }

  return payload && typeof payload === 'object' ? payload : { ok: true }
}

function logError(logger, message) {
  if (typeof logger.error === 'function') {
    logger.error(message)
    return
  }
  logger.log(message)
}

async function waitForAtlasTurn(state, delayMs, logger) {
  if (state.requestCount > 0 && delayMs > 0) {
    logger.log(`[wait] ${delayMs}ms`)
    await delay(delayMs)
  }
  state.requestCount += 1
}

function createRunSummary(targetSummary, dryRun) {
  return {
    ...targetSummary,
    dryRun,
    reaction: {
      planned: targetSummary.previewCount,
      completed: 0,
      failed: 0,
    },
    tab: {
      planned: targetSummary.versionCount,
      completed: 0,
      failed: 0,
    },
  }
}

export async function runAtlasFavoriteDownloadedAssets({
  delayMs = defaultDelayMs,
  dryRun = false,
  fetchImpl = fetch,
  logger = console,
} = {}) {
  const { assets, summary: targetSummary } = await collectDownloadedAtlasTargets()
  const summary = createRunSummary(targetSummary, dryRun)
  const requestState = { requestCount: 0 }
  let atlasSettings = null
  let reactionIndex = 0
  let tabIndex = 0
  let versionIndex = 0

  logger.log(
    `[plan] assets=${summary.assetCount} versions=${summary.versionCount} previews=${summary.previewCount} ` +
    `dryRun=${dryRun}`,
  )

  if (!dryRun) {
    atlasSettings = await getStoredAtlasSettings()
    if (!atlasSettings.baseUrl) {
      throw new Error('Atlas integration is not configured. Save Atlas settings or run with --dry-run.')
    }
  }

  for (const [assetOffset, asset] of assets.entries()) {
    logger.log(`[asset ${assetOffset + 1}/${summary.assetCount}] ${asset.name} (${asset.id})`)

    for (const version of asset.versions) {
      versionIndex += 1
      logger.log(`[version ${versionIndex}/${summary.versionCount}] ${version.name} (${version.id}) previews=${version.previews.length}`)

      for (const preview of version.previews) {
        reactionIndex += 1
        const body = {
          type: favoriteReactionType,
          download_behavior: 'queue',
          item: atlasItemFor(preview, asset, version),
        }

        if (dryRun) {
          logger.log(`[dry-run reaction ${reactionIndex}/${summary.previewCount}] image=${preview.id} ${preview.url}`)
          continue
        }

        try {
          await waitForAtlasTurn(requestState, delayMs, logger)
          await postAtlas('/api/extension/civitai/reactions', body, { atlasSettings, fetchImpl })
          summary.reaction.completed += 1
          logger.log(`[reaction ${reactionIndex}/${summary.previewCount}] ok image=${preview.id}`)
        } catch (error) {
          summary.reaction.failed += 1
          logError(logger, `[reaction ${reactionIndex}/${summary.previewCount}] fail image=${preview.id}: ${error.message}`)
          if (error.status === 429) {
            throw error
          }
        }
      }

      tabIndex += 1
      const body = openTabPayload(asset, version)
      if (dryRun) {
        logger.log(`[dry-run tab ${tabIndex}/${summary.versionCount}] model=${asset.id} version=${version.id}`)
        continue
      }

      try {
        await waitForAtlasTurn(requestState, delayMs, logger)
        await postAtlas('/api/extension/browse-tabs/civitai-model', body, { atlasSettings, fetchImpl })
        summary.tab.completed += 1
        logger.log(`[tab ${tabIndex}/${summary.versionCount}] ok model=${asset.id} version=${version.id}`)
      } catch (error) {
        summary.tab.failed += 1
        logError(logger, `[tab ${tabIndex}/${summary.versionCount}] fail model=${asset.id} version=${version.id}: ${error.message}`)
        if (error.status === 429) {
          throw error
        }
      }
    }
  }

  logger.log(`[done] reactions=${summary.reaction.completed}/${summary.reaction.planned} tabs=${summary.tab.completed}/${summary.tab.planned} skippedDownloads=${summary.skippedDownloads} skippedPreviews=${summary.skippedPreviews}`)
  return summary
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const options = parseAtlasFavoriteArgs(process.argv.slice(2))
    if (options.help) {
      console.log(atlasFavoriteUsage())
    } else {
      await runAtlasFavoriteDownloadedAssets(options)
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  }
}
