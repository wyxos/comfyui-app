import {
  jsonResponse,
  type MockDownload,
} from './mockApiData'

type WatchedDownloadsStore = {
  get: () => MockDownload[]
  set: (downloads: MockDownload[]) => void
}

function watchedDownloadFromBody(body: Record<string, unknown> | null): MockDownload {
  const file = body?.file && typeof body.file === 'object' && !Array.isArray(body.file)
    ? body.file as Record<string, unknown>
    : {}
  const modelId = Number(body?.modelId ?? 0)
  const versionId = Number(body?.versionId ?? 0)
  const fileId = file.id ?? file.name ?? Date.now()
  const fileName = typeof file.name === 'string'
    ? file.name
    : typeof body?.versionName === 'string'
      ? body.versionName
      : 'watched.safetensors'

  return {
    id: [modelId, versionId, fileId].join('__'),
    state: 'watching',
    modelId,
    modelName: String(body?.modelName ?? 'Watched model'),
    modelType: String(body?.modelType ?? 'LORA'),
    modelNsfw: body?.modelNsfw ?? null,
    modelMetadata: body?.modelMetadata ?? null,
    versionId,
    versionName: String(body?.versionName ?? `Version ${versionId}`),
    baseModel: body?.baseModel ?? null,
    fileId,
    fileName,
    file,
    trainedWords: Array.isArray(body?.trainedWords) ? body.trainedWords : [],
    previewImage: body?.previewImage ?? null,
    previewImages: Array.isArray(body?.previewImages) ? body.previewImages : [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}

export function handleMockWatchedDownloads(
  store: WatchedDownloadsStore,
  path: string,
  method: string,
  body: unknown,
) {
  if (path === '/api/civitai/watched-downloads' && method === 'GET') {
    return jsonResponse({
      ok: true,
      items: store.get(),
    })
  }

  if (path === '/api/civitai/watched-downloads' && method === 'POST') {
    const watchedDownload = watchedDownloadFromBody((body ?? {}) as Record<string, unknown>)
    store.set([
      watchedDownload,
      ...store.get().filter((download) => download.id !== watchedDownload.id),
    ])
    return jsonResponse({ ok: true, item: watchedDownload })
  }

  const watchedDownloadMatch = path.match(/^\/api\/civitai\/watched-downloads\/([^/]+)$/)
  if (watchedDownloadMatch && method === 'DELETE') {
    const watchedDownloadId = decodeURIComponent(watchedDownloadMatch[1])
    store.set(store.get().map((download) =>
      download.id === watchedDownloadId
        ? { ...download, state: 'cancelled', updatedAt: Date.now() }
        : download,
    ))
    return jsonResponse({ ok: true, item: store.get().find((download) => download.id === watchedDownloadId) })
  }

  return null
}
