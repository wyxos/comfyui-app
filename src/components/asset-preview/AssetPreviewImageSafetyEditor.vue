<script setup lang="ts">
import AssetPreviewSafetyEditor from './AssetPreviewSafetyEditor.vue'

const props = withDefaults(
  defineProps<{
    editable?: boolean
    imageKey?: string
    detectedNsfw?: boolean | null
    overrideNsfw?: boolean | null
    error?: string
    saving?: boolean
  }>(),
  {
    editable: false,
    imageKey: '',
    detectedNsfw: null,
    overrideNsfw: null,
    error: '',
    saving: false,
  },
)

const emit = defineEmits<{
  save: [payload: {
    imageKey: string
    imageNsfw: boolean | null
    imageNsfwOverride: boolean | null
  }]
}>()

function saveImageSafety(payload: { modelNsfw: boolean | null; modelNsfwOverride: boolean | null }) {
  if (!props.imageKey) {
    return
  }

  emit('save', {
    imageKey: props.imageKey,
    imageNsfw: payload.modelNsfw,
    imageNsfwOverride: payload.modelNsfwOverride,
  })
}
</script>

<template>
  <AssetPreviewSafetyEditor
    v-if="editable && imageKey"
    title="Image safety"
    override-label="Image override"
    group-label="Image safety override"
    save-aria-label="Save image safety override"
    original-aria-label="Use original image safety metadata"
    safe-aria-label="Mark image safe"
    nsfw-aria-label="Mark image NSFW"
    :model-nsfw="detectedNsfw"
    :model-nsfw-override="overrideNsfw"
    :error="error"
    :saving="saving"
    @save="saveImageSafety"
  />
</template>
