import fs from 'node:fs'
import path from 'node:path'
import { defineConfig, type Plugin } from 'vite'

const extensionRoot = path.resolve(__dirname)
const manifestPath = path.resolve(extensionRoot, 'manifest.json')

function copyExtensionManifest(): Plugin {
  return {
    name: 'copy-extension-manifest',
    closeBundle() {
      fs.copyFileSync(manifestPath, path.resolve(extensionRoot, 'dist', 'manifest.json'))
    },
  }
}

export default defineConfig({
  root: extensionRoot,
  publicDir: false,
  plugins: [copyExtensionManifest()],
  build: {
    outDir: path.resolve(extensionRoot, 'dist'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        background: path.resolve(extensionRoot, 'src/background.ts'),
        content: path.resolve(extensionRoot, 'src/content.ts'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
      },
    },
  },
})
