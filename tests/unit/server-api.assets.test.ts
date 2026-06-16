import { join } from 'node:path'
import { readFile, writeFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { useServerHarness } from './serverApiTestUtils'
import { workflowNodesFromBody } from './workflowTestUtils'

const { setupHarness, downloadItem } = useServerHarness()

async function waitForCivitaiVersionCalls(server: Awaited<ReturnType<typeof setupHarness>>, expectedCount: number) {
  const deadline = Date.now() + 500

  while (Date.now() < deadline) {
    const count = server.calls.filter((call) => call.url.pathname === '/api/v1/model-versions/201').length
    if (count >= expectedCount) {
      return count
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 10)
    })
  }

  return server.calls.filter((call) => call.url.pathname === '/api/v1/model-versions/201').length
}

describe('companion server API routes', () => {
  it('covers input images, model previews, view proxy, and open parent folder routes', async () => {
      const server = await setupHarness()

      const checkpointPreview = await server.request(
        '/api/model-preview?type=checkpoint&name=waiIllustriousSDXL_v160.safetensors',
      )
      expect(checkpointPreview.response.status).toBe(200)
      expect(checkpointPreview.payload).toBe('checkpoint preview')

      await expect(server.request('/api/model-preview?type=checkpoint&name=..%2Fescape.safetensors')).resolves.toMatchObject({
        response: expect.objectContaining({ status: 404 }),
        payload: expect.objectContaining({ error: 'preview-not-found' }),
      })

      const uploadForm = new FormData()
      uploadForm.set('image', new File(['image bytes'], 'source.png', { type: 'image/png' }))
      const upload = await server.request('/api/upload-input-image', {
        method: 'POST',
        body: uploadForm,
      })
      expect(upload.payload).toMatchObject({ ok: true, inputImageName: expect.stringMatching(/\.png$/) })
      await expect(readFile(join(server.inputDir, upload.payload.inputImageName), 'utf8')).resolves.toBe('image bytes')

      server.upstream.histories['prompt-1'] = {
        'prompt-1': {
          status: { status_str: 'success' },
          outputs: {
            5: {
              images: [{ filename: 'controlnet-preview.png', subfolder: '', type: 'output' }],
            },
          },
        },
      }
      await expect(
        server.json('POST', '/api/controlnet-preview', {
          inputImageName: upload.payload.inputImageName,
          preprocessor: 'lineart',
          resolution: 512,
        }),
      ).resolves.toMatchObject({
        payload: expect.objectContaining({
          ok: true,
          preview: expect.objectContaining({
            filename: 'controlnet-preview.png',
            url: '/api/view?filename=controlnet-preview.png&subfolder=&type=output',
          }),
        }),
      })
      const previewPrompt = server.calls.find((call) => call.method === 'POST' && call.url.pathname === '/prompt')
      expect(workflowNodesFromBody(previewPrompt?.body).some((node) => node.class_type === 'LineArtPreprocessor')).toBe(true)

      const inputGeneration = await server.json('POST', '/api/generate', {
        prompt: 'img2img portrait',
        checkpoint: 'waiIllustriousSDXL_v160.safetensors',
        inputImageName: upload.payload.inputImageName,
        inputImageDisplayName: 'source.png',
        imageDenoise: 0.6,
      })
      expect(inputGeneration.payload).toMatchObject({
        ok: true,
        promptId: 'prompt-2',
        inputImageName: upload.payload.inputImageName,
        inputImageDisplayName: 'source.png',
      })
      await expect(server.request('/api/jobs/prompt-2')).resolves.toMatchObject({
        payload: expect.objectContaining({
          promptId: 'prompt-2',
          inputImageName: upload.payload.inputImageName,
          inputImageDisplayName: 'source.png',
        }),
      })

      const controlGeneration = await server.json('POST', '/api/generate', {
        prompt: 'controlled portrait',
        checkpoints: [
          {
            name: 'waiIllustriousSDXL_v160.safetensors',
            controlNets: [
              {
                model: 'mistoLine_rank256.safetensors',
                inputImageName: upload.payload.inputImageName,
                preprocessor: 'lineart',
              },
            ],
          },
        ],
      })
      expect(controlGeneration.payload).toMatchObject({
        ok: true,
        promptId: 'prompt-3',
      })
      await expect(server.request('/api/jobs/prompt-3')).resolves.toMatchObject({
        payload: expect.objectContaining({
          promptId: 'prompt-3',
          controlNets: expect.arrayContaining([
            expect.objectContaining({
              model: 'mistoLine_rank256.safetensors',
              inputImageName: upload.payload.inputImageName,
            }),
          ]),
        }),
      })

      const invalidUpload = new FormData()
      invalidUpload.set('image', new File(['text'], 'source.txt', { type: 'text/plain' }))
      await expect(server.request('/api/upload-input-image', { method: 'POST', body: invalidUpload })).resolves.toMatchObject({
        response: expect.objectContaining({ status: 400 }),
        payload: expect.objectContaining({ error: 'unsupported-image-type' }),
      })

      const view = await server.request('/api/view?filename=mock-output.png&subfolder=&type=output')
      expect(view.response.status).toBe(200)
      expect(view.response.headers.get('content-type')).toBe('image/png')
      const windowsSubfolderView = await server.request(
        '/api/view?filename=mock-output.png&subfolder=2026-05-04%5Ctxt2img&type=output',
      )
      expect(windowsSubfolderView.response.status).toBe(200)
      const proxiedWindowsSubfolderView = server.calls.find(
        (call) =>
          call.method === 'GET' &&
          call.url.pathname === '/view' &&
          call.url.searchParams.get('subfolder') === '2026-05-04/txt2img',
      )
      expect(proxiedWindowsSubfolderView).toBeTruthy()
      await expect(server.request('/api/view?filename=..%2Fescape.png&subfolder=&type=output')).resolves.toMatchObject({
        response: expect.objectContaining({ status: 400 }),
        payload: expect.objectContaining({ error: 'invalid-image-ref' }),
      })
      await expect(
        server.request('/api/view?filename=mock-output.png&subfolder=C%3A%5Cescape&type=output'),
      ).resolves.toMatchObject({
        response: expect.objectContaining({ status: 400 }),
        payload: expect.objectContaining({ error: 'invalid-image-ref' }),
      })

      await expect(
        server.json('POST', '/api/open-parent-folder', {
          filename: 'mock-output.png',
          subfolder: '',
          type: 'output',
        }),
      ).resolves.toMatchObject({
        payload: expect.objectContaining({
          ok: true,
          parentDirectory: server.outputDir,
        }),
      })
      expect(server.openedFolders).toEqual([server.outputDir])

      await expect(
        server.json('POST', '/api/open-parent-folder', {
          filename: 'mock-output.png',
          subfolder: '../escape',
          type: 'output',
        }),
      ).resolves.toMatchObject({
        response: expect.objectContaining({ status: 400 }),
        payload: expect.objectContaining({ error: 'invalid-image-ref' }),
      })
    })

  it('covers download list, create, actions, previews, repair, clear, and error routes', async () => {
      const server = await setupHarness()
      const previewPath = join(server.root, 'download.preview.png')
      const galleryPath = join(server.root, 'download.gallery.png')
      await Promise.all([
        writeFile(previewPath, 'download preview', 'utf8'),
        writeFile(galleryPath, 'gallery preview', 'utf8'),
        writeFile(join(server.loraDir, 'paused.safetensors'), 'paused target', 'utf8'),
        writeFile(join(server.loraDir, 'complete.safetensors'), 'complete target', 'utf8'),
      ])

      await server.writeDownloads([
        downloadItem('paused', 'paused', {
          targetPath: join(server.loraDir, 'paused.safetensors'),
          partialPath: join(server.loraDir, 'paused.safetensors.part'),
        }),
        downloadItem('complete', 'complete', {
          targetPath: join(server.loraDir, 'complete.safetensors'),
          previewPath,
          previewUrl: '/api/civitai/downloads/complete/preview',
          previewImages: [{ id: 1, url: 'https://image.test/preview.png' }],
          previewPaths: [{ path: galleryPath, url: '/api/civitai/downloads/complete/previews/0' }],
          finishedAt: 2,
          progressPercent: 100,
        }),
        downloadItem('error', 'error', {
          error: 'Network failed',
        }),
        downloadItem('cancelled', 'cancelled'),
      ])

      await expect(server.request('/api/civitai/downloads')).resolves.toMatchObject({
        payload: expect.objectContaining({
          ok: true,
          counts: expect.objectContaining({
            paused: 1,
            complete: 1,
            error: 1,
          }),
        }),
      })

      await expect(server.json('POST', '/api/civitai/downloads/paused/resume')).resolves.toMatchObject({
        payload: expect.objectContaining({
          ok: true,
          item: expect.objectContaining({ id: 'paused', state: 'complete', progressPercent: 100 }),
        }),
      })

      await expect(server.json('POST', '/api/civitai/downloads/error/cancel')).resolves.toMatchObject({
        payload: expect.objectContaining({
          ok: true,
          item: expect.objectContaining({ id: 'error', state: 'cancelled' }),
        }),
      })

      await expect(server.json('POST', '/api/civitai/downloads/missing/pause')).resolves.toMatchObject({
        response: expect.objectContaining({ status: 404 }),
        payload: expect.objectContaining({ error: 'download-not-found' }),
      })

      await expect(server.request('/api/civitai/downloads/complete/preview')).resolves.toMatchObject({
        response: expect.objectContaining({ status: 200 }),
        payload: 'download preview',
      })
      await expect(server.request('/api/civitai/downloads/complete/previews/0')).resolves.toMatchObject({
        response: expect.objectContaining({ status: 200 }),
        payload: 'gallery preview',
      })
      await expect(server.request('/api/civitai/downloads/complete/previews/not-a-number')).resolves.toMatchObject({
        response: expect.objectContaining({ status: 404 }),
        payload: expect.objectContaining({ error: 'preview-not-found' }),
      })

      await expect(server.json('POST', '/api/civitai/downloads/complete/delete-file')).resolves.toMatchObject({
        payload: expect.objectContaining({
          ok: true,
          item: expect.objectContaining({ id: 'complete', state: 'deleted', progressPercent: 0 }),
        }),
      })
      await expect(readFile(join(server.loraDir, 'complete.safetensors'), 'utf8')).rejects.toThrow()

      await expect(server.json('POST', '/api/civitai/downloads/complete/redownload')).resolves.toMatchObject({
        payload: expect.objectContaining({
          ok: true,
          item: expect.objectContaining({ id: 'complete', state: 'queued' }),
        }),
      })

      await expect(server.json('POST', '/api/civitai/downloads/repair-previews')).resolves.toMatchObject({
        payload: expect.objectContaining({
          ok: true,
          repaired: expect.any(Number),
        }),
      })

      await expect(server.json('POST', '/api/civitai/downloads/clear')).resolves.toMatchObject({
        payload: expect.objectContaining({
          ok: true,
          cleared: expect.any(Number),
        }),
      })

      await expect(
        server.json('POST', '/api/civitai/downloads', {
          modelId: 101,
          modelName: 'Mock Detail LoRA',
          modelType: 'LORA',
          modelNsfw: true,
          modelMetadata: {
            id: 101,
            name: 'Mock Detail LoRA',
            type: 'LORA',
            nsfw: true,
          },
          versionId: 201,
          versionName: 'v1',
          file: {
            id: 301,
            name: 'newDetail.safetensors',
            type: 'Model',
            downloadUrl: 'https://download.test/newDetail.safetensors',
          },
        }),
      ).resolves.toMatchObject({
        payload: expect.objectContaining({
          ok: true,
          item: expect.objectContaining({
            id: '101__201__301',
            modelNsfw: true,
            modelMetadata: expect.objectContaining({ nsfw: true }),
            state: expect.stringMatching(/queued|downloading|complete/),
          }),
        }),
      })

      await expect(server.json('POST', '/api/civitai/downloads', { modelId: 1 })).resolves.toMatchObject({
        response: expect.objectContaining({ status: 400 }),
        payload: expect.objectContaining({ error: 'invalid-download' }),
      })
    })

  it('keeps NSFW downloads in list, panel, and summary when app settings disable NSFW', async () => {
      const server = await setupHarness()

      await server.writeDownloads([
        downloadItem('safe-active', 'paused', {
          modelName: 'Safe active model',
          modelNsfw: false,
          modelMetadata: { nsfw: false },
        }),
        downloadItem('safe-complete', 'complete', {
          modelName: 'Safe complete model',
          modelNsfw: false,
          modelMetadata: { nsfw: false },
        }),
        downloadItem('nsfw-active', 'paused', {
          modelName: 'NSFW active model',
          modelNsfw: true,
          modelMetadata: { nsfw: true },
        }),
        downloadItem('nsfw-complete', 'complete', {
          modelName: 'NSFW complete model',
          modelNsfw: true,
          modelMetadata: { nsfw: true },
        }),
        downloadItem('nsfw-preview', 'error', {
          modelName: 'NSFW preview model',
          modelNsfw: false,
          modelMetadata: { nsfw: false },
          previewImages: [{ id: 1, url: 'https://image.test/nsfw.png', nsfw: 'Soft' }],
        }),
      ])

      await server.json('PUT', '/api/settings/app', { includeNsfw: false })

      const visibleList = await server.request('/api/civitai/downloads')
      expect(visibleList.payload).toMatchObject({
        ok: true,
        items: [
          expect.objectContaining({ id: 'safe-active' }),
          expect.objectContaining({ id: 'nsfw-active' }),
          expect.objectContaining({ id: 'nsfw-preview' }),
          expect.objectContaining({ id: 'safe-complete' }),
          expect.objectContaining({ id: 'nsfw-complete' }),
        ],
        counts: expect.objectContaining({
          paused: 2,
          complete: 2,
          error: 1,
        }),
      })
      expect(visibleList.payload.items.map((item: { id: string }) => item.id)).toContain('nsfw-active')
      expect(visibleList.payload.items.map((item: { id: string }) => item.id)).toContain('nsfw-complete')
      expect(visibleList.payload.items.map((item: { id: string }) => item.id)).toContain('nsfw-preview')

      await expect(server.request('/api/civitai/downloads/panel')).resolves.toMatchObject({
        payload: expect.objectContaining({
          items: [
            expect.objectContaining({ id: 'safe-active' }),
            expect.objectContaining({ id: 'nsfw-active' }),
            expect.objectContaining({ id: 'nsfw-preview' }),
            expect.objectContaining({ id: 'safe-complete' }),
            expect.objectContaining({ id: 'nsfw-complete' }),
          ],
          counts: expect.objectContaining({
            active: 2,
            visibleComplete: 2,
            attention: 1,
          }),
        }),
      })

      await expect(server.request('/api/civitai/downloads/summary')).resolves.toMatchObject({
        payload: expect.objectContaining({
          counts: expect.objectContaining({
            active: 2,
            visibleComplete: 2,
            attention: 1,
            complete: 2,
          }),
        }),
      })
    })

  it('backs off automatic download metadata refreshes after Civitai fails', async () => {
      const server = await setupHarness({
        upstream: {
          failures: {
            'GET https://civitai.com/api/v1/model-versions/201': {
              status: 502,
              payload: { message: 'Bad gateway' },
            },
          },
        },
      })

      await server.writeDownloads([
        downloadItem('missing-metadata', 'complete', {
          modelNsfw: null,
          modelMetadata: null,
        }),
      ])

      await expect(server.request('/api/civitai/downloads')).resolves.toMatchObject({
        response: expect.objectContaining({ status: 200 }),
      })
      expect(await waitForCivitaiVersionCalls(server, 1)).toBe(1)

      await new Promise((resolve) => {
        setTimeout(resolve, 10)
      })
      await expect(server.request('/api/civitai/downloads')).resolves.toMatchObject({
        response: expect.objectContaining({ status: 200 }),
      })
      await new Promise((resolve) => {
        setTimeout(resolve, 25)
      })

      expect(server.calls.filter((call) => call.url.pathname === '/api/v1/model-versions/201')).toHaveLength(1)
    })

  it('limits automatic download metadata refresh fan-out per downloads list request', async () => {
      const server = await setupHarness()

      await server.writeDownloads(
        Array.from({ length: 5 }, (_, index) =>
          downloadItem(`missing-metadata-${index + 1}`, 'complete', {
            modelNsfw: null,
            modelMetadata: null,
            versionId: 201 + index,
          }),
        ),
      )

      await expect(server.request('/api/civitai/downloads')).resolves.toMatchObject({
        response: expect.objectContaining({ status: 200 }),
      })
      await new Promise((resolve) => {
        setTimeout(resolve, 50)
      })

      expect(server.calls.filter((call) => call.url.pathname.startsWith('/api/v1/model-versions/'))).toHaveLength(3)
    })

})
