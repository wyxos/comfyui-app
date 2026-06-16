import { appendFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { inspect } from 'node:util'

import { configDir } from './config.mjs'

const consoleMethods = ['debug', 'error', 'info', 'log', 'warn']
const secretKeyPattern = /(api[-_ ]?key|authorization|bearer|cookie|password|secret|token)/i
const maxSerializedLength = 4000

let consoleLoggerInstalled = false
let processErrorLoggerInstalled = false
const originalConsoleMethods = new Map()

export function serverLogPath() {
  return process.env.COMFY_COMPANION_LOG_PATH?.trim() || join(configDir, 'server.log')
}

function truncate(value) {
  return value.length > maxSerializedLength ? `${value.slice(0, maxSerializedLength)}... [truncated]` : value
}

function sanitizeValue(value, depth = 0) {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
      code: value.code,
      statusCode: value.statusCode,
    }
  }

  if (value === null || value === undefined || typeof value !== 'object') {
    return value
  }

  if (depth >= 5) {
    return '[max-depth]'
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, depth + 1))
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      secretKeyPattern.test(key) ? '[redacted]' : sanitizeValue(entry, depth + 1),
    ]),
  )
}

function serializeConsoleArg(value) {
  if (typeof value === 'string') {
    return value
  }

  if (value instanceof Error) {
    return value.stack || value.message
  }

  return inspect(sanitizeValue(value), {
    breakLength: Infinity,
    depth: 5,
  })
}

export function writeServerLog(entry) {
  try {
    const logPath = serverLogPath()
    mkdirSync(dirname(logPath), { recursive: true })
    appendFileSync(
      logPath,
      `${JSON.stringify({
        timestamp: new Date().toISOString(),
        ...entry,
      })}\n`,
      'utf8',
    )
  } catch {
    // Logging must never break the server response path.
  }
}

export function logApiError({ statusCode, code, message, details = null }) {
  writeServerLog({
    level: 'error',
    type: 'api-error',
    statusCode,
    code,
    message,
    details: sanitizeValue(details),
  })
}

export function logServerError(type, error) {
  writeServerLog({
    level: 'error',
    type,
    message: error instanceof Error ? error.message : String(error),
    details: sanitizeValue(error),
  })
}

export function installServerConsoleLogger() {
  if (consoleLoggerInstalled) {
    return
  }

  consoleLoggerInstalled = true
  for (const method of consoleMethods) {
    const originalMethod = console[method].bind(console)
    originalConsoleMethods.set(method, originalMethod)
    console[method] = (...args) => {
      originalMethod(...args)
      writeServerLog({
        level: method === 'log' ? 'info' : method,
        type: 'server-log',
        message: truncate(args.map(serializeConsoleArg).join(' ')),
      })
    }
  }
}

export function installProcessErrorLogger() {
  if (processErrorLoggerInstalled) {
    return
  }

  processErrorLoggerInstalled = true
  process.on('uncaughtExceptionMonitor', (error) => {
    logServerError('uncaught-exception', error)
  })
  process.on('unhandledRejection', (reason) => {
    logServerError('unhandled-rejection', reason)
  })
}

export function uninstallServerConsoleLoggerForTests() {
  if (!consoleLoggerInstalled) {
    return
  }

  for (const [method, originalMethod] of originalConsoleMethods.entries()) {
    console[method] = originalMethod
  }
  originalConsoleMethods.clear()
  consoleLoggerInstalled = false
}
