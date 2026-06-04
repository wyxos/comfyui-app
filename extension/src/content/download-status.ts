const CTA_TEXT = 'Queue in Companion'
const CTA_QUEUED_TEXT = 'Queued in Companion'
const CTA_DOWNLOADED_TEXT = 'Downloaded in Companion'
const STATUS_MESSAGE_TYPE = 'COMFY_COMPANION_CIVITAI_DOWNLOAD_STATUS'

export type CivitaiStatusReference = {
  modelId: number
  modelVersionId: number | null
}

export type CompanionDownloadStatusItem = {
  id: string
  state: string
  fileName?: string
  bytesDownloaded?: number
  totalBytes?: number | null
  progressPercent?: number | null
  error?: string | null
}

type RuntimeStatusResponse = {
  ok?: boolean
  item?: CompanionDownloadStatusItem | null
}

declare const chrome: {
  runtime?: {
    lastError?: { message?: string } | null
    sendMessage?: (message: unknown, callback?: (response: unknown) => void) => void
  }
} | undefined

const statusTimers = new WeakMap<HTMLButtonElement, number>()

export function setButtonState(button: HTMLButtonElement, label: string, disabled: boolean, title = ''): void {
  if (button.textContent !== label) {
    button.textContent = label
  }

  if (button.disabled !== disabled) {
    button.disabled = disabled
  }

  if (button.title !== title) {
    button.title = title
  }

  button.style.opacity = disabled ? '0.72' : '1'
  button.style.cursor = disabled ? 'default' : 'pointer'
}

export function clearStatusPolling(button: HTMLButtonElement): void {
  const timer = statusTimers.get(button)
  if (typeof timer === 'number') {
    window.clearInterval(timer)
    statusTimers.delete(button)
  }
}

function formatPercent(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return ''
  }

  return `${Math.max(0, Math.min(100, Math.round(value)))}%`
}

function titleForDownloadStatus(status: CompanionDownloadStatusItem): string {
  return [
    status.fileName,
    status.error,
  ].filter((value) => typeof value === 'string' && value.trim() !== '').join(' - ')
}

export function applyDownloadStatus(button: HTMLButtonElement, status: CompanionDownloadStatusItem | null): boolean {
  if (status === null || status.state === 'deleted') {
    setButtonState(button, CTA_TEXT, false)
    return false
  }

  if (status.state === 'complete') {
    setButtonState(button, CTA_DOWNLOADED_TEXT, true, titleForDownloadStatus(status))
    return false
  }

  if (status.state === 'downloading') {
    const percent = formatPercent(status.progressPercent)
    setButtonState(button, percent ? `Downloading ${percent}` : 'Downloading in Companion', true, titleForDownloadStatus(status))
    button.style.cursor = 'progress'
    return true
  }

  if (status.state === 'queued') {
    setButtonState(button, CTA_QUEUED_TEXT, true, titleForDownloadStatus(status))
    return true
  }

  if (status.state === 'paused') {
    setButtonState(button, 'Paused in Companion', true, titleForDownloadStatus(status))
    return true
  }

  if (status.state === 'error' || status.state === 'cancelled') {
    setButtonState(button, 'Retry in Companion', false, titleForDownloadStatus(status))
    return false
  }

  setButtonState(button, CTA_TEXT, false)
  return false
}

function requestDownloadStatus(reference: CivitaiStatusReference, downloadId = ''): Promise<RuntimeStatusResponse | null> {
  if (typeof chrome === 'undefined' || !chrome.runtime || typeof chrome.runtime.sendMessage !== 'function') {
    return Promise.resolve(null)
  }

  return new Promise((resolve) => {
    try {
      chrome.runtime?.sendMessage?.({
        type: STATUS_MESSAGE_TYPE,
        ...(downloadId ? { downloadId } : {
          modelId: reference.modelId,
          modelVersionId: reference.modelVersionId,
        }),
      }, (response: unknown) => {
        if (chrome.runtime?.lastError) {
          resolve(null)
          return
        }

        resolve(response && typeof response === 'object' ? response as RuntimeStatusResponse : null)
      })
    } catch {
      resolve(null)
    }
  })
}

export function refreshButtonStatus(button: HTMLButtonElement, reference: CivitaiStatusReference, downloadId = ''): void {
  void requestDownloadStatus(reference, downloadId)
    .then((response) => {
      if (response?.ok !== true) {
        return
      }

      const shouldContinue = applyDownloadStatus(button, response.item ?? null)
      if (!shouldContinue) {
        clearStatusPolling(button)
      }
    })
    .catch(() => {})
}

export function startStatusPolling(button: HTMLButtonElement, reference: CivitaiStatusReference, downloadId = ''): void {
  clearStatusPolling(button)
  refreshButtonStatus(button, reference, downloadId)
  statusTimers.set(button, window.setInterval(() => {
    refreshButtonStatus(button, reference, downloadId)
  }, 2500))
}
