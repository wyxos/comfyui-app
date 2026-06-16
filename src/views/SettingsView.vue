<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { fetchAppSettings, saveAppSettings } from '../composables/useAppSettings'

type CivitaiSettingsResponse = {
  ok?: boolean
  configured?: boolean
  keyPreview?: string | null
  message?: string
}

const apiKey = ref('')
const savedKeyConfigured = ref(false)
const savedKeyPreview = ref<string | null>(null)
const statusText = ref('Loading Civitai API key settings...')
const loading = ref(false)
const includeNsfwDefault = ref(false)
const blurNsfwContentDefault = ref(true)
const savedIncludeNsfwDefault = ref(false)
const savedBlurNsfwContentDefault = ref(true)
const atlasUrl = ref('')
const atlasApiKey = ref('')
const savedAtlasUrl = ref('')
const atlasKeyConfigured = ref(false)
const atlasKeyPreview = ref<string | null>(null)
const appSettingsLoading = ref(false)
const appSettingsStatusText = ref('Loading app settings...')
const atlasStatusText = ref('Loading Atlas settings...')

const hasSavedKey = computed(() => savedKeyConfigured.value)
const keyPreviewLabel = computed(() =>
  hasSavedKey.value ? savedKeyPreview.value ?? 'Configured' : 'Not configured',
)
const atlasKeyPreviewLabel = computed(() =>
  atlasKeyConfigured.value ? atlasKeyPreview.value ?? 'Configured' : 'Not configured',
)

function applyCivitaiSettings(settings: CivitaiSettingsResponse) {
  savedKeyConfigured.value = Boolean(settings.configured)
  savedKeyPreview.value = typeof settings.keyPreview === 'string' ? settings.keyPreview : null
}

async function parseSettingsResponse(response: Response) {
  const payload = (await response.json().catch(() => null)) as CivitaiSettingsResponse | null

  if (!response.ok || payload?.ok !== true) {
    throw new Error(payload?.message ?? `Settings request failed (${response.status}).`)
  }

  return payload
}

async function loadSavedKey() {
  loading.value = true
  statusText.value = 'Loading Civitai API key settings...'

  try {
    const settings = await parseSettingsResponse(await fetch('/api/settings/civitai'))
    applyCivitaiSettings(settings)
    apiKey.value = ''
    statusText.value = settings.configured
      ? 'Civitai API key loaded from server settings.'
      : 'No Civitai API key saved yet.'
  } catch (error) {
    statusText.value =
      error instanceof Error ? error.message : 'Could not load Civitai API key settings.'
  } finally {
    loading.value = false
  }
}

async function saveKey() {
  const nextKey = apiKey.value.trim()

  if (!nextKey) {
    await clearKey()
    return
  }

  loading.value = true
  statusText.value = 'Saving Civitai API key...'

  try {
    const settings = await parseSettingsResponse(
      await fetch('/api/settings/civitai', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
        },
        body: JSON.stringify({ apiKey: nextKey }),
      }),
    )
    applyCivitaiSettings(settings)
    apiKey.value = ''
    statusText.value = 'Civitai API key saved to this machine.'
  } catch (error) {
    statusText.value =
      error instanceof Error ? error.message : 'Could not save Civitai API key settings.'
  } finally {
    loading.value = false
  }
}

async function clearKey() {
  loading.value = true
  statusText.value = 'Clearing Civitai API key...'

  try {
    const settings = await parseSettingsResponse(
      await fetch('/api/settings/civitai', {
        method: 'DELETE',
      }),
    )
    applyCivitaiSettings(settings)
    statusText.value = 'Civitai API key cleared from this machine.'
  } catch (error) {
    statusText.value =
      error instanceof Error ? error.message : 'Could not clear Civitai API key settings.'
  } finally {
    loading.value = false
  }

  apiKey.value = ''
}

