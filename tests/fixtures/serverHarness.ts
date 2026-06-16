import type { AddressInfo } from 'node:net'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { vi } from 'vitest'
import { mergeUpstreamState, type UpstreamState } from './serverHarnessUpstream'

type FetchCall = {
  url: URL
  method: string
  body: unknown
  headers: Headers
}

type ServerModule = typeof import('../../server/index.mjs')

type HarnessOptions = {
  upstream?: Partial<UpstreamState>
}

const realFetch = globalThis.fetch.bind(globalThis)

export function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
  })
}

async function removeDirectoryWithRetries(pathname: string) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await rm(pathname, { recursive: true, force: true })
      return
    } catch (error) {
      if (attempt === 4) {
        throw error
      }

      await new Promise((resolveDelay) => {
        setTimeout(resolveDelay, 50)
      })
    }
  }
}

function binaryResponse(body: Uint8Array | string, contentType = 'application/octet-stream') {
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(typeof body === 'string' ? Buffer.byteLength(body) : body.byteLength),
    },
  })
}

async function parseFetchBody(init?: RequestInit) {
  if (!init?.body) {
    return null
  }

  if (typeof init.body === 'string') {
    try {
      return JSON.parse(init.body)
    } catch {
      return init.body
    }
  }

  return init.body
}

function headersFromInit(init?: RequestInit) {
  return new Headers(init?.headers)
}

function failureResponse(failure: { status?: number; payload?: unknown; body?: string } | Error) {
  if (failure instanceof Error) {
    throw failure
  }

  if (failure.body !== undefined) {
    return new Response(failure.body, { status: failure.status ?? 500 })
  }

  return jsonResponse(failure.payload ?? { ok: false, message: 'Mock upstream failure.' }, failure.status ?? 500)
}

