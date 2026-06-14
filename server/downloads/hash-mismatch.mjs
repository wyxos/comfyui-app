export const civitaiHashMismatchErrorCode = 'civitai-hash-mismatch'
const civitaiHashMismatchMessagePattern = /Downloaded file hash mismatch\.(?:\s+Civitai served file bytes that do not match its SHA-256 metadata\.)?\s+Expected\s+([A-F0-9]{64}),\s+got\s+([A-F0-9]{64})\./i

export function isCivitaiHashMismatchError(error) {
  return error?.code === civitaiHashMismatchErrorCode || error?.code === 'hash-mismatch'
}

function setCivitaiHashMismatch(download, expectedHash, actualHash, { accepted = false } = {}) {
  if (!download || !expectedHash || !actualHash) {
    return null
  }

  const previous = download.hashMismatch && typeof download.hashMismatch === 'object'
    ? download.hashMismatch
    : {}
  const mismatch = {
    ...previous,
    expectedSha256: expectedHash,
    actualSha256: actualHash,
    detectedAt: previous.detectedAt ?? Date.now(),
  }

  if (accepted) {
    mismatch.accepted = true
    mismatch.keptAnywayAt = Date.now()
  }

  download.hashMismatch = mismatch
  return mismatch
}

export function parseCivitaiHashMismatchMessage(message) {
  const match = civitaiHashMismatchMessagePattern.exec(typeof message === 'string' ? message : '')
  if (!match) {
    return null
  }

  return {
    expectedSha256: match[1].toUpperCase(),
    actualSha256: match[2].toUpperCase(),
  }
}

export function recordCivitaiHashMismatch(download, error, options = {}) {
  if (!isCivitaiHashMismatchError(error)) {
    return null
  }

  const parsedMessage = parseCivitaiHashMismatchMessage(error.message)
  const expectedHash = error.expectedHash ?? error.expectedSha256 ?? parsedMessage?.expectedSha256
  const actualHash = error.actualHash ?? error.actualSha256 ?? parsedMessage?.actualSha256
  const mismatch = setCivitaiHashMismatch(download, expectedHash, actualHash, options)
  if (!mismatch) {
    return null
  }

  if (!options.accepted) {
    download.errorCode = civitaiHashMismatchErrorCode
  }

  return mismatch
}

export function ensureCivitaiHashMismatch(download) {
  if (download?.errorCode === civitaiHashMismatchErrorCode) {
    return true
  }

  if (download?.hashMismatch?.expectedSha256 && download.hashMismatch?.actualSha256) {
    return true
  }

  const parsedMessage = parseCivitaiHashMismatchMessage(download?.error)
  if (!parsedMessage) {
    return false
  }

  setCivitaiHashMismatch(download, parsedMessage.expectedSha256, parsedMessage.actualSha256)
  download.errorCode = civitaiHashMismatchErrorCode
  return true
}

export function isCivitaiHashMismatchDownload(download) {
  if (!download || download.state !== 'error') {
    return false
  }

  return ensureCivitaiHashMismatch(download)
}

export function createCivitaiHashMismatchError(expectedHash, actualHash) {
  const error = new Error(
    `Downloaded file hash mismatch. Civitai served file bytes that do not match its SHA-256 metadata. Expected ${expectedHash}, got ${actualHash}.`,
  )
  error.code = civitaiHashMismatchErrorCode
  error.expectedHash = expectedHash
  error.actualHash = actualHash
  return error
}
