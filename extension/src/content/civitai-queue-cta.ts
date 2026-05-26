const URN_PREFIX = 'civitai:'
const CTA_TEXT = 'Queue in Companion'
const CTA_PENDING_TEXT = 'Queueing...'
const CTA_SUCCESS_TEXT = 'Queued'
const CTA_UNAVAILABLE_TEXT = 'Unavailable'
const CTA_FAILURE_TEXT = 'Failed'
const CTA_SELECTOR = '[data-comfy-companion-civitai-queue-cta]'
const QUEUE_MESSAGE_TYPE = 'COMFY_COMPANION_QUEUE_CIVITAI_MODEL'
const CIVITAI_DOMAINS = ['civitai.com', 'civitai.red'] as const
const noop = () => {}

type CivitaiModelReference = {
  modelId: number
  modelVersionId: number | null
  key: string
}

type CivitaiActionTarget = {
  referenceRoot: HTMLElement
  actionHost: HTMLElement
}

type RuntimeQueueResponse = {
  ok?: boolean
  error?: string
  message?: string
}

declare const chrome: {
  runtime?: {
    lastError?: { message?: string } | null
    sendMessage?: (message: unknown, callback?: (response: unknown) => void) => void
  }
} | undefined

let isInstalled = false

function normalizeHostname(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/^\.+/, '').replace(/\.+$/, '')
}

export function isCivitaiHostname(hostname: string = window.location.hostname): boolean {
  const normalized = normalizeHostname(hostname)
  return CIVITAI_DOMAINS.some((domain) => normalized === domain || normalized.endsWith(`.${domain}`))
}

function isCivitaiNsfwHostname(hostname: string): boolean {
  const normalized = normalizeHostname(hostname)
  return normalized === 'civitai.red' || normalized.endsWith('.civitai.red')
}

export function parsePositiveInteger(value: string | null | undefined): number | null {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  if (trimmed === '' || !/^\d+$/.test(trimmed)) {
    return null
  }

  const parsed = Number(trimmed)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

export function parseModelReferenceFromUrl(href: string = window.location.href): CivitaiModelReference | null {
  let url: URL

  try {
    url = new URL(href)
  } catch {
    return null
  }

  if (!isCivitaiHostname(url.hostname)) {
    return null
  }

  const segments = url.pathname.split('/').filter(Boolean)
  if (segments[0] !== 'models') {
    return null
  }

  const modelId = parsePositiveInteger(segments[1])
  if (modelId === null) {
    return null
  }

  const modelVersionId = parsePositiveInteger(url.searchParams.get('modelVersionId'))
  return {
    modelId,
    modelVersionId,
    key: modelVersionId === null ? `${modelId}` : `${modelId}@${modelVersionId}`,
  }
}

export function resolveModelReferenceFromTexts(values: string[]): CivitaiModelReference | null {
  for (let index = 0; index < values.length; index += 1) {
    if (values[index]?.trim().toLowerCase() !== URN_PREFIX) {
      continue
    }

    const modelId = parsePositiveInteger(values[index + 1])
    if (modelId === null) {
      continue
    }

    const modelVersionId = values[index + 2]?.trim() === '@'
      ? parsePositiveInteger(values[index + 3])
      : null

    return {
      modelId,
      modelVersionId,
      key: modelVersionId === null ? `${modelId}` : `${modelId}@${modelVersionId}`,
    }
  }

  return null
}

function resolveModelReference(actionHost: ParentNode): CivitaiModelReference | null {
  const values = Array.from(actionHost.querySelectorAll('code'))
    .map((code) => code.textContent?.trim() ?? '')
    .filter((value) => value !== '')

  return resolveModelReferenceFromTexts(values)
}

function resolveCurrentModelReference(referenceRoot: ParentNode): CivitaiModelReference | null {
  const domReference = resolveModelReference(referenceRoot)
  const urlReference = parseModelReferenceFromUrl()

  if (
    domReference !== null
    && urlReference !== null
    && domReference.modelId === urlReference.modelId
    && urlReference.modelVersionId !== null
  ) {
    return urlReference
  }

  return domReference ?? urlReference
}

function resolveActionTarget(prefixCode: HTMLElement): CivitaiActionTarget | null {
  let referenceRoot: HTMLElement | null = null
  let current: HTMLElement | null = prefixCode.parentElement
  let depth = 0

  while (current instanceof HTMLElement && depth < 8) {
    if (resolveModelReference(current) !== null) {
      referenceRoot = current
      break
    }

    if (current.tagName === 'TD' || current.tagName === 'TR' || current.tagName === 'TABLE') {
      break
    }

    current = current.parentElement
    depth += 1
  }

  if (!(referenceRoot instanceof HTMLElement)) {
    return null
  }

  const parent = referenceRoot.parentElement
  return {
    referenceRoot,
    actionHost: parent instanceof HTMLElement ? parent : referenceRoot,
  }
}

function setButtonState(button: HTMLButtonElement, label: string, disabled: boolean, title = ''): void {
  button.textContent = label
  button.disabled = disabled
  button.title = title
  button.style.opacity = disabled ? '0.72' : '1'
  button.style.cursor = disabled ? 'default' : 'pointer'
}

function requestQueueCivitaiModel(reference: CivitaiModelReference): Promise<RuntimeQueueResponse | null> {
  if (typeof chrome === 'undefined' || !chrome.runtime || typeof chrome.runtime.sendMessage !== 'function') {
    return Promise.resolve(null)
  }

  return new Promise((resolve) => {
    try {
      chrome.runtime?.sendMessage?.({
        type: QUEUE_MESSAGE_TYPE,
        modelId: reference.modelId,
        modelVersionId: reference.modelVersionId,
        sourceHostname: window.location.hostname,
        sourceUrl: window.location.href,
        ...(isCivitaiNsfwHostname(window.location.hostname) ? { nsfw: true } : {}),
      }, (response: unknown) => {
        if (chrome.runtime?.lastError) {
          resolve(null)
          return
        }

        resolve(response && typeof response === 'object' ? response as RuntimeQueueResponse : null)
      })
    } catch {
      resolve(null)
    }
  })
}

function createCtaButton(target: CivitaiActionTarget, reference: CivitaiModelReference): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.dataset.comfyCompanionCivitaiQueueCta = reference.key
  button.style.cssText = [
    'appearance:none',
    'display:inline-flex',
    'align-items:center',
    'justify-content:center',
    'min-height:24px',
    'padding:4px 10px',
    'border-radius:999px',
    'border:1px solid rgba(20, 184, 166, 0.32)',
    'background:rgba(20, 184, 166, 0.1)',
    'color:#0f766e',
    'font-size:12px',
    'font-weight:700',
    'line-height:1.2',
    'white-space:nowrap',
  ].join(';')
  setButtonState(button, CTA_TEXT, false)

  button.addEventListener('click', () => {
    const currentReference = resolveCurrentModelReference(
      target.referenceRoot.isConnected ? target.referenceRoot : button.parentElement ?? document,
    ) ?? reference

    setButtonState(button, CTA_PENDING_TEXT, true)

    void requestQueueCivitaiModel(currentReference)
      .then((response) => {
        if (response?.ok === true) {
          setButtonState(button, CTA_SUCCESS_TEXT, true)
          return
        }

        if (response?.error === 'version-unavailable' || response?.error === 'file-not-found') {
          setButtonState(button, CTA_UNAVAILABLE_TEXT, true, response.message ?? '')
          return
        }

        setButtonState(button, CTA_FAILURE_TEXT, true, response?.message ?? 'Could not queue this Civitai model.')
      })
      .catch(() => {
        setButtonState(button, CTA_FAILURE_TEXT, true, 'Could not queue this Civitai model.')
      })
      .finally(() => {
        window.setTimeout(() => {
          setButtonState(button, CTA_TEXT, false)
        }, 1800)
      })
  })

  return button
}

