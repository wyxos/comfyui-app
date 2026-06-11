<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { provideConfirmDialog, type ConfirmDialogOptions } from '@/composables/useConfirmDialog'

const dialogOpen = ref(false)
const activeOptions = ref<ConfirmDialogOptions | null>(null)
let resolvePending: ((confirmed: boolean) => void) | null = null

const dialogTitle = computed(() => activeOptions.value?.title ?? 'Confirm action')
const dialogDescription = computed(() => activeOptions.value?.description ?? '')
const confirmLabel = computed(() => activeOptions.value?.confirmLabel ?? 'Continue')
const cancelLabel = computed(() => activeOptions.value?.cancelLabel ?? 'Cancel')
const confirmVariant = computed(() => (activeOptions.value?.destructive ? 'destructive' : 'default'))

function settle(confirmed: boolean) {
  const resolver = resolvePending
  resolvePending = null
  dialogOpen.value = false

  if (resolver) {
    resolver(confirmed)
  }

  activeOptions.value = null
}

function handleOpenChange(open: boolean) {
  dialogOpen.value = open
  if (!open) {
    settle(false)
  }
}

provideConfirmDialog((options) => {
  if (resolvePending) {
    settle(false)
  }

  activeOptions.value = options
  dialogOpen.value = true

  return new Promise<boolean>((resolve) => {
    resolvePending = resolve
  })
})
</script>

<template>
  <slot />

  <AlertDialog
    :open="dialogOpen"
    @update:open="handleOpenChange"
  >
    <AlertDialogContent v-if="activeOptions">
      <AlertDialogHeader>
        <AlertDialogTitle>{{ dialogTitle }}</AlertDialogTitle>
        <AlertDialogDescription v-if="dialogDescription">
          {{ dialogDescription }}
        </AlertDialogDescription>
      </AlertDialogHeader>

      <AlertDialogFooter>
        <Button
          variant="outline"
          @click="settle(false)"
        >
          {{ cancelLabel }}
        </Button>
        <Button
          :variant="confirmVariant"
          @click="settle(true)"
        >
          {{ confirmLabel }}
        </Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
