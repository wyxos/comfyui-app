import type { InjectionKey } from 'vue'
import { inject, provide } from 'vue'

export interface ConfirmDialogOptions {
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
}

export type ConfirmDialogFn = (options: ConfirmDialogOptions) => Promise<boolean>

const confirmDialogKey: InjectionKey<ConfirmDialogFn> = Symbol('confirm-dialog')

export function provideConfirmDialog(confirmDialog: ConfirmDialogFn) {
  provide(confirmDialogKey, confirmDialog)
}

export function useConfirmDialog(): ConfirmDialogFn {
  return inject(confirmDialogKey, async () => false)
}
