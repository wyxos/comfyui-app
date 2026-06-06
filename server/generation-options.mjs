import { animaAssets, samplerProfiles } from './config.mjs'
import { comfyFetchJson } from './comfy-client.mjs'
import { safeTrim } from './shared.mjs'

function dedupeOptions(values, fallbackValues = []) {
  const seen = new Set()
  const options = []
  for (const value of [...values, ...fallbackValues]) {
    const option = safeTrim(value)
    if (!option || seen.has(option)) {
      continue
    }

    seen.add(option)
    options.push(option)
  }

  return options
}

function requiredOptionList(payload, nodeName, fieldName) {
  const rawList = payload?.[nodeName]?.input?.required?.[fieldName]?.[0]
  return Array.isArray(rawList) ? rawList : []
}

async function fetchObjectInfo(nodeName) {
  try {
    return await comfyFetchJson(`/object_info/${nodeName}`)
  } catch {
    return null
  }
}

export async function buildGenerationOptions() {
  const [samplerInfo, clipInfo, vaeInfo] = await Promise.all([
    fetchObjectInfo('KSampler'),
    fetchObjectInfo('CLIPLoader'),
    fetchObjectInfo('VAELoader'),
  ])
  const samplerFallbacks = [samplerProfiles.sdxl.samplerName, samplerProfiles.anima.samplerName]
  const schedulerFallbacks = [samplerProfiles.sdxl.scheduler, samplerProfiles.anima.scheduler]

  return {
    ok: true,
    samplers: dedupeOptions(requiredOptionList(samplerInfo, 'KSampler', 'sampler_name'), samplerFallbacks),
    schedulers: dedupeOptions(requiredOptionList(samplerInfo, 'KSampler', 'scheduler'), schedulerFallbacks),
    clipNames: dedupeOptions(requiredOptionList(clipInfo, 'CLIPLoader', 'clip_name'), [animaAssets.clipName]),
    vaeNames: dedupeOptions(requiredOptionList(vaeInfo, 'VAELoader', 'vae_name'), [animaAssets.vaeName]),
    defaults: {
      sdxl: {
        samplerName: samplerProfiles.sdxl.samplerName,
        scheduler: samplerProfiles.sdxl.scheduler,
      },
      anima: {
        samplerName: samplerProfiles.anima.samplerName,
        scheduler: samplerProfiles.anima.scheduler,
        clipName: animaAssets.clipName,
        vaeName: animaAssets.vaeName,
      },
    },
  }
}
