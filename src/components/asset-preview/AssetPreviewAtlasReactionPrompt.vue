<script setup lang="ts">
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'

defineProps<{
  open: boolean
  updateOpen: (value: boolean) => void
  chooseReact: () => void
  chooseRedownload: () => void
  closeDialog: () => void
}>()
</script>

<template>
  <AlertDialog
    :open="open"
    @update:open="updateOpen"
  >
    <AlertDialogContent v-if="open">
      <AlertDialogHeader>
        <AlertDialogTitle>Already reacted in Atlas</AlertDialogTitle>
        <AlertDialogDescription>
          This file already has an Atlas reaction. Update the reaction, pull down a fresh copy, or leave everything as-is.
        </AlertDialogDescription>
      </AlertDialogHeader>

      <AlertDialogFooter class="gap-2 sm:justify-end">
        <Button
          variant="outline"
          @click="closeDialog"
        >
          Leave it as-is
        </Button>
        <Button
          variant="outline"
          @click="chooseReact"
        >
          Update reaction
        </Button>
        <Button @click="chooseRedownload">
          Update and download again
        </Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
