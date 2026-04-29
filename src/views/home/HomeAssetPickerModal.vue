<script setup lang="ts">
import { Image as ImageIcon, Search, X } from 'lucide-vue-next'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import UiPaginatedCardGrid from '../../components/ui/UiPaginatedCardGrid.vue'
import UiPreviewCard from '../../components/ui/UiPreviewCard.vue'
import { fetchAppSettings } from '../../composables/useAppSettings'

type AssetPickerOption = {
  label: string
  value: string
  previewUrl?: string | null
  previewMediaType?: 'image' | 'video' | string | null
  modelNsfw?: boolean | number | string | null
  modelMetadata?: {
    nsfw?: boolean | number | string | null
  } | null
  typeLabel?: string | null
}

const props = withDefaults(
  defineProps<{
    open: boolean
    title: string
    subtitle?: string
    options: AssetPickerOption[]
    searchPlaceholder?: string
    emptyTitle?: string
    emptyText?: string
    pageSize?: number
  }>(),
  {
    subtitle: '',
    searchPlaceholder: 'Search assets...',
    emptyTitle: 'No assets found',
    emptyText: 'No available assets match the current search.',
    pageSize: 40,
  },
)

const emit = defineEmits<{
  close: []
  select: [value: string]
}>()

const searchInput = ref<HTMLInputElement | null>(null)
const searchQuery = ref('')
const includeNsfw = ref(false)
const currentPage = ref(1)
let previousBodyOverflow: string | null = null
let openLoadToken = 0
let includeNsfwTouched = false

const normalizedSearchQuery = computed(() => searchQuery.value.trim().toLowerCase())
const filteredOptions = computed(() => {
  const query = normalizedSearchQuery.value
  return props.options.filter((option) => {
    if (!includeNsfw.value && optionHasNsfw(option)) {
      return false
    }

    if (!query) {
      return true
    }

    return option.label.toLowerCase().includes(query) || option.value.toLowerCase().includes(query)
  })
})
const pageCount = computed(() => Math.max(1, Math.ceil(filteredOptions.value.length / props.pageSize)))
const pageStartIndex = computed(() => (currentPage.value - 1) * props.pageSize)
const pageEndIndex = computed(() => Math.min(pageStartIndex.value + props.pageSize, filteredOptions.value.length))
const visibleOptions = computed(() => filteredOptions.value.slice(pageStartIndex.value, pageEndIndex.value))
const resultCountLabel = computed(() => {
  const count = filteredOptions.value.length
  const noun = count === 1 ? 'asset' : 'assets'
  return normalizedSearchQuery.value ? `${count} matching ${noun}` : `${count} available ${noun}`
})
const pageRangeLabel = computed(() => {
  if (!filteredOptions.value.length) {
    return '0 of 0'
  }

  return `${pageStartIndex.value + 1}-${pageEndIndex.value} of ${filteredOptions.value.length}`
})

function optionHasVideoPreview(option: AssetPickerOption) {
  return option.previewMediaType === 'video'
}

function isNsfwValue(value: unknown) {
  if (typeof value === 'boolean') {
    return value
  }

  if (typeof value === 'number') {
    return value > 0
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    return Boolean(normalized && !['false', '0', 'no', 'none', 'safe'].includes(normalized))
  }

  return false
}

function optionHasNsfw(option: AssetPickerOption) {
  return isNsfwValue(option.modelNsfw ?? option.modelMetadata?.nsfw)
}

function optionTypeLabel(option: AssetPickerOption) {
  return option.typeLabel || (props.title.toLowerCase().includes('lora') ? 'LoRA' : 'Checkpoint')
}

function lockBodyScroll() {
  if (typeof document === 'undefined' || previousBodyOverflow !== null) {
    return
  }

  previousBodyOverflow = document.body.style.overflow
  document.body.style.overflow = 'hidden'
}

function unlockBodyScroll() {
  if (typeof document === 'undefined' || previousBodyOverflow === null) {
    return
  }

  document.body.style.overflow = previousBodyOverflow
  previousBodyOverflow = null
}

function closePicker() {
  emit('close')
}

function selectOption(option: AssetPickerOption) {
  emit('select', option.value)
  emit('close')
}

function goToPage(page: number) {
  currentPage.value = Math.max(1, Math.min(page, pageCount.value))
}

function handleKeydown(event: KeyboardEvent) {
  if (!props.open || event.key !== 'Escape') {
    return
  }

  event.preventDefault()
  closePicker()
}

function markIncludeNsfwTouched() {
  includeNsfwTouched = true
}

async function loadOpenDefaults(token: number) {
  try {
    const settings = await fetchAppSettings()
    if (props.open && token === openLoadToken && !includeNsfwTouched) {
      includeNsfw.value = settings.includeNsfw
    }
  } catch {
    if (props.open && token === openLoadToken && !includeNsfwTouched) {
      includeNsfw.value = false
    }
  }
}

watch([normalizedSearchQuery, includeNsfw, () => props.options], () => {
  currentPage.value = 1
})

watch(pageCount, (count) => {
  currentPage.value = Math.min(currentPage.value, count)
})

