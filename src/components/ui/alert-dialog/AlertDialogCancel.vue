<script setup lang="ts">
import type { AlertDialogCancelProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import type { ButtonVariants } from '@/components/ui/button'
import { computed } from 'vue'
import { AlertDialogCancel } from 'reka-ui'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface Props extends AlertDialogCancelProps {
  class?: HTMLAttributes['class']
  variant?: ButtonVariants['variant']
  size?: ButtonVariants['size']
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'outline',
  size: 'default',
  class: undefined,
})
const delegatedProps = computed(() => {
  const delegated: Partial<Props> = { ...props }
  delete delegated.class
  delete delegated.variant
  delete delegated.size

  return delegated
})
</script>

<template>
  <AlertDialogCancel
    v-bind="delegatedProps"
    :class="cn(buttonVariants({ variant, size }), props.class)"
  >
    <slot />
  </AlertDialogCancel>
</template>