export async function createServerHarness(options: HarnessOptions = {}) {
  const root = await mkdtemp(join(tmpdir(), 'comfy-companion-tests-'))
  const configDir = join(root, 'config')
  const inputDir = join(root, 'input')
  const outputDir = join(root, 'output')
  const checkpointDir = join(root, 'models', 'checkpoints')
  const loraDir = join(root, 'models', 'loras')
  const controlNetDir = join(root, 'models', 'controlnet')
  const openedFolders: string[] = []
  const calls: FetchCall[] = []
  const upstream = mergeUpstreamState(options.upstream)

  await Promise.all([
    mkdir(configDir, { recursive: true }),
    mkdir(inputDir, { recursive: true }),
    mkdir(outputDir, { recursive: true }),
    mkdir(checkpointDir, { recursive: true }),
    mkdir(loraDir, { recursive: true }),
    mkdir(controlNetDir, { recursive: true }),
  ])

  await Promise.all([
    writeFile(join(checkpointDir, 'waiIllustriousSDXL_v160.safetensors'), 'checkpoint', 'utf8'),
    writeFile(join(checkpointDir, 'animaPencilXL.safetensors'), 'checkpoint', 'utf8'),
    writeFile(join(checkpointDir, 'waiIllustriousSDXL_v160.preview.png'), 'checkpoint preview', 'utf8'),
    writeFile(join(loraDir, 'detailBoost.safetensors'), 'lora', 'utf8'),
    writeFile(join(controlNetDir, 'mistoLine_rank256.safetensors'), 'controlnet', 'utf8'),
    writeFile(join(controlNetDir, 'depth-sdxl.safetensors'), 'controlnet', 'utf8'),
    writeFile(join(controlNetDir, 'controlnetxlCNXL_windsingaiPose.safetensors'), 'controlnet', 'utf8'),
    writeFile(join(loraDir, 'detailBoost.preview.png'), 'lora preview', 'utf8'),
    writeFile(
      join(checkpointDir, 'waiIllustriousSDXL_v160.safetensors.civitai.info'),
      JSON.stringify({ source: 'civitai', modelId: 901, versionId: 902, modelType: 'Checkpoint', baseModel: 'Pony' }),
      'utf8',
    ),
    writeFile(
      join(checkpointDir, 'animaPencilXL.safetensors.civitai.info'),
      JSON.stringify({ source: 'civitai', modelId: 903, versionId: 904, modelType: 'Checkpoint', baseModel: 'Anima' }),
      'utf8',
    ),
    writeFile(
      join(loraDir, 'detailBoost.safetensors.civitai.info'),
      JSON.stringify({
        source: 'civitai',
        modelId: 101,
        modelType: 'LORA',
        versionId: 201,
        baseModel: 'Pony',
        trainedWords: ['detail boost'],
        hashes: { SHA256: 'MOCKHASH' },
      }),
      'utf8',
    ),
    writeFile(join(outputDir, 'mock-output.png'), 'output image', 'utf8'),
  ])

  const previousEnv = {
    COMFY_COMPANION_CONFIG_DIR: process.env.COMFY_COMPANION_CONFIG_DIR,
    COMFYUI_URL: process.env.COMFYUI_URL,
    COMFYUI_INPUT_DIR: process.env.COMFYUI_INPUT_DIR,
    COMFYUI_OUTPUT_DIR: process.env.COMFYUI_OUTPUT_DIR,
    COMFYUI_CHECKPOINT_DIR: process.env.COMFYUI_CHECKPOINT_DIR,
    COMFYUI_LORA_DIR: process.env.COMFYUI_LORA_DIR,
    COMFYUI_CONTROLNET_DIR: process.env.COMFYUI_CONTROLNET_DIR,
    CIVITAI_DOWNLOAD_SEGMENTS: process.env.CIVITAI_DOWNLOAD_SEGMENTS,
  }

  Object.assign(process.env, {
    COMFY_COMPANION_CONFIG_DIR: configDir,
    COMFYUI_URL: 'http://comfy.test',
    COMFYUI_INPUT_DIR: inputDir,
    COMFYUI_OUTPUT_DIR: outputDir,
    COMFYUI_CHECKPOINT_DIR: checkpointDir,
    COMFYUI_LORA_DIR: loraDir,
    COMFYUI_CONTROLNET_DIR: controlNetDir,
    CIVITAI_DOWNLOAD_SEGMENTS: '1',
  })

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input))
    const method = init?.method?.toUpperCase() ?? 'GET'
    const body = await parseFetchBody(init)
    const headers = headersFromInit(init)
    calls.push({ url, method, body, headers })

    const failure = upstream.failures[`${method} ${url.origin}${url.pathname}`] ?? upstream.failures[`${method} ${url.pathname}`]
    if (failure) {
      return failureResponse(failure)
    }

    if (url.origin === 'http://comfy.test') {
      if (url.pathname === '/object_info/CheckpointLoaderSimple') {
        return jsonResponse(upstream.checkpointInfo)
      }

      if (url.pathname === '/object_info/LoraLoader') {
        return jsonResponse(upstream.loraInfo)
      }

      if (url.pathname === '/object_info/ControlNetLoader') {
        return jsonResponse(upstream.controlNetInfo)
      }

      if (url.pathname === '/object_info/KSampler') {
        return jsonResponse(upstream.samplerInfo)
      }

      if (url.pathname === '/object_info/CLIPLoader') {
        return jsonResponse(upstream.clipInfo)
      }

      if (url.pathname === '/object_info/VAELoader') {
        return jsonResponse(upstream.vaeInfo)
      }

      if (url.pathname === '/system_stats') {
        return jsonResponse({
          system: {
            argv: ['main.py', '--input-directory', inputDir, '--output-directory', outputDir],
          },
        })
      }

      if (url.pathname === '/prompt' && method === 'POST') {
        const promptId = upstream.promptIds.shift() ?? `prompt-${Date.now()}`
        return jsonResponse({ prompt_id: promptId, number: 1 })
      }

      if (url.pathname === '/queue') {
        return jsonResponse(upstream.queue)
      }

      if (url.pathname === '/interrupt' && method === 'POST') {
        return jsonResponse({ ok: true })
      }

      if (url.pathname === '/history' && method === 'POST') {
        return jsonResponse({})
      }

      if (url.pathname.startsWith('/history/')) {
        const promptId = decodeURIComponent(url.pathname.slice('/history/'.length))
        return jsonResponse(upstream.histories[promptId] ?? {})
      }

      if (url.pathname === '/view') {
        return binaryResponse('output image', 'image/png')
      }
    }

    if (url.origin === 'https://civitai.com') {
      if (url.pathname === '/api/v1/models') {
        return jsonResponse(upstream.civitaiModels)
      }

      const modelMatch = url.pathname.match(/^\/api\/v1\/models\/(\d+)$/)
      if (modelMatch) {
        const modelId = Number.parseInt(modelMatch[1], 10)
        const items = (upstream.civitaiModels as { items?: unknown[] })?.items
        const model = Array.isArray(items)
          ? items.find((item) => (item as { id?: number })?.id === modelId)
          : null

        return model ? jsonResponse(model) : jsonResponse({ error: `No model with id ${modelId}` }, 404)
      }

      if (url.pathname === '/api/v1/images') {
        return jsonResponse(upstream.civitaiImages)
      }

      const imagePageMatch = url.pathname.match(/^\/images\/(\d+)$/)
      if (imagePageMatch) {
        const pageBody = upstream.civitaiImagePages[imagePageMatch[1]]
        return pageBody
          ? binaryResponse(pageBody, 'text/html; charset=utf-8')
          : jsonResponse({ error: `No image page with id ${imagePageMatch[1]}` }, 404)
      }

      if (url.pathname === '/api/v1/model-versions/201') {
        return jsonResponse(upstream.civitaiVersion)
      }

      if (url.pathname.startsWith('/api/v1/model-versions/by-hash/')) {
        return jsonResponse(upstream.civitaiVersion)
      }
    }

    if (url.origin === 'https://download.test') {
      return binaryResponse(upstream.downloadBody)
    }

    if (url.origin === 'https://image.test') {
      return binaryResponse('preview image', 'image/png')
    }

    if (url.origin === 'https://atlas.test') {
      if (url.pathname === '/api/extension/civitai/status' && method === 'POST') {
        return jsonResponse(upstream.atlasStatus)
      }

      if (url.pathname === '/api/extension/civitai/reactions' && method === 'POST') {
        return jsonResponse(upstream.atlasReaction)
      }

      if (url.pathname === '/api/extension/browse-tabs/civitai-model' && method === 'POST') {
        return jsonResponse(upstream.atlasOpenModel)
      }
    }

    return jsonResponse({ ok: false, message: `Unhandled upstream ${method} ${url.href}` }, 500)
  })

  vi.stubGlobal('fetch', fetchMock)

  const serverUrl = `${pathToFileURL(resolve('server/index.mjs')).href}?server-api-${Date.now()}-${Math.random()}`
  const serverModule = (await import(serverUrl)) as ServerModule
  const resetAdapters = serverModule.configureCompanionServerForTests({
    openParentFolder(parentDirectory: string) {
      openedFolders.push(parentDirectory)
    },
  })
  const server = serverModule.createCompanionServer({ connectWebSocket: false })

  await new Promise<void>((resolveListen) => server.listen(0, '127.0.0.1', resolveListen))
  const address = server.address() as AddressInfo
  const baseUrl = `http://127.0.0.1:${address.port}`

  async function request(pathname: string, init: RequestInit = {}) {
    const response = await realFetch(`${baseUrl}${pathname}`, init)
    const contentType = response.headers.get('content-type') ?? ''
    const payload = contentType.includes('application/json')
      ? await response.json()
      : await response.text()

    return { response, payload }
  }

  async function json(method: string, pathname: string, payload?: unknown) {
    return request(pathname, {
      method,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: payload === undefined ? undefined : JSON.stringify(payload),
    })
  }

  async function writeDownloads(items: unknown[]) {
    await mkdir(configDir, { recursive: true })
    await writeFile(join(configDir, 'downloads.json'), `${JSON.stringify({ items }, null, 2)}\n`, 'utf8')
  }

  async function readConfigFile(name: string) {
    return readFile(join(configDir, name), 'utf8')
  }

  async function close() {
    resetAdapters()
    await new Promise<void>((resolveClose, rejectClose) => {
      server.close((error) => (error ? rejectClose(error) : resolveClose()))
    })
    serverModule.resetJobStoreRuntimeState()

    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }

    vi.unstubAllGlobals()
    await removeDirectoryWithRetries(root)
  }

  return {
    baseUrl,
    calls,
    checkpointDir,
    close,
    configDir,
    controlNetDir,
    fetchMock,
    inputDir,
    json,
    loraDir,
    openedFolders,
    outputDir,
    readConfigFile,
    request,
    root,
    serverModule,
    upstream,
    writeDownloads,
  }
}
