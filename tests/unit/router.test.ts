// @vitest-environment jsdom

import { createMemoryHistory } from 'vue-router'
import { describe, expect, it } from 'vitest'

import { createAppRouter, routes } from '../../src/router'

describe('router', () => {
  it('declares the primary companion app routes', () => {
    expect(routes.map((route) => route.name)).toEqual([
      'home',
      'guidelines',
      'assets',
      'downloads',
      'library',
      'jobs',
      'settings',
    ])
  })

  it('creates isolated router instances for tests', async () => {
    const router = createAppRouter(createMemoryHistory())
    await router.push('/jobs')
    await router.isReady()

    expect(router.currentRoute.value.name).toBe('jobs')
  })
})