async function loadAppSettings() {
  appSettingsLoading.value = true
  appSettingsStatusText.value = 'Loading app settings...'

  try {
    const settings = await fetchAppSettings()
    includeNsfwDefault.value = settings.includeNsfw
    blurNsfwContentDefault.value = settings.blurNsfwContent !== false
    savedIncludeNsfwDefault.value = includeNsfwDefault.value
    savedBlurNsfwContentDefault.value = blurNsfwContentDefault.value
    atlasUrl.value = settings.atlasUrl
    savedAtlasUrl.value = settings.atlasUrl
    atlasKeyConfigured.value = settings.atlasKeyConfigured
    atlasKeyPreview.value = settings.atlasKeyPreview
    appSettingsStatusText.value = appSettingsStatus(settings)
    atlasStatusText.value = atlasSettingsStatus(settings)
  } catch (error) {
    appSettingsStatusText.value =
      error instanceof Error ? error.message : 'Could not load app settings.'
    atlasStatusText.value =
      error instanceof Error ? error.message : 'Could not load Atlas settings.'
  } finally {
    appSettingsLoading.value = false
  }
}

function appSettingsStatus(settings: { includeNsfw: boolean, blurNsfwContent: boolean }) {
  return [
    settings.includeNsfw ? 'NSFW toggles default to on.' : 'NSFW toggles default to off.',
    settings.blurNsfwContent ? 'NSFW content blur is on.' : 'NSFW content blur is off.',
  ].join(' ')
}

function atlasSettingsStatus(settings: { atlasUrl: string, atlasKeyConfigured: boolean }) {
  if (!settings.atlasUrl) {
    return 'Atlas integration is off.'
  }

  return settings.atlasKeyConfigured
    ? 'Atlas integration is on.'
    : 'Atlas URL saved. Atlas API key is not configured.'
}

async function saveContentDefaults() {
  appSettingsLoading.value = true
  appSettingsStatusText.value = 'Saving app settings...'

  try {
    const settings = await saveAppSettings({
      includeNsfw: includeNsfwDefault.value,
      blurNsfwContent: blurNsfwContentDefault.value,
    })
    includeNsfwDefault.value = settings.includeNsfw
    blurNsfwContentDefault.value = settings.blurNsfwContent !== false
    savedIncludeNsfwDefault.value = includeNsfwDefault.value
    savedBlurNsfwContentDefault.value = blurNsfwContentDefault.value
    appSettingsStatusText.value = appSettingsStatus(settings)
  } catch (error) {
    includeNsfwDefault.value = savedIncludeNsfwDefault.value
    blurNsfwContentDefault.value = savedBlurNsfwContentDefault.value
    appSettingsStatusText.value =
      error instanceof Error ? error.message : 'Could not save app settings.'
  } finally {
    appSettingsLoading.value = false
  }
}

async function saveAtlasSettings(options: { clearKey?: boolean } = {}) {
  appSettingsLoading.value = true
  atlasStatusText.value = 'Saving Atlas settings...'

  const nextUrl = atlasUrl.value.trim()
  const nextKey = atlasApiKey.value.trim()
  const payload: {
    includeNsfw: boolean
    blurNsfwContent: boolean
    atlasUrl: string
    atlasApiKey?: string
  } = {
    includeNsfw: includeNsfwDefault.value,
    blurNsfwContent: blurNsfwContentDefault.value,
    atlasUrl: nextUrl,
  }

  if (options.clearKey) {
    payload.atlasApiKey = ''
  } else if (nextKey) {
    payload.atlasApiKey = nextKey
  }

  try {
    const settings = await saveAppSettings(payload)
    atlasUrl.value = settings.atlasUrl
    savedAtlasUrl.value = settings.atlasUrl
    atlasApiKey.value = ''
    atlasKeyConfigured.value = settings.atlasKeyConfigured
    atlasKeyPreview.value = settings.atlasKeyPreview
    atlasStatusText.value = atlasSettingsStatus(settings)
  } catch (error) {
    atlasUrl.value = savedAtlasUrl.value
    atlasStatusText.value =
      error instanceof Error ? error.message : 'Could not save Atlas settings.'
  } finally {
    appSettingsLoading.value = false
  }
}

