// @vitest-environment jsdom

import { computed, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'

describe('createAssetDownloadActions', () => {
  it('shows a success notice after queuing one version', async () => {
    const queueDownload = vi.fn().mockResolvedValue({
      ok: true,
      item: {
        state: 'queued',
        fileName: 'v1.safetensors',
      },
    })
    const downloadActionNotice = ref('')
    const { createAssetDownloadActions } = await import('../../src/views/assets/assetDownloadActions')
    const actions = createAssetDownloadActions({
      downloadByVersionId: computed(() => new Map()),
      downloadActionError: ref(''),
      downloadActionNotice,
      openDownloadMenuKey: ref(''),
      queuingDownloadKey: ref(''),
      queueDownload,
    } as never)

    await actions.queueAssetDownload({
      id: 101,
      name: 'Single version LoRA',
      type: 'LORA',
      nsfw: false,
      modelVersions: [modelVersion(201, 'v1.safetensors')],
    }, modelVersion(201, 'v1.safetensors'))

    expect(downloadActionNotice.value).toBe('Queued v1.safetensors.')
  })

  it('queues all missing model versions without redownloading completed versions', async () => {
    const queueDownload = vi.fn().mockResolvedValue({ ok: true })
    const downloadActionNotice = ref('')
    const { createAssetDownloadActions } = await import('../../src/views/assets/assetDownloadActions')
    const actions = createAssetDownloadActions({
      downloadByVersionId: computed(() => new Map([
        [202, [{ id: 'complete-version', state: 'complete', versionId: 202 }]],
        [203, [{ id: 'failed-version', state: 'error', versionId: 203 }]],
      ])),
      downloadActionError: ref(''),
      downloadActionNotice,
      openDownloadMenuKey: ref('101'),
      queuingDownloadKey: ref(''),
      queueDownload,
    } as never)

    await actions.queueMissingVersionsForModel({
      id: 101,
      name: 'Multi version checkpoint',
      type: 'Checkpoint',
      nsfw: false,
      modelVersions: [
        modelVersion(201, 'v1.safetensors'),
        modelVersion(202, 'v2.safetensors'),
        modelVersion(203, 'v3.safetensors'),
      ],
    })

    expect(queueDownload).toHaveBeenCalledTimes(2)
    expect(queueDownload).toHaveBeenNthCalledWith(1, expect.objectContaining({
      versionId: 201,
      file: expect.objectContaining({ name: 'v1.safetensors' }),
    }))
    expect(queueDownload).toHaveBeenNthCalledWith(2, expect.objectContaining({
      versionId: 203,
      file: expect.objectContaining({ name: 'v3.safetensors' }),
    }))
    expect(downloadActionNotice.value).toBe('Queued 2 versions for Multi version checkpoint.')
  })
})

function modelVersion(id: number, fileName: string) {
  return {
    id,
    name: `v${id}`,
    baseModel: 'Pony',
    files: [{
      id: id + 100,
      name: fileName,
      type: 'Model',
      primary: true,
      downloadUrl: `https://download.test/${fileName}`,
    }],
  }
}
