import { inject, provide } from 'vue'
import type { HomeViewContext } from './useHomeView'

const homeViewContextKey = Symbol('HomeViewContext')

export function provideHomeView(view: HomeViewContext) {
  provide(homeViewContextKey, view)
}

export function useProvidedHomeView() {
  const view = inject<HomeViewContext>(homeViewContextKey)

  if (!view) {
    throw new Error('Home view context was not provided.')
  }

  return view
}
