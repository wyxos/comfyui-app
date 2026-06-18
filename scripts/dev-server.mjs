import { createServer as createViteServer } from 'vite'

import { appRoot, host, port, refreshConfigFromEnv } from '../server/config.mjs'
import { startCompanionServer } from '../server/app.mjs'

refreshConfigFromEnv()

let viteServer = null
let shuttingDown = false

function serveViteAssets(request, response, next) {
  if (!viteServer) {
    response.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' })
    response.end('Frontend dev middleware is starting.')
    return
  }

  viteServer.middlewares(request, response, next)
}

const server = startCompanionServer({
  destroyUnknownUpgrades: false,
  devAssetMiddleware: serveViteAssets,
  connectWebSocket: process.env.COMFY_COMPANION_CONNECT_WEBSOCKET !== '0',
})

server.once('error', async (error) => {
  if (!shuttingDown) {
    shuttingDown = true
    await closeViteServer()
  }

  console.error(error)
  process.exit(1)
})

try {
  viteServer = await createViteServer({
    root: appRoot,
    appType: 'spa',
    server: {
      middlewareMode: { server },
      hmr: { server },
    },
  })
  console.log(`Comfy Companion dev assets mounted on http://${host}:${port}`)
} catch (error) {
  console.error(error)
  server.close(() => process.exit(1))
}

async function closeViteServer() {
  if (!viteServer) {
    return
  }

  const serverToClose = viteServer
  viteServer = null
  await serverToClose.close()
}

function closeCompanionServer() {
  if (!server.listening) {
    return Promise.resolve()
  }

  return new Promise((resolve) => {
    server.close(() => resolve())
  })
}

async function shutdown(signal) {
  if (shuttingDown) {
    return
  }

  shuttingDown = true
  await closeViteServer()
  await closeCompanionServer()
  process.exit(signal === 'SIGINT' ? 130 : 0)
}

process.once('SIGINT', () => {
  void shutdown('SIGINT')
})
process.once('SIGTERM', () => {
  void shutdown('SIGTERM')
})
