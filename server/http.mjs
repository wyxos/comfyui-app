import { createReadStream, existsSync } from 'node:fs'
import { stat } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import { contentTypes, distDir, host, indexPath, port } from './config.mjs'

export function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  response.end(JSON.stringify(payload))
}

export function sendError(response, statusCode, code, message, details = null) {
  return sendJson(response, statusCode, {
    ok: false,
    error: code,
    message,
    details,
  })
}

export function streamFile(response, filePath) {
  const contentType = contentTypes.get(extname(filePath).toLowerCase()) ?? 'application/octet-stream'
  response.writeHead(200, { 'Content-Type': contentType })
  createReadStream(filePath).pipe(response)
}

export async function resolveAsset(requestPath) {
  const cleanPath = requestPath === '/' ? '/index.html' : requestPath
  const relativePath = cleanPath.replace(/^\/+/, '')
  const candidate = normalize(join(distDir, relativePath))

  if (!candidate.startsWith(distDir)) {
    return null
  }

  try {
    const fileStat = await stat(candidate)
    if (fileStat.isFile()) {
      return candidate
    }
  } catch {}

  return existsSync(indexPath) ? indexPath : null
}

export async function readJsonBody(request) {
  const chunks = []

  for await (const chunk of request) {
    chunks.push(chunk)
  }

  const rawBody = Buffer.concat(chunks).toString('utf8').trim()
  if (!rawBody) {
    return {}
  }

  return JSON.parse(rawBody)
}

export async function readFormDataBody(request) {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? `${host}:${port}`}`)
  const proxyRequest = new Request(url, {
    method: request.method,
    headers: request.headers,
    body: request,
    duplex: 'half',
  })

  return proxyRequest.formData()
}
