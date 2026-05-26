import { handleQueueRuntimeMessage } from './background/queue-runtime'

type RuntimeMessageSender = {
  tab?: {
    url?: string
  }
}

type RuntimeOnMessage = {
  addListener(
    callback: (
      message: unknown,
      sender: RuntimeMessageSender,
      sendResponse: (response?: unknown) => void,
    ) => boolean | void,
  ): void
}

declare const chrome: {
  runtime?: {
    onMessage?: RuntimeOnMessage
  }
}

chrome.runtime?.onMessage?.addListener((message, sender, sendResponse) => {
  if (handleQueueRuntimeMessage(message, sender, sendResponse)) {
    return true
  }

  return false
})
