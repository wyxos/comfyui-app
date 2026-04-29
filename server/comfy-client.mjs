import { comfyClientId, comfyUrl } from './config.mjs'
import { tryParseJson } from './shared.mjs'

export async function comfyFetchJson(pathname, init = {}) {
  const url = new URL(pathname, comfyUrl)
  const response = await fetch(url, init)
  const text = await response.text()
  const payload = text ? tryParseJson(text) ?? text : null

  if (!response.ok) {
    const error = new Error(`ComfyUI request failed: ${response.status}`)
    error.statusCode = response.status
    error.payload = payload
    throw error
  }

  return payload
}

export async function comfyFetchBinary(pathname) {
  const url = new URL(pathname, comfyUrl)
  const response = await fetch(url)

  if (!response.ok) {
    const error = new Error(`ComfyUI request failed: ${response.status}`)
    error.statusCode = response.status
    throw error
  }

  return response
}

export async function comfyPost(pathname, payload = {}) {
  const url = new URL(pathname, comfyUrl)
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify(payload),
  })

  const text = await response.text()
  const parsedPayload = text ? tryParseJson(text) ?? text : null

  if (!response.ok) {
    const error = new Error(`ComfyUI request failed: ${response.status}`)
    error.statusCode = response.status
    error.payload = parsedPayload
    throw error
  }

  return parsedPayload
}

export async function submitComfyPrompt(prompt) {
  const url = new URL('/prompt', comfyUrl)
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({
      client_id: comfyClientId,
      prompt,
    }),
  })

  const text = await response.text()
  const payload = text ? tryParseJson(text) ?? text : null

  return {
    ok: response.ok && typeof payload === 'object' && payload !== null && 'prompt_id' in payload,
    statusCode: response.status,
    payload,
  }
}
