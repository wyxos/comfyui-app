<script setup lang="ts">
import type { AlertDialogContentEmits, AlertDialogContentProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { computed } from 'vue'
import {
  AlertDialogContent as AlertDialogContentPrimitive,
  AlertDialogOverlay,
  AlertDialogPortal,
  useForwardPropsEmits,
} from 'reka-ui'
import { cn } from '@/lib/utils'

interface Props extends AlertDialogContentProps {
  class?: HTMLAttributes['class']
}

const props = defineProps<Props>()
const emits = defineEmits<AlertDialogContentEmits>()
const delegatedProps = computed(() => {
  const delegated = { ...props }
  delete delegated.class

  return delegated
})
const forwarded = useForwardPropsEmits(delegatedProps, emits)
</script>

<template>
  <AlertDialogPortal>
    <AlertDialogOverlay class="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm" />
    <AlertDialogContentPrimitive
      v-bind="forwarded"
      :class="cn(
        'fixed left-1/2 top-1/2 z-50 grid w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 rounded-md border border-border bg-card p-5 text-card-foreground shadow-[0_24px_80px_rgba(0,0,0,0.42)] outline-none',
        props.class,
      )"
    >
      <slot />
    </AlertDialogContentPrimitive>
  </AlertDialogPortal>
</template>
