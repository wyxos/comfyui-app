import { onBeforeUnmount } from 'vue'

type AssetDownloadSubscriptionOptions = {
  autoStart?: boolean
}

export function useAssetDownloadSubscription(
  subscribe: () => void,
  unsubscribe: () => void,
  { autoStart = true }: AssetDownloadSubscriptionOptions = {},
) {
  let subscribed = false
  const start = () => {
    if (subscribed) {
      return
    }

    subscribe()
    subscribed = true
  }
  const stop = () => {
    if (!subscribed) {
      return
    }

    unsubscribe()
    subscribed = false
  }

  if (autoStart) {
    start()
  }

  onBeforeUnmount(() => {
    stop()
  })

  return {
    start,
    stop,
  }
}
