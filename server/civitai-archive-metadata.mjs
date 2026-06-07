import { civitaiModelVersionsUrl } from './config.mjs'
import { safeTrim } from './shared.mjs'
import { getStoredCivitaiApiKey } from './settings.mjs'

async function archiveMetadataHeaders() {
  const headers = { Accept: 'application/json' }
  const apiKey = await getStoredCivitaiApiKey()
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`
  }
  return headers
}

export async function fetchCivitaiArchiveVersionMetadata({ versionId, hashes = {}, fetchImpl = fetch } = {}) {
  if (versionId) {
    const response = await fetchImpl(`${civitaiModelVersionsUrl.toString()}/${encodeURIComponent(versionId)}`, {
      headers: await archiveMetadataHeaders(),
      redirect: 'follow',
    })
    if (response.ok) {
      return response.json()
    }
  }

  for (const hash of Object.values(hashes)) {
    const normalizedHash = safeTrim(hash)
    if (!normalizedHash) {
      continue
    }
    const response = await fetchImpl(
      `${civitaiModelVersionsUrl.toString()}/by-hash/${encodeURIComponent(normalizedHash)}`,
      {
        headers: await archiveMetadataHeaders(),
        redirect: 'follow',
      },
    )
    if (response.ok) {
      return response.json()
    }
  }

  return null
}
