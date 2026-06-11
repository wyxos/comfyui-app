<script setup lang="ts">
import type { AlertDialogTitleProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { computed } from 'vue'
import { AlertDialogTitle } from 'reka-ui'
import { cn } from '@/lib/utils'

interface Props extends AlertDialogTitleProps {
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
  <AlertDialogTitle
    v-bind="delegatedProps"
    :class="cn('text-base font-semibold leading-none tracking-normal', props.class)"
  >
    <slot />
  </AlertDialogTitle>
</template>
