<script setup lang="ts">
import { Search, X } from 'lucide-vue-next'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import UiPaginatedCardGrid from '../../components/ui/UiPaginatedCardGrid.vue'
import { fetchAppSettings } from '../../composables/useAppSettings'
import HomeAssetPickerCard from './HomeAssetPickerCard.vue'
import type { AssetPickerOption, BaseModelFilterOption } from './homeAssetPickerOptionHelpers'
import {
  activePreviewMediaFor,
  normalizeBaseModelFilterKey,
  optionBaseModelBadgeLabel,
  optionBaseModelLabels,
  optionHasNsfw,
  optionPreviewCount,
} from './homeAssetPickerOptionHelpers'

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
const blurNsfwContent = ref(true)
const selectedBaseModelFilter = ref('')
const currentPage = ref(1)
const previewIndexes = ref<Record<string, number>>({})
let previousBodyOverflow: string | null = null
let openLoadToken = 0
let includeNsfwTouched = false

const normalizedSearchQuery = computed(() => searchQuery.value.trim().toLowerCase())
const searchAndSafetyFilteredOptions = computed(() => {
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
const baseModelFilterOptions = computed<BaseModelFilterOption[]>(() => {
  const filters = new Map<string, BaseModelFilterOption>()

  for (const option of searchAndSafetyFilteredOptions.value) {
    for (const label of optionBaseModelLabels(option)) {
      const key = normalizeBaseModelFilterKey(label)
      if (!key) {
        continue
      }

      const existing = filters.get(key)
      if (existing) {
        existing.count += 1
        continue
      }

      filters.set(key, { key, label, count: 1 })
    }
  }

  return Array.from(filters.values()).sort((first, second) => first.label.localeCompare(second.label))
})
const hasBaseModelFilters = computed(() => baseModelFilterOptions.value.length > 0)
const filteredOptions = computed(() => {
  if (!selectedBaseModelFilter.value) {
    return searchAndSafetyFilteredOptions.value
  }

  return searchAndSafetyFilteredOptions.value.filter((option) =>
    optionBaseModelLabels(option).some((label) => normalizeBaseModelFilterKey(label) === selectedBaseModelFilter.value),
  )
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

function applyBaseModelFilter(baseModelKey: string) {
  selectedBaseModelFilter.value = baseModelKey
}

function activePreviewIndex(option: AssetPickerOption) {
  const total = optionPreviewCount(option)
  if (total < 1) {
    return 0
  }

  const index = previewIndexes.value[option.value] ?? 0
  return ((index % total) + total) % total
}

function showOptionPreview(option: AssetPickerOption, step: number) {
  const total = optionPreviewCount(option)
  if (total < 2) {
    return
  }

  previewIndexes.value = {
    ...previewIndexes.value,
    [option.value]: activePreviewIndex(option) + step,
  }
}

async function loadOpenDefaults(token: number) {
  try {
    const settings = await fetchAppSettings()
    if (props.open && token === openLoadToken && !includeNsfwTouched) {
      includeNsfw.value = settings.includeNsfw
    }
    if (props.open && token === openLoadToken) {
      blurNsfwContent.value = settings.blurNsfwContent !== false
    }
  } catch {
    if (props.open && token === openLoadToken && !includeNsfwTouched) {
      includeNsfw.value = false
    }
    if (props.open && token === openLoadToken) {
      blurNsfwContent.value = true
    }
  }
}

watch([normalizedSearchQuery, includeNsfw, selectedBaseModelFilter, () => props.options], () => {
  currentPage.value = 1
})

watch(
  () => baseModelFilterOptions.value.map((option) => option.key).join('|'),
  () => {
    if (!baseModelFilterOptions.value.some((option) => option.key === selectedBaseModelFilter.value)) {
      selectedBaseModelFilter.value = ''
    }
  },
)

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
      blurNsfwContent.value = true
      selectedBaseModelFilter.value = ''
      previewIndexes.value = {}
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

      <div
        v-if="hasBaseModelFilters"
        class="mt-2 flex flex-wrap gap-1.5"
        aria-label="Filter assets by base model"
      >
        <button
          class="inline-flex h-7 items-center gap-1 rounded-sm border px-2 text-[11px] font-semibold transition focus:outline-none focus:ring-2 focus:ring-ring/25"
          :class="!selectedBaseModelFilter ? 'border-secondary bg-secondary text-secondary-foreground' : 'border-border bg-background text-muted-foreground hover:border-secondary hover:text-secondary'"
          type="button"
          aria-label="Show all base model assets"
          :aria-pressed="!selectedBaseModelFilter"
          @click="applyBaseModelFilter('')"
        >
          All
          <span class="text-current/70">{{ searchAndSafetyFilteredOptions.length }}</span>
        </button>
        <button
          v-for="option in baseModelFilterOptions"
          :key="option.key"
          class="inline-flex h-7 items-center gap-1 rounded-sm border px-2 text-[11px] font-semibold transition focus:outline-none focus:ring-2 focus:ring-ring/25"
          :class="selectedBaseModelFilter === option.key ? 'border-secondary bg-secondary text-secondary-foreground' : 'border-border bg-background text-muted-foreground hover:border-secondary hover:text-secondary'"
          type="button"
          :aria-label="`Show ${option.label} assets`"
          :aria-pressed="selectedBaseModelFilter === option.key"
          @click="applyBaseModelFilter(option.key)"
        >
          {{ option.label }}
          <span class="text-current/70">{{ option.count }}</span>
        </button>
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
      <HomeAssetPickerCard
        v-for="option in visibleOptions"
        :key="option.value"
        :option="option"
        :preview-media="activePreviewMediaFor(option, activePreviewIndex(option))"
        :preview-index="activePreviewIndex(option)"
        :preview-count="optionPreviewCount(option)"
        :base-model-label="optionBaseModelBadgeLabel(option)"
        :has-nsfw="optionHasNsfw(option)"
        :blur-nsfw-content="blurNsfwContent"
        @select="selectOption(option)"
        @show-preview="showOptionPreview(option, $event)"
      />

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
