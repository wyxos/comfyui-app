<script setup lang="ts">
import { LoaderCircle, Save } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import { Button } from '@/components/ui/button'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

const props = withDefaults(
  defineProps<{
    modelNsfw?: boolean | null
    modelNsfwOverride?: boolean | null
    error?: string
    saving?: boolean
    title?: string
    overrideLabel?: string
    groupLabel?: string
    saveLabel?: string
    saveAriaLabel?: string
    originalAriaLabel?: string
    safeAriaLabel?: string
    nsfwAriaLabel?: string
  }>(),
  {
    modelNsfw: null,
    modelNsfwOverride: null,
    error: '',
    saving: false,
    title: 'Safety',
    overrideLabel: 'Local override',
    groupLabel: 'Safety override',
    saveLabel: 'Save',
    saveAriaLabel: 'Save safety override',
    originalAriaLabel: 'Use original safety metadata',
    safeAriaLabel: 'Mark safe',
    nsfwAriaLabel: 'Mark NSFW',
  },
)

const emit = defineEmits<{
  save: [payload: {
    modelNsfw: boolean | null
    modelNsfwOverride: boolean | null
  }]
}>()

type SafetyMode = 'detected' | 'safe' | 'nsfw'

const safetyMode = ref<SafetyMode>('detected')
const detectedLabel = computed(() => {
  if (props.modelNsfw === true) {
    return 'Detected as NSFW'
  }
  if (props.modelNsfw === false) {
    return 'Not flagged'
  }
  return 'Unknown'
})

function syncSafetyDraft() {
  safetyMode.value = props.modelNsfwOverride === true
    ? 'nsfw'
    : props.modelNsfwOverride === false
      ? 'safe'
      : 'detected'
}

function saveSafety() {
  const modelNsfwOverride = safetyMode.value === 'nsfw'
    ? true
    : safetyMode.value === 'safe'
      ? false
      : null
  emit('save', {
    modelNsfw: modelNsfwOverride,
    modelNsfwOverride,
  })
}

watch(
  () => [props.modelNsfw, props.modelNsfwOverride],
  syncSafetyDraft,
  { immediate: true },
)
</script>

<template>
  <section class="space-y-3 border-t border-border pt-5">
    <div class="flex items-start justify-between gap-3">
      <div>
        <p class="text-xs font-semibold uppercase tracking-[0.22em] text-secondary">{{ title }}</p>
        <p class="mt-1 text-xs text-muted-foreground">{{ detectedLabel }}</p>
      </div>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        :aria-label="saveAriaLabel"
        :disabled="saving"
        @click="saveSafety"
      >
        <LoaderCircle
          v-if="saving"
          data-icon="inline-start"
          class="animate-spin"
        />
        <Save
          v-else
          data-icon="inline-start"
        />
        {{ saveLabel }}
      </Button>
    </div>

    <div class="grid gap-2">
      <span class="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{{ overrideLabel }}</span>
      <ToggleGroup
        v-model="safetyMode"
        type="single"
        variant="outline"
        size="sm"
        class="grid w-full grid-cols-3"
        :aria-label="groupLabel"
      >
        <ToggleGroupItem
          value="detected"
          class="w-full"
          :aria-label="originalAriaLabel"
        >
          Original
        </ToggleGroupItem>
        <ToggleGroupItem
          value="safe"
          class="w-full"
          :aria-label="safeAriaLabel"
        >
          Safe
        </ToggleGroupItem>
        <ToggleGroupItem
          value="nsfw"
          class="w-full"
          :aria-label="nsfwAriaLabel"
        >
          NSFW
        </ToggleGroupItem>
      </ToggleGroup>
    </div>

    <p
      v-if="error"
      class="rounded-md border border-destructive/35 bg-destructive/10 px-3 py-2 text-xs font-semibold text-destructive"
    >
      {{ error }}
    </p>
  </section>
</template>
