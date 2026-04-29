<script setup lang="ts">
import { computed, useAttrs } from 'vue'
import {
  SliderRange,
  SliderRoot,
  SliderThumb,
  SliderTrack,
} from 'reka-ui'

defineOptions({
  inheritAttrs: false,
})

const props = withDefaults(
  defineProps<{
    modelValue?: number[]
    defaultValue?: number[]
    min?: number
    max?: number
    step?: number
    disabled?: boolean
    ariaLabel?: string
  }>(),
  {
    modelValue: undefined,
    defaultValue: undefined,
    min: 0,
    max: 100,
    step: 1,
    disabled: false,
    ariaLabel: undefined,
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: number[]]
}>()

const attrs = useAttrs()
const sliderValue = computed({
  get: () => props.modelValue ?? props.defaultValue ?? [props.min],
  set: (value: number[] | undefined) => {
    emit('update:modelValue', Array.isArray(value) ? value : [props.min])
  },
})
const thumbCount = computed(() => Math.max(1, sliderValue.value.length))
</script>

<template>
  <SliderRoot
    v-bind="attrs"
    v-model="sliderValue"
    :min="min"
    :max="max"
    :step="step"
    :disabled="disabled"
    class="relative flex w-full touch-none select-none items-center data-[disabled]:cursor-not-allowed data-[disabled]:opacity-45"
  >
    <SliderTrack class="relative h-2 w-full grow overflow-hidden rounded-full bg-primary-foreground/12">
      <SliderRange class="absolute h-full bg-secondary" />
    </SliderTrack>
    <SliderThumb
      v-for="index in thumbCount"
      :key="index"
      :aria-label="ariaLabel"
      class="block h-5 w-5 rounded-full border border-secondary bg-card shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35 disabled:pointer-events-none disabled:opacity-50"
    />
  </SliderRoot>
</template>
