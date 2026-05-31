<script setup lang="ts">
import { Download } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import AssetDownloadsPanel from './components/AssetDownloadsPanel.vue'
import { useAssetDownloadSummary } from './composables/useAssetDownloads'

const downloadsSheetOpen = ref(false)

const { counts: downloadCounts } = useAssetDownloadSummary()
const downloadBadgeCount = computed(() => {
  return downloadCounts.value.active || downloadCounts.value.attention || downloadCounts.value.visibleComplete
})

const navGroups = [
  {
    label: 'Generate',
    to: '/',
  },
  {
    label: 'Assets',
    to: '/assets',
  },
  {
    label: 'Downloads',
    to: '/downloads',
  },
  {
    label: 'Library',
    to: '/library',
  },
  {
    label: 'Jobs',
    to: '/jobs',
  },
  {
    label: 'Settings',
    to: '/settings',
  },
]
</script>

<template>
  <div class="grid h-screen overflow-hidden grid-rows-[3.75rem_minmax(0,1fr)] bg-background text-foreground">
    <header class="shrink-0 border-b border-border bg-card/92 backdrop-blur">
      <div class="flex h-[3.75rem] items-center justify-between gap-6 px-4 sm:px-6">
        <nav class="flex flex-wrap items-center gap-2">
          <router-link
            v-for="group in navGroups"
            :key="group.to"
            v-slot="{ href, navigate, isExactActive }"
            :to="group.to"
            custom
          >
            <a
              :href="href"
              class="inline-flex h-9 items-center rounded-md border px-3 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-ring/25"
              :class="
                isExactActive
                  ? 'border-secondary bg-secondary text-secondary-foreground shadow-[0_0_0_1px_rgba(255,198,0,0.3)]'
                  : 'border-transparent text-muted-foreground hover:border-accent/40 hover:bg-accent/10 hover:text-accent'
              "
              @click="navigate"
            >
              {{ group.label }}
            </a>
          </router-link>
        </nav>

        <div class="flex shrink-0 items-center gap-2">
          <button
            class="relative inline-flex h-9 w-9 items-center justify-center rounded-md border border-transparent text-muted-foreground transition hover:border-accent/40 hover:bg-accent/10 hover:text-accent focus:outline-none focus:ring-2 focus:ring-ring/25"
            type="button"
            aria-label="Open asset downloads"
            @click="downloadsSheetOpen = true"
          >
            <Download class="h-4 w-4" />
            <span class="sr-only">Open asset downloads</span>
            <span
              v-if="downloadBadgeCount"
              aria-hidden="true"
              class="absolute -right-1 -top-1 min-w-5 rounded-full border border-background bg-secondary px-1 text-center text-[10px] font-bold leading-5 text-secondary-foreground"
            >
              {{ downloadBadgeCount > 99 ? '99+' : downloadBadgeCount }}
            </span>
          </button>

          <router-link
            v-slot="{ href, navigate, isExactActive }"
            to="/guidelines"
            custom
          >
            <a
              :href="href"
              class="inline-flex h-9 items-center rounded-md border px-3 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-ring/25"
              :class="
                isExactActive
                  ? 'border-secondary bg-secondary text-secondary-foreground shadow-[0_0_0_1px_rgba(255,198,0,0.3)]'
                  : 'border-transparent text-muted-foreground hover:border-accent/40 hover:bg-accent/10 hover:text-accent'
              "
              @click="navigate"
            >
              Guidelines
            </a>
          </router-link>
        </div>
      </div>
    </header>

    <div class="min-h-0 overflow-hidden">
      <router-view />
    </div>

    <AssetDownloadsPanel
      :open="downloadsSheetOpen"
      @close="downloadsSheetOpen = false"
    />
  </div>
</template>
