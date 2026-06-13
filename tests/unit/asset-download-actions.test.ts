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

  it('queues downloadable versions and watches early access versions from queue all', async () => {
    const queueDownload = vi.fn().mockResolvedValue({ ok: true })
    const watchDownload = vi.fn().mockResolvedValue({ ok: true })
    const downloadActionNotice = ref('')
    const { createAssetDownloadActions } = await import('../../src/views/assets/assetDownloadActions')
    const actions = createAssetDownloadActions({
      downloadByVersionId: computed(() => new Map()),
      downloadActionError: ref(''),
      downloadActionNotice,
      openDownloadMenuKey: ref('101'),
      queuingDownloadKey: ref(''),
      queueDownload,
      watchDownload,
      watchedByVersionId: computed(() => new Map()),
    } as never)
    const lockedVersion = {
      ...modelVersion(202, 'locked-v2.safetensors'),
      availability: 'EarlyAccess',
      covered: false,
      files: [{
        id: 302,
        name: 'locked-v2.safetensors',
        type: 'Model',
        primary: true,
      }],
    }
    const model = {
      id: 101,
      name: 'Mixed availability checkpoint',
      type: 'Checkpoint',
      nsfw: false,
      modelVersions: [
        modelVersion(201, 'v1.safetensors'),
        lockedVersion,
      ],
    }

    expect(actions.queueableMissingVersionsForModel(model)).toHaveLength(2)

    await actions.queueMissingVersionsForModel(model)

    expect(queueDownload).toHaveBeenCalledTimes(1)
    expect(queueDownload).toHaveBeenCalledWith(expect.objectContaining({
      versionId: 201,
      file: expect.objectContaining({ name: 'v1.safetensors' }),
    }))
    expect(watchDownload).toHaveBeenCalledTimes(1)
    expect(watchDownload).toHaveBeenCalledWith(expect.objectContaining({
      versionId: 202,
      file: expect.objectContaining({ name: 'locked-v2.safetensors' }),
    }))
    expect(downloadActionNotice.value).toBe('Queued 1 download and watching 1 version for Mixed availability checkpoint.')
  })

  it('watches early access versions instead of rejecting them as unavailable downloads', async () => {
    const queueDownload = vi.fn()
    const watchDownload = vi.fn().mockResolvedValue({
      ok: true,
      item: {
        state: 'watching',
        fileName: 'locked-v1.safetensors',
      },
    })
    const downloadActionNotice = ref('')
    const downloadActionError = ref('')
    const { createAssetDownloadActions } = await import('../../src/views/assets/assetDownloadActions')
    const actions = createAssetDownloadActions({
      downloadByVersionId: computed(() => new Map()),
      downloadActionError,
      downloadActionNotice,
      openDownloadMenuKey: ref(''),
      queuingDownloadKey: ref(''),
      queueDownload,
      watchDownload,
      watchedByVersionId: computed(() => new Map()),
    } as never)
    const lockedVersion = {
      ...modelVersion(201, 'locked-v1.safetensors'),
      availability: 'EarlyAccess',
      covered: false,
      files: [{
        id: 301,
        name: 'locked-v1.safetensors',
        type: 'Model',
        primary: true,
      }],
    }

    expect(actions.versionDownloadButtonLabel(lockedVersion)).toBe('Watch')
    expect(actions.downloadButtonLabel({
      id: 101,
      name: 'Locked LoRA',
      type: 'LORA',
      nsfw: false,
      modelVersions: [lockedVersion],
    })).toBe('Watch')

    await actions.queueAssetDownload({
      id: 101,
      name: 'Locked LoRA',
      type: 'LORA',
      nsfw: false,
      modelVersions: [lockedVersion],
    }, lockedVersion)

    expect(queueDownload).not.toHaveBeenCalled()
    expect(watchDownload).toHaveBeenCalledWith(expect.objectContaining({
      modelId: 101,
      versionId: 201,
      file: expect.objectContaining({
        id: 301,
        name: 'locked-v1.safetensors',
      }),
    }))
    expect(downloadActionError.value).toBe('')
    expect(downloadActionNotice.value).toBe('Watching locked-v1.safetensors.')
  })

  it('shows watched early access state on single-version model cards', async () => {
    const { createAssetDownloadActions } = await import('../../src/views/assets/assetDownloadActions')
    const lockedVersion = {
      ...modelVersion(201, 'locked-v1.safetensors'),
      availability: 'EarlyAccess',
      covered: false,
      files: [{
        id: 301,
        name: 'locked-v1.safetensors',
        type: 'Model',
        primary: true,
      }],
    }
    const actions = createAssetDownloadActions({
      downloadByVersionId: computed(() => new Map()),
      downloadActionError: ref(''),
      downloadActionNotice: ref(''),
      openDownloadMenuKey: ref(''),
      queuingDownloadKey: ref(''),
      queueDownload: vi.fn(),
      watchDownload: vi.fn(),
      watchedByVersionId: computed(() => new Map([
        [201, [{
          id: '101__201__301',
          state: 'watching',
          versionId: 201,
          fileName: 'locked-v1.safetensors',
        }]],
      ])),
    } as never)

    expect(actions.downloadButtonLabel({
      id: 101,
      name: 'Locked LoRA',
      type: 'LORA',
      nsfw: false,
      modelVersions: [lockedVersion],
    })).toBe('Watching')
  })

  it('requires confirmation before redownloading a completed version from asset cards', async () => {
    const queueDownload = vi.fn()
    const confirm = vi.fn().mockResolvedValue(false)
    const { createAssetDownloadActions } = await import('../../src/views/assets/assetDownloadActions')
    const actions = createAssetDownloadActions({
      downloadByVersionId: computed(() => new Map([
        [201, [{ id: 'complete-version', state: 'complete', versionId: 201, fileName: 'v1.safetensors' }]],
      ])),
      downloadActionError: ref(''),
      downloadActionNotice: ref(''),
      openDownloadMenuKey: ref(''),
      queuingDownloadKey: ref(''),
      queueDownload,
      confirm,
    } as never)

    await actions.queueAssetDownload({
      id: 101,
      name: 'Single version LoRA',
      type: 'LORA',
      nsfw: false,
      modelVersions: [modelVersion(201, 'v1.safetensors')],
    }, modelVersion(201, 'v1.safetensors'))

    expect(queueDownload).not.toHaveBeenCalled()
    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Re-download file?',
      description: 'Re-download v1.safetensors? This will replace the existing downloaded file.',
      confirmLabel: 'Re-download',
      destructive: true,
    }))
  })

  it('downloads single-version models and opens the versions menu for multi-version models', async () => {
    const queueDownload = vi.fn().mockResolvedValue({ ok: true })
    const openDownloadMenuKey = ref('')
    const { createAssetDownloadActions } = await import('../../src/views/assets/assetDownloadActions')
    const actions = createAssetDownloadActions({
      downloadByVersionId: computed(() => new Map()),
      downloadActionError: ref(''),
      downloadActionNotice: ref(''),
      openDownloadMenuKey,
      queuingDownloadKey: ref(''),
      queueDownload,
      confirm: vi.fn(),
    } as never)

    await actions.handleDownloadClick({
      id: 101,
      name: 'Single version LoRA',
      type: 'LORA',
      nsfw: false,
      modelVersions: [modelVersion(201, 'v1.safetensors')],
    })

    expect(queueDownload).toHaveBeenCalledWith(expect.objectContaining({
      modelId: 101,
      versionId: 201,
      file: expect.objectContaining({ name: 'v1.safetensors' }),
    }))
    expect(openDownloadMenuKey.value).toBe('')

    await actions.handleDownloadClick({
      id: 102,
      name: 'Multi version LoRA',
      type: 'LORA',
      nsfw: false,
      modelVersions: [
        modelVersion(202, 'v2.safetensors'),
        modelVersion(203, 'v3.safetensors'),
      ],
    })

    expect(queueDownload).toHaveBeenCalledTimes(1)
    expect(openDownloadMenuKey.value).toBe('102')
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
