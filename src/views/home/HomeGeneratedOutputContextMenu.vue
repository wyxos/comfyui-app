<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { Image as ImageIcon, LoaderCircle, SlidersHorizontal } from 'lucide-vue-next'
import { useProvidedHomeView } from './homeViewContext'

const {
  generatedOutputContextMenu,
  generatedOutputActionError,
  isApplyingGeneratedOutput,
  closeGeneratedOutputContextMenu,
  useGeneratedOutputAsImageInput,
  useGeneratedOutputAsControlNet,
} = useProvidedHomeView()

const menuStyle = computed(() => ({
  left: `${generatedOutputContextMenu.value?.x ?? 0}px`,
  top: `${generatedOutputContextMenu.value?.y ?? 0}px`,
}))

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    closeGeneratedOutputContextMenu()
  }
}

function handleWindowClick() {
  closeGeneratedOutputContextMenu()
}

onMounted(() => {
  window.addEventListener('click', handleWindowClick)
  window.addEventListener('keydown', handleKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('click', handleWindowClick)
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="generatedOutputContextMenu"
      class="fixed z-[120] w-60 overflow-hidden rounded-md border border-border bg-card text-card-foreground shadow-[0_18px_60px_rgba(0,0,0,0.36)]"
      :style="menuStyle"
      role="menu"
      aria-label="Generated output actions"
      @click.stop
      @contextmenu.prevent.stop
    >
      <button
        type="button"
        role="menuitem"
        class="flex h-11 w-full items-center gap-3 px-3 text-left text-sm font-semibold transition hover:bg-accent/12 hover:text-accent disabled:cursor-wait disabled:opacity-60"
        :disabled="isApplyingGeneratedOutput"
        @click="useGeneratedOutputAsImageInput"
      >
        <LoaderCircle
          v-if="isApplyingGeneratedOutput"
          class="h-4 w-4 animate-spin"
        />
        <ImageIcon
          v-else
          class="h-4 w-4"
        />
        <span>Use as image input</span>
      </button>

      <button
        type="button"
        role="menuitem"
        class="flex h-11 w-full items-center gap-3 px-3 text-left text-sm font-semibold transition hover:bg-accent/12 hover:text-accent disabled:cursor-wait disabled:opacity-60"
        :disabled="isApplyingGeneratedOutput"
        @click="useGeneratedOutputAsControlNet"
      >
        <LoaderCircle
          v-if="isApplyingGeneratedOutput"
          class="h-4 w-4 animate-spin"
        />
        <SlidersHorizontal
          v-else
          class="h-4 w-4"
        />
        <span>Use as ControlNet input</span>
      </button>

      <p
        v-if="generatedOutputActionError"
        class="border-t border-border px-3 py-2 text-xs font-semibold text-destructive"
      >
        {{ generatedOutputActionError }}
      </p>
    </div>
  </Teleport>
</template>
