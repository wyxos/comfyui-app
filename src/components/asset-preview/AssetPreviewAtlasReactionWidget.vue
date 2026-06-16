<script setup lang="ts">
import { Ban, ExternalLink, Heart, LoaderCircle, Smile, ThumbsUp, Trash2 } from 'lucide-vue-next'

import type { AtlasMediaStatus } from './assetPreviewTypes'
import type { AtlasReactionType } from './assetPreviewAtlasMedia'

const props = withDefaults(defineProps<{
  status?: AtlasMediaStatus | null
  pending?: boolean
  deleting?: boolean
  atlasFileUrl?: string
  compact?: boolean
}>(), {
  status: null,
  pending: false,
  deleting: false,
  atlasFileUrl: '',
  compact: false,
})

const emit = defineEmits<{
  react: [type: AtlasReactionType]
  delete: []
}>()

const reactions: Array<{
  type: AtlasReactionType
  label: string
  activeClass: string
  inactiveClass: string
  icon: typeof Heart
}> = [
  {
    type: 'love',
    label: 'Favorite in Atlas',
    activeClass: 'bg-red-500 text-white',
    inactiveClass: 'text-muted-foreground hover:border-red-400 hover:text-red-400',
    icon: Heart,
  },
  {
    type: 'like',
    label: 'Like in Atlas',
    activeClass: 'bg-secondary text-secondary-foreground',
    inactiveClass: 'text-muted-foreground hover:border-secondary hover:text-secondary',
    icon: ThumbsUp,
  },
  {
    type: 'blacklist',
    label: 'Blacklist in Atlas',
    activeClass: 'bg-destructive text-destructive-foreground',
    inactiveClass: 'text-muted-foreground hover:border-destructive hover:text-destructive',
    icon: Ban,
  },
  {
    type: 'funny',
    label: 'Funny in Atlas',
    activeClass: 'bg-yellow-500 text-white',
    inactiveClass: 'text-muted-foreground hover:border-yellow-400 hover:text-yellow-500',
    icon: Smile,
  },
]

function isActive(type: AtlasReactionType) {
  if (type === 'blacklist') {
    return props.status?.blacklisted === true || Boolean(props.status?.blacklisted_at)
  }

  return props.status?.reaction === type
}

function handleClick(type: AtlasReactionType, event: MouseEvent) {
  emit('react', type)
  if (event.detail > 0) {
    ;(event.currentTarget as HTMLButtonElement | null)?.blur()
  }
}

function canDeleteFile() {
  return props.status?.exists === true && Boolean(props.status.file_id)
}

function handleDeleteClick(event: MouseEvent) {
  emit('delete')
  if (event.detail > 0) {
    ;(event.currentTarget as HTMLButtonElement | null)?.blur()
  }
}
</script>

<template>
  <div
    class="inline-flex items-center justify-center rounded-md border border-border bg-card/95 shadow-sm"
    :class="compact ? 'flex-nowrap gap-0.5 px-0.5 py-1' : 'flex-wrap gap-1.5 p-1.5'"
    @click.stop
    @dblclick.stop
    @mousedown.stop
    @contextmenu.stop
    @auxclick.stop
  >
    <button
      v-for="reaction in reactions"
      :key="reaction.type"
      type="button"
      data-test="asset-preview-atlas-reaction-button"
      class="inline-flex items-center justify-center rounded-md border border-transparent transition focus:outline-none focus:ring-2 focus:ring-ring/25 disabled:cursor-wait disabled:opacity-65"
      :class="[
        compact ? 'h-6 w-6' : 'h-8 w-8',
        isActive(reaction.type) ? reaction.activeClass : reaction.inactiveClass,
      ]"
      :aria-label="reaction.label"
      :aria-pressed="isActive(reaction.type)"
      :disabled="pending || deleting"
      @click="handleClick(reaction.type, $event)"
    >
      <component
        :is="reaction.icon"
        :class="compact ? 'h-3 w-3' : 'h-4 w-4'"
      />
    </button>
    <a
      v-if="atlasFileUrl"
      :href="atlasFileUrl"
      target="_blank"
      rel="noreferrer"
      class="inline-flex items-center justify-center rounded-md border border-transparent text-muted-foreground transition hover:border-secondary hover:text-secondary focus:outline-none focus:ring-2 focus:ring-ring/25"
      :class="compact ? 'h-6 w-6' : 'h-8 w-8'"
      aria-label="Open file in Atlas"
      title="Open file in Atlas"
      @click.stop
      @mousedown.stop
      @dblclick.stop
    >
      <ExternalLink :class="compact ? 'h-3 w-3' : 'h-4 w-4'" />
    </a>
    <button
      v-if="canDeleteFile()"
      type="button"
      class="inline-flex items-center justify-center rounded-md border border-transparent text-muted-foreground transition hover:border-destructive hover:text-destructive focus:outline-none focus:ring-2 focus:ring-ring/25 disabled:cursor-wait disabled:opacity-65"
      :class="compact ? 'h-6 w-6' : 'h-8 w-8'"
      :disabled="pending || deleting"
      aria-label="Delete downloaded file from Atlas"
      title="Delete downloaded file from Atlas"
      @click="handleDeleteClick"
    >
      <LoaderCircle
        v-if="deleting"
        :class="compact ? 'h-3 w-3 animate-spin' : 'h-4 w-4 animate-spin'"
      />
      <Trash2
        v-else
        :class="compact ? 'h-3 w-3' : 'h-4 w-4'"
      />
    </button>
  </div>
</template>
