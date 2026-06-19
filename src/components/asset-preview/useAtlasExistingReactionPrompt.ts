import { onBeforeUnmount, ref } from 'vue'

export type AtlasExistingReactionChoice = 'react' | 'redownload' | 'cancel'

export function useAtlasExistingReactionPrompt() {
  const open = ref(false)
  let pendingPrompt: Promise<AtlasExistingReactionChoice> | null = null
  let resolveChoice: ((choice: AtlasExistingReactionChoice) => void) | null = null

  function finish(choice: AtlasExistingReactionChoice) {
    const resolver = resolveChoice
    resolveChoice = null
    pendingPrompt = null
    open.value = false
    resolver?.(choice)
  }

  function prompt() {
    if (pendingPrompt !== null) {
      return pendingPrompt
    }

    open.value = true
    pendingPrompt = new Promise<AtlasExistingReactionChoice>((resolve) => {
      resolveChoice = resolve
    })

    return pendingPrompt
  }

  function chooseReact() {
    finish('react')
  }

  function chooseRedownload() {
    finish('redownload')
  }

  function close() {
    finish('cancel')
  }

  function setOpen(value: boolean) {
    if (!value) {
      close()
    }
  }

  onBeforeUnmount(() => {
    if (resolveChoice !== null) {
      finish('cancel')
    }
  })

  return {
    data: { open },
    prompt,
    chooseReact,
    chooseRedownload,
    close,
    setOpen,
  }
}
