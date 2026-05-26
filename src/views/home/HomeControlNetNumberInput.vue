<script setup lang="ts">
defineProps<{
  label: string
  modelValue: string
  min: string
  max: string
  step: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

function handleInput(event: Event) {
  const target = event.target
  if (target instanceof HTMLInputElement) {
    emit('update:modelValue', target.value)
  }
}
</script>

<template>
  <label class="flex min-w-0 flex-col gap-2">
    <span class="field-label text-card-foreground/70">{{ label }}</span>
    <input
      :value="modelValue"
      type="number"
      :min="min"
      :max="max"
      :step="step"
      class="h-12 min-w-0 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-ring/25"
      @input="handleInput"
    />
  </label>
</template>