watch(
  () => props.open,
  (open) => {
    if (open) {
      const token = openLoadToken + 1
      openLoadToken = token
      searchQuery.value = ''
      includeNsfw.value = false
      includeNsfwTouched = false
      currentPage.value = 1
      lockBodyScroll()
      void loadOpenDefaults(token)
      void nextTick(() => {
        searchInput.value?.focus()
      })
      return
    }

    unlockBodyScroll()
  },
  { immediate: true },
)

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown)
  unlockBodyScroll()
})
</script>

<template>
  <div
    v-if="open"
    class="fixed inset-0 z-[80] flex flex-col bg-background/96 text-foreground backdrop-blur-sm"
    role="dialog"
    aria-modal="true"
    :aria-label="title"
  >
    <header class="shrink-0 border-b border-border bg-card/92 px-4 py-3 shadow-[0_18px_60px_rgba(0,0,0,0.2)] sm:px-6">
      <div class="flex items-start justify-between gap-4">
        <div class="min-w-0">
          <p class="text-xs font-semibold uppercase tracking-[0.18em] text-secondary">
            {{ resultCountLabel }}
          </p>
          <h2 class="mt-1 truncate text-xl font-semibold tracking-tight text-card-foreground">
            {{ title }}
          </h2>
          <p
            v-if="subtitle"
            class="mt-0.5 truncate text-sm text-muted-foreground"
          >
            {{ subtitle }}
          </p>
        </div>

        <button
          type="button"
          class="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition hover:border-secondary/60 hover:bg-secondary hover:text-secondary-foreground focus:outline-none focus:ring-2 focus:ring-ring/25"
          aria-label="Close asset picker"
          @click="closePicker"
        >
          <X class="h-4 w-4" />
        </button>
      </div>

      <div class="mt-3 flex flex-wrap items-center gap-2">
        <label class="flex h-11 min-w-[16rem] flex-1 items-center gap-2 rounded-md border border-input bg-background px-3 text-sm text-muted-foreground focus-within:border-accent focus-within:ring-2 focus-within:ring-ring/25">
          <Search class="h-4 w-4 shrink-0" />
          <input
            ref="searchInput"
            v-model="searchQuery"
            class="min-w-0 flex-1 bg-transparent text-card-foreground outline-none placeholder:text-muted-foreground"
            type="search"
            :aria-label="searchPlaceholder"
            :placeholder="searchPlaceholder"
            autocomplete="off"
          />
        </label>

        <label class="inline-flex h-11 items-center gap-2 rounded-md border border-border bg-background px-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground transition hover:border-secondary/55 hover:text-foreground">
          <input
            v-model="includeNsfw"
            class="h-4 w-4 accent-secondary"
            type="checkbox"
            aria-label="Include NSFW asset picker models"
            @change="markIncludeNsfwTouched"
          />
          NSFW
        </label>
      </div>
    </header>

    <UiPaginatedCardGrid
      :items-present="visibleOptions.length > 0"
      :range-label="pageRangeLabel"
      :current-page="currentPage"
      :page-count="pageCount"
      previous-label="Previous asset picker page"
      next-label="Next asset picker page"
      content-class="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6"
      empty-class="flex min-h-64 items-center justify-center rounded-md border border-border bg-card px-4 text-center"
      footer-class="bg-card/92"
      @go-to-page="goToPage"
    >
      <UiPreviewCard
        v-for="option in visibleOptions"
        :key="option.value"
        tag="button"
        min-height-class="min-h-[20rem]"
        media-class="h-64"
        :preview-url="option.previewUrl ?? ''"
        :is-video-preview="optionHasVideoPreview(option)"
        :preview-label="`${option.label} preview`"
        :aria-label="option.label"
        :title="option.value !== option.label ? `${option.label}\n${option.value}` : option.label"
        @click="selectOption(option)"
      >
        <template #placeholder>
          <ImageIcon
            class="h-8 w-8 text-primary-foreground/35 transition group-hover:text-accent"
            :stroke-width="1.6"
          />
          <span class="text-xs font-semibold uppercase tracking-[0.16em] text-primary-foreground/68">
            No preview available
          </span>
        </template>

        <template #media-overlay>
          <div class="absolute right-3 top-3 flex flex-wrap justify-end gap-2">
            <span
              v-if="optionHasNsfw(option)"
              class="rounded-sm border border-destructive/50 bg-destructive/90 px-2 py-1 text-[11px] font-semibold text-destructive-foreground shadow-sm backdrop-blur-sm"
            >
              NSFW
            </span>
            <span class="rounded-sm border border-primary-foreground/12 bg-primary/85 px-2 py-1 text-[11px] font-semibold text-primary-foreground/82 shadow-sm backdrop-blur-sm">
              {{ optionTypeLabel(option) }}
            </span>
          </div>
        </template>

        <h3
          class="truncate text-sm font-semibold leading-5 text-card-foreground transition group-hover:text-secondary"
          :title="option.label"
        >
          {{ option.label }}
        </h3>
      </UiPreviewCard>

      <template #empty>
        <div class="max-w-sm">
          <p class="font-semibold text-card-foreground">
            {{ emptyTitle }}
          </p>
          <p class="mt-1 text-sm text-muted-foreground">
            {{ emptyText }}
          </p>
        </div>
      </template>
    </UiPaginatedCardGrid>
  </div>
</template>
