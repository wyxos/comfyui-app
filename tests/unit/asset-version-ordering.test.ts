import { describe, expect, it } from 'vitest'

import { firstVersion, versionsForModel } from '../../src/views/assets/assetModelHelpers'
import type { CivitaiModel } from '../../src/views/assets/assetViewTypes'

describe('asset model version ordering', () => {
  it('sorts versions by release date descending with stable fallback for undated versions', () => {
    const model = {
      id: 101,
      name: 'Ordered model',
      type: 'Checkpoint',
      modelVersions: [
        {
          id: 201,
          name: 'Undated first',
        },
        {
          id: 202,
          name: 'Created later',
          createdAt: '2024-04-10T00:00:00.000Z',
        },
        {
          id: 203,
          name: 'Published newest',
          publishedAt: '2024-05-20T00:00:00.000Z',
        },
        {
          id: 204,
          name: 'Undated second',
        },
      ],
    } satisfies CivitaiModel

    expect(versionsForModel(model).map((version) => version.id)).toEqual([203, 202, 201, 204])
    expect(firstVersion(model)?.id).toBe(203)
  })
})
