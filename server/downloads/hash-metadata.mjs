import { safeTrim } from '../shared.mjs'

export function normalizeCivitaiHashAlgorithm(value) {
  return safeTrim(value).toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export function normalizeCivitaiDownloadHashes(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }

  const hashes = {}
  for (const [algorithm, hash] of Object.entries(value)) {
    const normalizedAlgorithm = normalizeCivitaiHashAlgorithm(algorithm)
    const normalizedHash = safeTrim(hash)
    if (normalizedAlgorithm && normalizedHash) {
      hashes[normalizedAlgorithm] = normalizedHash
    }
  }

  return hashes
}

export function getCivitaiSha256Hash(value) {
  const hashes = normalizeCivitaiDownloadHashes(value)
  const expectedHash = safeTrim(hashes.SHA256).toUpperCase()
  return /^[A-F0-9]{64}$/.test(expectedHash) ? expectedHash : ''
}
