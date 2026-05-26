import { installCivitaiQueueCtas } from './content/civitai-queue-cta'

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    installCivitaiQueueCtas()
  }, { once: true })
} else {
  installCivitaiQueueCtas()
}
