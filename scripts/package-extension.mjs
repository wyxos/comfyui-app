import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const extensionRoot = path.join(projectRoot, 'extension')
const distDirectory = path.join(extensionRoot, 'dist')
const manifestPath = path.join(extensionRoot, 'manifest.json')
const defaultTargetDirectory = path.join(os.homedir(), 'Downloads', 'comfyui-companion-extension')
const semverPattern = /^(\d+)\.(\d+)\.(\d+)$/

function parseArgs(argv) {
  const options = {
    bump: '',
    targetDirectory: '',
    version: '',
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--bump') {
      options.bump = argv[index + 1] ?? ''
      index += 1
      continue
    }

    if (arg.startsWith('--bump=')) {
      options.bump = arg.slice('--bump='.length)
      continue
    }

    if (arg === '--version') {
      options.version = argv[index + 1] ?? ''
      index += 1
      continue
    }

    if (arg.startsWith('--version=')) {
      options.version = arg.slice('--version='.length)
      continue
    }

    if (arg === '--target-dir' || arg === '--extract-dir') {
      options.targetDirectory = argv[index + 1] ?? ''
      index += 1
      continue
    }

    if (arg.startsWith('--target-dir=')) {
      options.targetDirectory = arg.slice('--target-dir='.length)
      continue
    }

    if (arg.startsWith('--extract-dir=')) {
      options.targetDirectory = arg.slice('--extract-dir='.length)
      continue
    }

    if (arg === '--help' || arg === '-h') {
      options.help = true
      continue
    }

    throw new Error(`Unknown option: ${arg}`)
  }

  return options
}

function printHelp() {
  console.log(`Usage: node scripts/package-extension.mjs [--bump <major|minor|patch|codex>] [--version <x.y.z>] [--target-dir <path>]

Copies extension/dist into a stable unpacked-extension directory for browser loading.

Target directory priority:
  1. --target-dir / --extract-dir
  2. COMFYUI_COMPANION_EXTENSION_DIR
  3. COMPANION_EXTENSION_LOCAL_DIR
  4. ${defaultTargetDirectory}`)
}

function parseSemver(version) {
  const match = semverPattern.exec(version)
  return match ? match.slice(1).map((part) => Number.parseInt(part, 10)) : null
}

function incrementSemver(currentVersion, bumpType) {
  const parts = parseSemver(currentVersion)
  if (!parts) return null

  const [major, minor, patch] = parts
  if (bumpType === 'major') return `${major + 1}.0.0`
  if (bumpType === 'minor') return `${major}.${minor + 1}.0`
  if (bumpType === 'patch') return `${major}.${minor}.${patch + 1}`
  return null
}

function readManifest() {
  if (!fs.existsSync(manifestPath) || !fs.statSync(manifestPath).isFile()) {
    throw new Error(`Extension manifest not found: ${manifestPath}`)
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  if (typeof manifest.version !== 'string' || !parseSemver(manifest.version)) {
    throw new Error('Extension manifest is missing a valid x.y.z version.')
  }

  return manifest
}

function suggestCodexBump(currentVersion) {
  const result = spawnSync(process.execPath, [
    path.join(projectRoot, 'scripts', 'suggest-extension-version-bump.mjs'),
    '--current-version',
    currentVersion,
    '--package-name',
    'ComfyUI Companion Extension',
    '--path-prefix',
    'extension',
    '--root-dir',
    projectRoot,
  ], {
    cwd: projectRoot,
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
  })

  if (result.stderr) {
    process.stderr.write(result.stderr)
  }

  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`Failed to determine extension version bump with Codex helper.`)
  }

  const bumpType = String(result.stdout ?? '').trim().split(/\s+/)[0]
  if (!['major', 'minor', 'patch'].includes(bumpType)) {
    throw new Error(`Codex helper returned invalid bump type: ${bumpType || '<empty>'}`)
  }

  return bumpType
}

