<script setup lang="ts">
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue'
import { LoaderCircle } from 'lucide-vue-next'

defineOptions({
  inheritAttrs: false,
})

const props = withDefaults(
  defineProps<{
    src: string
    alt?: string
    label?: string
    isVideo?: boolean
    mediaClass?: string
    loadingClass?: string
    spinnerClass?: string
    autoplay?: boolean
    controls?: boolean
    loop?: boolean
    muted?: boolean
    playsinline?: boolean
    preload?: 'none' | 'metadata' | 'auto'
  }>(),
  {
    alt: '',
    label: 'Loading media',
    isVideo: false,
    mediaClass: '',
    loadingClass: '',
    spinnerClass: '',
    autoplay: false,
    controls: false,
    loop: false,
    muted: false,
    playsinline: true,
    preload: 'metadata',
  },
)

const emit = defineEmits<{
  ready: [src: string]
  error: [src: string]
}>()

const imageElement = useTemplateRef<HTMLImageElement>('imageElement')
const videoElement = useTemplateRef<HTMLVideoElement>('videoElement')
const isReady = ref(false)

const mediaClasses = computed(() => [
  props.mediaClass,
  'transition-opacity duration-200',
  isReady.value ? 'opacity-100' : 'opacity-0',
])

const loadingClasses = computed(() => [
  'absolute inset-0 z-10 flex items-center justify-center bg-background/55 text-sm font-semibold text-foreground backdrop-blur-sm',
  props.loadingClass,
])

const markReady = () => {
  if (isReady.value) {
    return
  }

  isReady.value = true
  emit('ready', props.src)
}

const markFailed = () => {
  if (isReady.value) {
    return
  }

  isReady.value = true
  emit('error', props.src)
}

const checkCachedMedia = async () => {
  isReady.value = false
  await nextTick()

  if (props.isVideo) {
    const video = videoElement.value
    if (video && video.readyState >= HTMLMediaElement.HAVE_METADATA) {
      markReady()
    }
    return
  }

  const image = imageElement.value
  if (image?.complete && image.naturalWidth > 0) {
    markReady()
  }
}

watch(() => [props.src, props.isVideo] as const, checkCachedMedia, { immediate: true })
</script>

<template>
  <div class="relative flex h-full w-full items-center justify-center overflow-hidden" :aria-busy="!isReady">
    <div
      v-if="!isReady"
      :class="loadingClasses"
      aria-live="polite"
      data-test="media-loading"
    >
      <LoaderCircle :class="['mr-2 h-5 w-5 animate-spin text-secondary', spinnerClass]" />
      {{ label }}
    </div>

    <video
      v-if="isVideo"
      ref="videoElement"
      v-bind="$attrs"
      :class="mediaClasses"
      :src="src"
      :autoplay="autoplay"
      :controls="controls"
      :loop="loop"
      :muted="muted"
      :playsinline="playsinline"
      :preload="preload"
      @loadedmetadata="markReady"
      @loadeddata="markReady"
      @canplay="markReady"
      @error="markFailed"
    />
    <img
      v-else
      ref="imageElement"
      v-bind="$attrs"
      :class="mediaClasses"
      :src="src"
      :alt="alt"
      @load="markReady"
      @error="markFailed"
    >
  </div>
</template>
