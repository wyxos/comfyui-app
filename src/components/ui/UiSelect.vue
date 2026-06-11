<script setup lang="ts">
import { Check, ChevronDown, Image as ImageIcon, Search } from 'lucide-vue-next'
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import UiPreloadedMedia from './UiPreloadedMedia.vue'

type SelectOption = {
  label: string
  value: string
  previewUrl?: string | null
  previewMediaType?: 'image' | 'video' | string | null
}

const props = withDefaults(
  defineProps<{
    modelValue: string
    options: SelectOption[]
    placeholder?: string
    searchable?: boolean
    searchPlaceholder?: string
    disabled?: boolean
    ariaLabel?: string
  }>(),
  {
    placeholder: 'Select an option',
    searchable: false,
    searchPlaceholder: 'Search...',
    disabled: false,
    ariaLabel: undefined,
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const root = ref<HTMLElement | null>(null)
const searchInput = ref<HTMLInputElement | null>(null)
const open = ref(false)
const searchQuery = ref('')

const selectedOption = computed(() => {
  return props.options.find((option) => option.value === props.modelValue) ?? null
})

const filteredOptions = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  if (!query) {
    return props.options
  }

  return props.options.filter((option) => {
    return option.label.toLowerCase().includes(query) || option.value.toLowerCase().includes(query)
  })
})

function close() {
  open.value = false
  searchQuery.value = ''
}

function toggle() {
  if (props.disabled) {
    return
  }

  open.value = !open.value
  if (open.value) {
    searchQuery.value = ''
    if (props.searchable) {
      void nextTick(() => searchInput.value?.focus())
    }
  }
}

function selectOption(option: SelectOption) {
  emit('update:modelValue', option.value)
  close()
}

function optionHasVideoPreview(option: SelectOption) {
  return option.previewMediaType === 'video'
}

function optionSupportsPreview(option: SelectOption | null) {
  return Boolean(option && ('previewUrl' in option || 'previewMediaType' in option))
}

function handlePointerDown(event: PointerEvent) {
  if (!root.value) {
    return
  }

  const target = event.target
  if (target instanceof Node && !root.value.contains(target)) {
    close()
  }
}

onMounted(() => {
  document.addEventListener('pointerdown', handlePointerDown)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handlePointerDown)
})
</script>

<template>
  <div
    ref="root"
    class="relative"
  >
    <button
      type="button"
      role="combobox"
      class="flex min-h-12 w-full items-center justify-between gap-3 rounded-md border border-input bg-card px-3 py-2 text-left text-sm text-card-foreground outline-none transition focus:border-accent focus:ring-2 focus:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-60"
      :class="open ? 'border-accent ring-2 ring-ring/25' : ''"
      :disabled="disabled"
      :value="modelValue"
      :aria-label="ariaLabel"
      :aria-expanded="open"
      aria-haspopup="listbox"
      @click="toggle"
    >
      <span class="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
        <span
          v-if="optionSupportsPreview(selectedOption)"
          class="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-sm border border-border bg-muted text-muted-foreground"
        >
          <UiPreloadedMedia
            v-if="selectedOption?.previewUrl"
            :src="selectedOption.previewUrl"
            :is-video="optionHasVideoPreview(selectedOption)"
            :alt="`${selectedOption.label} preview`"
            label=""
            media-class="h-full w-full object-cover"
            loading-class="bg-muted text-muted-foreground"
            spinner-class="mr-0 h-4 w-4"
            muted
            loop
            autoplay
            playsinline
            preload="metadata"
            :aria-label="optionHasVideoPreview(selectedOption) ? `${selectedOption.label} video preview` : undefined"
            :loading="optionHasVideoPreview(selectedOption) ? undefined : 'lazy'"
          />
          <ImageIcon
            v-else
            class="h-4 w-4"
            :stroke-width="1.8"
          />
        </span>
        <span class="truncate">{{ selectedOption?.label ?? placeholder }}</span>
      </span>
      <ChevronDown
        class="h-4 w-4 shrink-0 text-muted-foreground transition"
        :class="open ? 'rotate-180 text-accent' : ''"
      />
    </button>

    <div
      v-if="open"
      role="listbox"
      class="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-30 overflow-hidden rounded-md border border-border bg-card shadow-[0_18px_40px_rgba(0,0,0,0.28)]"
    >
      <div
        v-if="searchable"
        class="border-b border-border p-2"
      >
        <label class="flex h-9 items-center gap-2 rounded-sm border border-input bg-background px-2 text-xs text-muted-foreground focus-within:border-accent focus-within:ring-2 focus-within:ring-ring/25">
          <Search class="h-3.5 w-3.5 shrink-0" />
          <input
            ref="searchInput"
            v-model="searchQuery"
            class="min-w-0 flex-1 bg-transparent text-card-foreground outline-none placeholder:text-muted-foreground"
            type="search"
            :aria-label="searchPlaceholder"
            :placeholder="searchPlaceholder"
            autocomplete="off"
            @keydown.stop
          />
        </label>
      </div>
      <div class="max-h-80 overflow-y-auto">
        <button
          v-for="option in filteredOptions"
          :key="option.value"
          type="button"
          role="option"
          :aria-selected="option.value === modelValue"
          class="flex min-h-14 w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm text-card-foreground transition hover:bg-accent/10 hover:text-accent"
          @click="selectOption(option)"
        >
          <span class="flex min-w-0 flex-1 items-center gap-3 overflow-hidden">
            <span
              v-if="optionSupportsPreview(option)"
              class="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-sm border border-border bg-muted text-muted-foreground"
            >
              <UiPreloadedMedia
                v-if="option.previewUrl"
                :src="option.previewUrl"
                :is-video="optionHasVideoPreview(option)"
                :alt="`${option.label} preview`"
                label=""
                media-class="h-full w-full object-cover"
                loading-class="bg-muted text-muted-foreground"
                spinner-class="mr-0 h-4 w-4"
                muted
                loop
                autoplay
                playsinline
                preload="metadata"
                :aria-label="optionHasVideoPreview(option) ? `${option.label} video preview` : undefined"
                :loading="optionHasVideoPreview(option) ? undefined : 'lazy'"
              />
              <ImageIcon
                v-else
                class="h-5 w-5"
                :stroke-width="1.8"
              />
            </span>
            <span class="truncate">{{ option.label }}</span>
          </span>
          <Check
            v-if="option.value === modelValue"
            class="h-4 w-4 shrink-0 text-accent"
          />
        </button>
        <div
          v-if="!filteredOptions.length"
          class="px-3 py-4 text-center text-xs text-muted-foreground"
        >
          No matching options.
        </div>
      </div>
    </div>
  </div>
</template>
