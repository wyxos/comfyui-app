import type { MockModel } from './mockApiData'

function integerSet(value: string | null) {
  return new Set((value ?? '')
    .split(',')
    .map((id) => Number.parseInt(id.trim(), 10))
    .filter((id) => Number.isSafeInteger(id) && id > 0))
}

export function mockCivitaiModelPreviews(models: MockModel[], url: URL) {
  const modelIds = integerSet(url.searchParams.get('modelIds') ?? url.searchParams.get('ids'))
  const versionIds = integerSet(url.searchParams.get('versionIds') ?? url.searchParams.get('modelVersionIds'))

  return models
    .filter((model) => !modelIds.size || modelIds.has(Number(model.id)))
    .flatMap((model) =>
      (Array.isArray(model.modelVersions) ? model.modelVersions : [])
        .filter((version) => !versionIds.size || versionIds.has(Number(version.id)))
        .map((version) => ({
          modelId: model.id,
          versionId: version.id,
          previews: (Array.isArray(version.images) ? version.images : [])
            .filter((image) => image?.url)
            .map((image) => ({
              id: image.id,
              url: image.url,
              type: image.type,
              mediaType: image.mediaType,
              nsfwLevel: image.nsfwLevel,
              width: image.width,
              height: image.height,
              hash: image.hash,
            })),
        })),
    )
}
