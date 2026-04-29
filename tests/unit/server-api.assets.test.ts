import { join } from 'node:path'
import { readFile, writeFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { useServerHarness } from './serverApiTestUtils'

const { setupHarness, downloadItem } = useServerHarness()

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
      expect(Object.values((previewPrompt?.body as any).prompt).some((node: any) => node.class_type === 'LineArtPreprocessor')).toBe(true)

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

      const invalidUpload = new FormData()
      invalidUpload.set('image', new File(['text'], 'source.txt', { type: 'text/plain' }))
      await expect(server.request('/api/upload-input-image', { method: 'POST', body: invalidUpload })).resolves.toMatchObject({
        response: expect.objectContaining({ status: 400 }),
        payload: expect.objectContaining({ error: 'unsupported-image-type' }),
      })

      const view = await server.request('/api/view?filename=mock-output.png&subfolder=&type=output')
      expect(view.response.status).toBe(200)
      expect(view.response.headers.get('content-type')).toBe('image/png')
      await expect(server.request('/api/view?filename=..%2Fescape.png&subfolder=&type=output')).resolves.toMatchObject({
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
})
