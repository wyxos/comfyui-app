<script setup lang="ts">
import { useProvidedHomeView } from './homeViewContext'

const {
  isResetDialogOpen,
  closeResetDialog,
  resetForm,
} = useProvidedHomeView()
</script>

<template>
  <Teleport to="body">
    <div
      v-if="isResetDialogOpen"
      class="fixed inset-0 z-[85] flex items-center justify-center bg-primary/80 p-4 backdrop-blur-sm"
      @click.self="closeResetDialog"
    >
      <div class="w-full max-w-md rounded-xl border border-primary-foreground/12 bg-card p-6 text-card-foreground shadow-[0_30px_90px_rgba(0,0,0,0.35)]">
        <div class="space-y-2">
          <p class="text-lg font-semibold text-card-foreground">Reset form?</p>
          <p class="text-sm leading-6 text-muted-foreground">
            This clears checkpoints, LoRAs, prompt text, config values, and the input image. Running or queued jobs stay untouched.
          </p>
        </div>

        <div class="mt-6 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            class="inline-flex h-10 items-center justify-center rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition hover:border-accent hover:text-accent"
            @click="closeResetDialog"
          >
            Keep Editing
          </button>
          <button
            type="button"
            class="inline-flex h-10 items-center justify-center rounded-md border border-destructive bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground transition hover:bg-destructive/92"
            @click="resetForm"
          >
            Reset Form
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