function applyBrowseCta(target: CivitaiActionTarget): void {
  const reference = resolveCurrentModelReference(target.referenceRoot)
  if (reference === null) {
    return
  }

  const existingButton = target.actionHost.querySelector(CTA_SELECTOR)
  if (existingButton instanceof HTMLButtonElement) {
    if (existingButton.dataset.comfyCompanionCivitaiQueueCta === reference.key) {
      return
    }

    existingButton.remove()
  }

  const button = createCtaButton(target, reference)
  const insertBefore = target.referenceRoot.nextElementSibling
  if (insertBefore instanceof Element) {
    target.actionHost.insertBefore(button, insertBefore)
    return
  }

  target.actionHost.appendChild(button)
}

function syncBrowseCtas(root: ParentNode): void {
  const seen = new Set<HTMLElement>()
  const directCodes = root instanceof HTMLElement && root.tagName === 'CODE' ? [root] : []

  for (const code of [...directCodes, ...Array.from(root.querySelectorAll('code'))]) {
    if (!(code instanceof HTMLElement) || code.textContent?.trim().toLowerCase() !== URN_PREFIX) {
      continue
    }

    const target = resolveActionTarget(code)
    if (target === null || seen.has(target.actionHost)) {
      continue
    }

    seen.add(target.actionHost)
    applyBrowseCta(target)
  }
}

function syncMutationTarget(mutation: MutationRecord): void {
  if (mutation.target instanceof Element) {
    syncBrowseCtas(mutation.target)
    return
  }

  if (mutation.target.parentElement instanceof HTMLElement) {
    syncBrowseCtas(mutation.target.parentElement)
  }
}

export function installCivitaiQueueCtas(): () => void {
  if (isInstalled || !isCivitaiHostname()) {
    return noop
  }

  isInstalled = true
  syncBrowseCtas(document)

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'characterData') {
        syncMutationTarget(mutation)
        continue
      }

      if (mutation.type !== 'childList') {
        continue
      }

      syncMutationTarget(mutation)

      for (const addedNode of mutation.addedNodes) {
        if (addedNode instanceof Element) {
          syncBrowseCtas(addedNode)
        }
      }
    }
  })

  observer.observe(document.documentElement, {
    childList: true,
    characterData: true,
    subtree: true,
  })

  return () => {
    observer.disconnect()
    isInstalled = false
  }
}
