export async function apiJson<T>(
  input: string,
  init?: (RequestInit & { timeoutMs?: number }) | undefined,
): Promise<T> {
  const { timeoutMs, signal: externalSignal, ...requestInit } = init ?? {}
  const headers = new Headers(requestInit.headers ?? {})
  if (!(init?.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const controller = new AbortController()
  let didTimeout = false
  let didAbortByCaller = false
  const handleExternalAbort = () => {
    didAbortByCaller = true
    controller.abort()
  }

  if (externalSignal) {
    if (externalSignal.aborted) {
      handleExternalAbort()
    } else {
      externalSignal.addEventListener('abort', handleExternalAbort, { once: true })
    }
  }

  const timeoutId =
    typeof timeoutMs === 'number' && timeoutMs > 0
      ? window.setTimeout(() => {
          didTimeout = true
          controller.abort()
        }, timeoutMs)
      : null

  try {
    const response = await fetch(input, {
      ...requestInit,
      headers,
      signal: controller.signal,
    })

    const payload = (await response.json()) as T & { ok?: boolean; message?: string }
    if (!response.ok || payload?.ok === false) {
      throw new Error(payload?.message ?? 'Request failed.')
    }

    return payload
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      if (didTimeout) {
        throw new Error('Request timed out.', { cause: error })
      }

      if (didAbortByCaller) {
        throw new Error('Request cancelled.', { cause: error })
      }
    }

    throw error
  } finally {
    externalSignal?.removeEventListener('abort', handleExternalAbort)
    if (timeoutId !== null) {
      window.clearTimeout(timeoutId)
    }
  }
}
