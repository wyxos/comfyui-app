import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer, Socket } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

async function reservePort(port: number) {
  const server = createServer()
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', resolve)
  })

  return server
}

async function findFreePortPair() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const port = 40_000 + Math.floor(Math.random() * 10_000)
    const servers = []

    try {
      servers.push(await reservePort(port))
      servers.push(await reservePort(port + 1))
      return port
    } catch {
      // Try another pair.
    } finally {
      await Promise.all(servers.map((server) => new Promise<void>((resolve) => server.close(() => resolve()))))
    }
  }

  throw new Error('Could not find a free port pair for dev server test.')
}

async function isPortListening(port: number) {
  return new Promise<boolean>((resolve) => {
    const socket = new Socket()
    let settled = false

    function settle(value: boolean) {
      if (settled) {
        return
      }

      settled = true
      socket.destroy()
      resolve(value)
    }

    socket.once('connect', () => settle(true))
    socket.once('error', () => settle(false))
    socket.setTimeout(500, () => settle(false))
    socket.connect(port, '127.0.0.1')
  })
}

async function waitForApp(port: number, child: ChildProcessWithoutNullStreams) {
  const deadline = Date.now() + 15_000
  let lastError = ''

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Dev server exited before it was ready: ${child.exitCode}`)
    }

    try {
      const health = await fetch(`http://127.0.0.1:${port}/health`)
      const app = await fetch(`http://127.0.0.1:${port}/`)
      const body = await app.text()

      if (health.ok && app.ok && body.includes('/src/main.ts')) {
        return
      }

      lastError = `health=${health.status} app=${app.status}`
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 250)
    })
  }

  throw new Error(`Dev server did not become ready on port ${port}: ${lastError}`)
}

async function stopProcessTree(child: ChildProcessWithoutNullStreams) {
  if (child.exitCode !== null) {
    return
  }

  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
    return
  }

  child.kill('SIGTERM')
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      child.kill('SIGKILL')
      resolve()
    }, 2_000)

    child.once('exit', () => {
      clearTimeout(timeout)
      resolve()
    })
  })
}

describe('dev server', () => {
  it('serves the dev app from the companion port without opening a fallback frontend port', async () => {
    const companionPort = await findFreePortPair()
    const configDir = await mkdtemp(join(tmpdir(), 'comfy-companion-dev-server-'))
    const child = spawn(process.execPath, ['scripts/dev-server.mjs'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        COMFY_COMPANION_CONFIG_DIR: configDir,
        COMFY_COMPANION_CONNECT_WEBSOCKET: '0',
        COMFY_COMPANION_HOST: '127.0.0.1',
        COMFY_COMPANION_PORT: String(companionPort),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    try {
      await waitForApp(companionPort, child)

      expect(await isPortListening(companionPort + 1)).toBe(false)
    } finally {
      await stopProcessTree(child)
      await rm(configDir, { recursive: true, force: true })
    }
  }, 30_000)
})
