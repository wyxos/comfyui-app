import { inject, provide } from 'vue'
import type { AssetsViewContext } from './useAssetsView'

const assetsViewContextKey = Symbol('AssetsViewContext')

export function provideAssetsView(view: AssetsViewContext) {
  provide(assetsViewContextKey, view)
}

export function useProvidedAssetsView() {
  const view = inject<AssetsViewContext>(assetsViewContextKey)

  if (!view) {
    throw new Error('Assets view context was not provided.')
  }

  return view
}
