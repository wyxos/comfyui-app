import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { appRoot, host, port, refreshConfigFromEnv } from '../server/config.mjs'
import { startCompanionServer } from '../server/app.mjs'

refreshConfigFromEnv()

const devHost = process.env.COMFY_COMPANION_DEV_HOST ?? host
const devOriginHost = devHost === '0.0.0.0' ? '127.0.0.1' : devHost
const frontendPort = Number.parseInt(
  process.env.COMFY_COMPANION_DEV_FRONTEND_PORT ?? String(port === 3210 ? 3211 : port + 1),
  10,
)
const viteCliPath = join(appRoot, 'node_modules', 'vite', 'bin', 'vite.js')

if (!existsSync(viteCliPath)) {
  console.error('Vite was not found. Run npm install before starting dev mode.')
  process.exit(1)
}

const viteProcess = spawn(
  process.execPath,
  [viteCliPath, '--host', devHost, '--port', String(frontendPort), '--strictPort'],
  {
    cwd: appRoot,
    env: process.env,
    stdio: 'inherit',
  },
)
const server = startCompanionServer({
  devAssetOrigin: new URL(`http://${devOriginHost}:${frontendPort}/`),
  connectWebSocket: process.env.COMFY_COMPANION_CONNECT_WEBSOCKET !== '0',
})
let shuttingDown = false

function shutdown(signal) {
  if (shuttingDown) {
    return
  }

  shuttingDown = true
  viteProcess.kill(signal)
  server.close(() => {
    process.exit(signal === 'SIGINT' ? 130 : 0)
  })
}

viteProcess.once('exit', (code, signal) => {
  if (shuttingDown) {
    return
  }

  shuttingDown = true
  server.close(() => {
    process.exit(code ?? (signal ? 1 : 0))
  })
})

server.once('error', (error) => {
  if (!shuttingDown) {
    shuttingDown = true
    viteProcess.kill()
  }

  console.error(error)
  process.exit(1)
})

process.once('SIGINT', () => shutdown('SIGINT'))
process.once('SIGTERM', () => shutdown('SIGTERM'))
