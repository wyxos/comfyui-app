import type { MockModel } from './mockApiData'

const onePixelPng =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lp2wngAAAABJRU5ErkJggg=='

export function mockImageResponse() {
  const bytes = Uint8Array.from(atob(onePixelPng), (char) => char.charCodeAt(0))
  return new Response(bytes, {
    status: 200,
    headers: { 'Content-Type': 'image/png' },
  })
}

export function modelImages(models: MockModel[]) {
  return models.flatMap((model) => {
    const versions = Array.isArray(model.modelVersions) ? model.modelVersions : []
    return versions.flatMap((version) => {
      if (!version || typeof version !== 'object' || !('images' in version)) {
        return []
      }

      return Array.isArray(version.images) ? version.images : []
    })
  })
}