onMounted(() => {
  void loadSavedKey()
  void loadAppSettings()
})
</script>

<template>
  <main class="h-full overflow-y-auto bg-background text-foreground">
    <div class="mx-auto flex w-full max-w-4xl flex-col gap-5 px-4 py-6 sm:px-6 lg:px-8">
      <header
        class="rounded-md border border-border bg-card px-4 py-4 shadow-[0_18px_60px_rgba(0,0,0,0.18)]"
      >
        <div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div class="space-y-2">
            <p class="text-xs font-semibold uppercase tracking-[0.34em] text-secondary">
              Settings
            </p>
            <h1 class="text-2xl font-semibold tracking-tight text-card-foreground">
              Local Civitai access
            </h1>
            <p class="max-w-2xl text-sm leading-6 text-muted-foreground">
              Store a Civitai API key on this machine. The browser only sends new values to the
              local server; saved secrets stay in disk-backed server settings.
            </p>
          </div>

          <div
            class="rounded-md border px-3 py-2 text-sm"
            :class="
              hasSavedKey
                ? 'border-secondary/50 bg-secondary/10 text-secondary'
                : 'border-border bg-muted text-muted-foreground'
            "
          >
            {{ keyPreviewLabel }}
          </div>
        </div>
      </header>

      <section class="rounded-md border border-border bg-card p-4 shadow-sm">
        <form class="grid gap-4" @submit.prevent="saveKey">
          <label class="grid gap-2 text-sm">
            <span class="font-medium text-card-foreground">Civitai API key</span>
            <input
              v-model="apiKey"
              type="password"
              autocomplete="off"
              spellcheck="false"
              :disabled="loading"
              class="h-10 rounded-md border border-input bg-background px-3 text-sm text-card-foreground outline-none transition placeholder:text-muted-foreground focus:border-accent focus:ring-2 focus:ring-ring/25"
              placeholder="Paste API key to save or replace"
            />
          </label>

          <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p class="text-sm text-muted-foreground" role="status" aria-live="polite">
              {{ statusText }}
            </p>

            <div class="flex gap-2">
              <button
                type="button"
                class="inline-flex h-9 items-center rounded-md border border-border bg-background px-3 text-sm font-semibold text-card-foreground transition hover:border-destructive/50 hover:text-destructive focus:outline-none focus:ring-2 focus:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-60"
                :disabled="loading || !hasSavedKey"
                @click="clearKey"
              >
                Clear
              </button>
              <button
                type="submit"
                class="inline-flex h-9 items-center rounded-md border border-secondary bg-secondary px-3 text-sm font-semibold text-secondary-foreground shadow-[0_0_0_1px_rgba(255,198,0,0.22)] transition hover:bg-secondary/90 focus:outline-none focus:ring-2 focus:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-60"
                :disabled="loading"
              >
                {{ loading ? 'Working...' : 'Save' }}
              </button>
            </div>
          </div>
        </form>
      </section>

      <section class="rounded-md border border-border bg-card p-4 shadow-sm">
        <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div class="min-w-0">
            <h2 class="text-base font-semibold text-card-foreground">
              Content defaults
            </h2>
            <p class="mt-1 text-sm text-muted-foreground" role="status" aria-live="polite">
              {{ appSettingsStatusText }}
            </p>
          </div>

          <label class="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-background px-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground transition hover:border-secondary/55 hover:text-foreground">
            <input
              v-model="includeNsfwDefault"
              class="h-4 w-4 accent-secondary"
              type="checkbox"
              :disabled="appSettingsLoading"
              aria-label="Default NSFW toggles on"
              @change="saveContentDefaults"
            />
            NSFW
          </label>

          <label class="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-background px-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground transition hover:border-secondary/55 hover:text-foreground">
            <input
              v-model="blurNsfwContentDefault"
              class="h-4 w-4 accent-secondary"
              type="checkbox"
              :disabled="appSettingsLoading"
              aria-label="Blur visible NSFW content"
              @change="saveContentDefaults"
            />
            Blur NSFW
          </label>
        </div>
      </section>

      <section class="rounded-md border border-border bg-card p-4 shadow-sm">
        <form class="grid gap-4" @submit.prevent="saveAtlasSettings()">
          <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div class="min-w-0">
              <h2 class="text-base font-semibold text-card-foreground">
                Atlas integration
              </h2>
              <p class="mt-1 text-sm text-muted-foreground" role="status" aria-live="polite">
                {{ atlasStatusText }}
              </p>
            </div>

            <div
              class="rounded-md border px-3 py-2 text-sm"
              :class="
                atlasKeyConfigured
                  ? 'border-secondary/50 bg-secondary/10 text-secondary'
                  : 'border-border bg-muted text-muted-foreground'
              "
            >
              {{ atlasKeyPreviewLabel }}
            </div>
          </div>

          <label class="grid gap-2 text-sm">
            <span class="font-medium text-card-foreground">Atlas URL</span>
            <input
              v-model="atlasUrl"
              type="text"
              autocomplete="url"
              spellcheck="false"
              :disabled="appSettingsLoading"
              class="h-10 rounded-md border border-input bg-background px-3 text-sm text-card-foreground outline-none transition placeholder:text-muted-foreground focus:border-accent focus:ring-2 focus:ring-ring/25"
              placeholder="https://atlas.example.test"
            />
          </label>

          <label class="grid gap-2 text-sm">
            <span class="font-medium text-card-foreground">Atlas API key</span>
            <input
              v-model="atlasApiKey"
              type="password"
              autocomplete="off"
              spellcheck="false"
              :disabled="appSettingsLoading"
              class="h-10 rounded-md border border-input bg-background px-3 text-sm text-card-foreground outline-none transition placeholder:text-muted-foreground focus:border-accent focus:ring-2 focus:ring-ring/25"
              placeholder="Paste API key to save or replace"
            />
          </label>

          <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
            <button
              type="button"
              class="inline-flex h-9 items-center rounded-md border border-border bg-background px-3 text-sm font-semibold text-card-foreground transition hover:border-destructive/50 hover:text-destructive focus:outline-none focus:ring-2 focus:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-60"
              :disabled="appSettingsLoading || !atlasKeyConfigured"
              @click="saveAtlasSettings({ clearKey: true })"
            >
              Clear key
            </button>
            <button
              type="submit"
              class="inline-flex h-9 items-center rounded-md border border-secondary bg-secondary px-3 text-sm font-semibold text-secondary-foreground shadow-[0_0_0_1px_rgba(255,198,0,0.22)] transition hover:bg-secondary/90 focus:outline-none focus:ring-2 focus:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-60"
              :disabled="appSettingsLoading"
            >
              {{ appSettingsLoading ? 'Working...' : 'Save Atlas' }}
            </button>
          </div>
        </form>
      </section>

      <aside class="rounded-md border border-secondary/30 bg-secondary/10 px-4 py-3 text-sm leading-6">
        <p class="font-medium text-secondary">Privacy boundary</p>
        <p class="mt-1 text-muted-foreground">
          Saved keys live in the local server's user config directory, or the directory set
          by <code class="rounded-sm bg-background px-1 py-0 text-xs text-card-foreground">
            COMFY_COMPANION_CONFIG_DIR
          </code>. The settings API returns only whether each key is configured plus a masked preview;
          the Civitai and Atlas proxies attach keys server-side when present.
        </p>
      </aside>
    </div>
  </main>
</template>
