<script setup lang="ts">
import HomeGenerationForm from './home/HomeGenerationForm.vue'
import HomeJobsPanel from './home/HomeJobsPanel.vue'
import HomePreviewModal from './home/HomePreviewModal.vue'
import HomePreviewPanel from './home/HomePreviewPanel.vue'
import HomeResetDialog from './home/HomeResetDialog.vue'
import { provideHomeView } from './home/homeViewContext'
import { useHomeView } from './home/useHomeView'

const view = useHomeView()
provideHomeView(view)
</script>

<template>
  <main class="h-full min-h-0 overflow-hidden bg-primary text-primary-foreground">
    <div class="grid h-full min-h-0 w-full lg:grid-cols-[2fr_2fr_1fr]">
      <HomeGenerationForm />
      <HomePreviewPanel />
      <HomeJobsPanel />
    </div>

    <HomeResetDialog />
    <HomePreviewModal />
  </main>
</template>

<style>
.companion-scroll {
  scrollbar-gutter: stable;
}

.field-label {
  font-size: 12px;
  line-height: 16px;
  font-weight: 600;
  color: rgb(240 247 244 / 1);
}

.companion-indeterminate {
  animation: companion-slide 1.2s ease-in-out infinite;
}

@keyframes companion-slide {
  0% {
    transform: translateX(-110%);
  }

  100% {
    transform: translateX(320%);
  }
}
</style>
