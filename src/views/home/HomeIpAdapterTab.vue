<script setup lang="ts">
import { useProvidedHomeView } from './homeViewContext'

const { formTab } = useProvidedHomeView()
</script>

<template>
  <div
    v-show="formTab === 'ipadapter'"
    class="space-y-5"
  >
    <div class="rounded-md border border-dashed border-primary-foreground/12 bg-primary-foreground/4 px-4 py-6 text-sm text-primary-foreground/56">
      IP-adapter review pending.
    </div>
  </div>
</template>