function updateManifestVersion(options) {
  const manifest = readManifest()
  const currentVersion = manifest.version
  let nextVersion = currentVersion
  let bumpType = options.bump.trim().toLowerCase()

  if (options.version.trim()) {
    nextVersion = options.version.trim()
    if (!parseSemver(nextVersion)) {
      throw new Error(`Invalid --version value '${nextVersion}'. Expected x.y.z.`)
    }
  } else if (bumpType) {
    if (bumpType === 'auto') bumpType = 'codex'
    if (bumpType === 'codex') {
      bumpType = suggestCodexBump(currentVersion)
      console.log(`Codex selected ${bumpType} extension version bump.`)
    }

    nextVersion = incrementSemver(currentVersion, bumpType)
    if (!nextVersion) {
      throw new Error(`Invalid --bump value '${options.bump}'. Use major, minor, patch, or codex.`)
    }
  }

  if (nextVersion !== currentVersion) {
    manifest.version = nextVersion
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
    console.log(`Updated extension manifest version: ${currentVersion} -> ${nextVersion}`)
  }

  fs.copyFileSync(manifestPath, path.join(distDirectory, 'manifest.json'))
}

function resolveTargetDirectory(value) {
  const requested = value || process.env.COMFYUI_COMPANION_EXTENSION_DIR || process.env.COMPANION_EXTENSION_LOCAL_DIR
  return path.resolve(requested && requested.trim() ? requested : defaultTargetDirectory)
}

function assertBuildOutput() {
  const requiredFiles = ['manifest.json', 'background.js', 'content.js']

  if (!fs.existsSync(distDirectory) || !fs.statSync(distDirectory).isDirectory()) {
    throw new Error(`Extension dist directory not found: ${distDirectory}`)
  }

  for (const fileName of requiredFiles) {
    const filePath = path.join(distDirectory, fileName)
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      throw new Error(`Extension build output is missing ${fileName}: ${filePath}`)
    }
  }

  const manifest = JSON.parse(fs.readFileSync(path.join(distDirectory, 'manifest.json'), 'utf8'))
  const contentScripts = Array.isArray(manifest.content_scripts) ? manifest.content_scripts : []
  const hasContentScript = contentScripts.some((entry) => Array.isArray(entry?.js) && entry.js.includes('content.js'))

  if (manifest.manifest_version !== 3) {
    throw new Error('Extension manifest must be Manifest V3.')
  }

  if (!manifest.background || manifest.background.service_worker !== 'background.js') {
    throw new Error('Extension manifest background service worker must point at background.js.')
  }

  if (!hasContentScript) {
    throw new Error('Extension manifest content_scripts must include content.js.')
  }
}

function assertSafeTargetDirectory(targetDirectory) {
  const protectedPaths = [
    path.parse(targetDirectory).root,
    os.homedir(),
    projectRoot,
    extensionRoot,
    distDirectory,
  ].map((entry) => path.resolve(entry).toLowerCase())
  const normalizedTarget = path.resolve(targetDirectory).toLowerCase()

  if (protectedPaths.includes(normalizedTarget)) {
    throw new Error(`Refusing to clear protected directory: ${targetDirectory}`)
  }

  if (normalizedTarget.startsWith(`${distDirectory.toLowerCase()}${path.sep}`)) {
    throw new Error(`Refusing to package into the extension build output: ${targetDirectory}`)
  }
}

function clearDirectory(directory) {
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true })
    return
  }

  for (const entry of fs.readdirSync(directory)) {
    fs.rmSync(path.join(directory, entry), { force: true, recursive: true })
  }
}

function copyDirectory(source, destination) {
  fs.mkdirSync(destination, { recursive: true })

  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const sourcePath = path.join(source, entry.name)
    const destinationPath = path.join(destination, entry.name)

    if (entry.isDirectory()) {
      copyDirectory(sourcePath, destinationPath)
      continue
    }

    if (entry.isFile()) {
      fs.copyFileSync(sourcePath, destinationPath)
    }
  }
}

function countFiles(directory) {
  let total = 0
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name)
    total += entry.isDirectory() ? countFiles(entryPath) : 1
  }
  return total
}

try {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    printHelp()
    process.exit(0)
  }

  const targetDirectory = resolveTargetDirectory(options.targetDirectory)

  assertBuildOutput()
  updateManifestVersion(options)
  assertSafeTargetDirectory(targetDirectory)
  clearDirectory(targetDirectory)
  copyDirectory(distDirectory, targetDirectory)

  console.log(`Packaged unpacked extension to: ${targetDirectory}`)
  console.log(`Copied ${countFiles(targetDirectory)} files from: ${distDirectory}`)
  console.log('Load or reload that directory from the browser extensions page.')
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
