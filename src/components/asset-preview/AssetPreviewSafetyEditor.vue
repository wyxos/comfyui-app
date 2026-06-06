<script setup lang="ts">
import { LoaderCircle, Save, ShieldAlert } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    modelNsfw?: boolean | null
    modelNsfwOverride?: boolean | null
    error?: string
    saving?: boolean
  }>(),
  {
    modelNsfw: null,
    modelNsfwOverride: null,
    error: '',
    saving: false,
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
        <p class="text-xs font-semibold uppercase tracking-[0.22em] text-secondary">Safety</p>
        <p class="mt-1 text-xs text-muted-foreground">{{ detectedLabel }}</p>
      </div>
      <button
        type="button"
        aria-label="Save safety override"
        class="inline-flex h-8 items-center gap-2 rounded-md border border-secondary/35 bg-secondary px-3 text-xs font-semibold uppercase tracking-[0.1em] text-secondary-foreground transition hover:brightness-95 disabled:cursor-wait disabled:opacity-60"
        :disabled="saving"
        @click="saveSafety"
      >
        <LoaderCircle
          v-if="saving"
          class="h-3.5 w-3.5 animate-spin"
        />
        <Save
          v-else
          class="h-3.5 w-3.5"
        />
        Save
      </button>
    </div>

    <label class="grid gap-2">
      <span class="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Local override</span>
      <span class="relative">
        <ShieldAlert class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <select
          v-model="safetyMode"
          aria-label="Safety override"
          class="h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm font-semibold text-card-foreground outline-none transition focus:border-accent focus:ring-2 focus:ring-ring/25"
        >
          <option value="detected">Use detected</option>
          <option value="safe">Mark safe</option>
          <option value="nsfw">Mark NSFW</option>
        </select>
      </span>
    </label>

    <p
      v-if="error"
      class="rounded-md border border-destructive/35 bg-destructive/10 px-3 py-2 text-xs font-semibold text-destructive"
    >
      {{ error }}
    </p>
  </section>
</template>
