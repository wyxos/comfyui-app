<script setup lang="ts">
import type { AlertDialogDescriptionProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { computed } from 'vue'
import { AlertDialogDescription } from 'reka-ui'
import { cn } from '@/lib/utils'

interface Props extends AlertDialogDescriptionProps {
  class?: HTMLAttributes['class']
}

const props = defineProps<Props>()
const delegatedProps = computed(() => {
  const delegated = { ...props }
  delete delegated.class

  return delegated
})
</script>

<template>
  <AlertDialogDescription
    v-bind="delegatedProps"
    :class="cn('text-sm leading-6 text-muted-foreground', props.class)"
  >
    <slot />
  </AlertDialogDescription>
</template>
