<script setup lang="ts">
import { LoaderCircle } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
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
const suppressNextSave = ref(false)
const saveRequested = ref(false)
const saveToastShown = ref(false)
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
  const nextMode = props.modelNsfwOverride === true
    ? 'nsfw'
    : props.modelNsfwOverride === false
      ? 'safe'
      : 'detected'

  if (safetyMode.value !== nextMode) {
    suppressNextSave.value = true
    safetyMode.value = nextMode
  }
}

function safetyPayloadFor(mode: SafetyMode) {
  const modelNsfwOverride = mode === 'nsfw'
    ? true
    : mode === 'safe'
      ? false
      : null

  return {
    modelNsfw: modelNsfwOverride,
    modelNsfwOverride,
  }
}

function saveSafety(mode: SafetyMode) {
  saveRequested.value = true
  saveToastShown.value = false
  emit('save', safetyPayloadFor(mode))
}

function showSaveError(message: string) {
  if (saveToastShown.value) {
    return
  }

  toast.error(message || `${props.title} could not be saved.`)
  saveToastShown.value = true
  saveRequested.value = false
}

function showSaveSuccess() {
  if (saveToastShown.value) {
    return
  }

  toast.success(`${props.title} saved.`)
  saveToastShown.value = true
  saveRequested.value = false
}

watch(
  safetyMode,
  (mode) => {
    if (suppressNextSave.value) {
      suppressNextSave.value = false
      return
    }

    if (!props.saving) {
      saveSafety(mode)
    }
  },
)

watch(
  () => props.saving,
  (saving, wasSaving) => {
    if (wasSaving && !saving && saveRequested.value) {
      if (props.error) {
        showSaveError(props.error)
        return
      }

      showSaveSuccess()
    }
  },
)

watch(
  () => props.error,
  (error) => {
    if (saveRequested.value && error) {
      showSaveError(error)
    }
  },
)

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
      <span
        v-if="saving"
        class="inline-flex h-8 shrink-0 items-center rounded-md border border-border bg-background px-2 text-xs font-semibold text-muted-foreground"
        aria-live="polite"
      >
        <LoaderCircle
          data-icon="inline-start"
          class="mr-1.5 h-3.5 w-3.5 animate-spin text-secondary"
        />
        Saving
      </span>
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
        :disabled="saving"
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
