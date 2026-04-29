<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

withDefaults(
  defineProps<{
    content: string
  }>(),
  {
    content: '',
  },
)

const open = ref(false)
const trigger = ref<HTMLElement | null>(null)
const tooltip = ref<HTMLElement | null>(null)
const tooltipStyle = ref<Record<string, string>>({})
const tooltipPlacement = ref<'top' | 'bottom'>('top')

function updatePosition() {
  if (!open.value || !trigger.value || !tooltip.value || typeof window === 'undefined') {
    return
  }

  const triggerRect = trigger.value.getBoundingClientRect()
  const tooltipRect = tooltip.value.getBoundingClientRect()
  const horizontalPadding = 8
  const verticalGap = 10
  const maxWidth = Math.max(240, window.innerWidth - horizontalPadding * 2)

  let left = triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2
  left = Math.max(horizontalPadding, Math.min(left, window.innerWidth - tooltipRect.width - horizontalPadding))

  let top = triggerRect.top - tooltipRect.height - verticalGap
  tooltipPlacement.value = 'top'

  if (top < horizontalPadding) {
    top = triggerRect.bottom + verticalGap
    tooltipPlacement.value = 'bottom'
  }

  tooltipStyle.value = {
    left: `${left}px`,
    top: `${top}px`,
    maxWidth: `${maxWidth}px`,
  }
}

async function openTooltip() {
  open.value = true
  await nextTick()
  updatePosition()
}

function closeTooltip() {
  open.value = false
}

watch(open, async (value) => {
  if (!value) {
    return
  }

  await nextTick()
  updatePosition()
})

onMounted(() => {
  window.addEventListener('resize', updatePosition)
  window.addEventListener('scroll', updatePosition, true)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', updatePosition)
  window.removeEventListener('scroll', updatePosition, true)
})
</script>

<template>
  <div
    ref="trigger"
    class="inline-flex max-w-full"
    @mouseenter="openTooltip"
    @mouseleave="closeTooltip"
    @focusin="openTooltip"
    @focusout="closeTooltip"
  >
    <slot />

    <Teleport to="body">
      <transition
        enter-active-class="transition duration-150 ease-out"
        enter-from-class="translate-y-1 opacity-0"
        enter-to-class="translate-y-0 opacity-100"
        leave-active-class="transition duration-100 ease-in"
        leave-from-class="translate-y-0 opacity-100"
        leave-to-class="translate-y-1 opacity-0"
      >
        <div
          v-if="open && content"
          ref="tooltip"
          class="pointer-events-none fixed z-[100] rounded-md border border-border bg-card px-1 py-0 text-xs leading-5 text-card-foreground shadow-[0_18px_40px_rgba(0,0,0,0.28)]"
          :class="tooltipPlacement === 'bottom' ? 'origin-top' : 'origin-bottom'"
          :style="tooltipStyle"
        >
          <div class="break-all whitespace-pre-wrap">
            {{ content }}
          </div>
        </div>
      </transition>
    </Teleport>
  </div>
</template>
