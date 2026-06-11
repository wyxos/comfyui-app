<script setup lang="ts">
import { computed } from 'vue'

defineOptions({
  inheritAttrs: false,
})

const props = withDefaults(
  defineProps<{
    checked: boolean
    disabled?: boolean
    size?: 'sm' | 'md'
  }>(),
  {
    disabled: false,
    size: 'sm',
  },
)

const trackClasses = computed(() => [
  props.size === 'md' ? 'h-8 w-12' : 'h-6 w-10',
  props.checked ? 'border-secondary bg-secondary' : 'border-primary-foreground/12 bg-primary-foreground/8',
])

const thumbClasses = computed(() => [
  props.size === 'md' ? 'h-4 w-4' : 'h-3.5 w-3.5',
  props.checked
    ? props.size === 'md'
      ? 'translate-x-6'
      : 'translate-x-5'
    : props.size === 'md'
      ? 'translate-x-1'
      : 'translate-x-0.5',
])
</script>

<template>
  <button
    v-bind="$attrs"
    type="button"
    role="switch"
    :aria-checked="checked"
    :disabled="disabled"
    :class="trackClasses"
    class="relative inline-flex shrink-0 items-center rounded-sm border transition focus:outline-none focus:ring-2 focus:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-45"
  >
    <span
      :class="thumbClasses"
      class="inline-block rounded-sm bg-primary-foreground shadow-sm transition-transform"
    />
  </button>
</template>
