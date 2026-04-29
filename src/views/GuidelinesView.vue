<script setup lang="ts">
const palette = [
  {
    name: 'Primary',
    hex: '#001B2E',
    role: 'Main surfaces, headings, primary actions, strong contrast anchors',
    textClass: 'text-primary-foreground',
  },
  {
    name: 'Canvas',
    hex: '#F0F7F4',
    role: 'App background, cards, sheets, quiet sections',
    textClass: 'text-primary',
  },
  {
    name: 'Accent',
    hex: '#0090C1',
    role: 'Interactive highlights, links, active states, rings',
    textClass: 'text-primary-foreground',
  },
  {
    name: 'Secondary',
    hex: '#FFC300',
    role: 'Secondary emphasis, warnings, spotlight moments, key counters',
    textClass: 'text-primary',
  },
  {
    name: 'Destructive',
    hex: '#DD1C1A',
    role: 'Errors, destructive actions, critical alerts',
    textClass: 'text-primary-foreground',
  },
]

const principles = [
  'Use shadcn-style structure: restrained cards, clean borders, measured spacing, no ornamental chrome.',
  'General roundness stays small or medium. Rounded-sm and rounded-md are the system. Larger radii are not part of the design target.',
  'Anchor the product in deep navy and off-white. Yellow is a deliberate highlight, not a general-purpose background.',
  'Prefer one loud color decision at a time. Blue for interaction, yellow for emphasis, red only for destructive meaning.',
  'Keep controls dense enough for workflow tools. This should feel precise, not soft or toy-like.',
]

const componentNotes = [
  {
    title: 'Buttons',
    note: 'Primary buttons use navy fills. Secondary buttons use yellow fills sparingly. Outline buttons stay light with navy text.',
  },
  {
    title: 'Cards and sheets',
    note: 'Use off-white surfaces with navy borders and subtle shadows. Keep radii at rounded-md, with rounded-sm for tighter elements.',
  },
  {
    title: 'Inputs',
    note: 'Inputs should stay neutral and readable. Blue is for focus rings, never permanent fill. Keep labels explicit and close.',
  },
  {
    title: 'Alerts and status',
    note: 'Use yellow for attention, blue for active progress, red only for failure or destructive operations.',
  },
]
</script>

<template>
  <main class="h-full overflow-y-auto bg-background text-foreground">
    <div class="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-6 sm:px-6 lg:px-8">
      <header
        class="rounded-md border border-border bg-primary px-4 py-4 text-primary-foreground shadow-[0_18px_60px_rgba(0,27,46,0.18)]"
      >
        <div class="mb-4 flex items-center justify-between gap-4">
          <router-link
            to="/"
            class="inline-flex items-center rounded-md border border-primary-foreground/15 bg-primary-foreground/6 px-1 py-0 text-sm font-medium text-primary-foreground transition hover:bg-primary-foreground/10"
          >
            Back to app
          </router-link>
          <p class="text-xs font-semibold uppercase tracking-[0.35em] text-secondary">
            /guidelines
          </p>
        </div>

        <div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div class="max-w-3xl space-y-3">
            <p class="text-xs font-semibold uppercase tracking-[0.35em] text-secondary">
              UI Guidelines
            </p>
            <h1 class="text-3xl font-semibold tracking-tight sm:text-4xl">
              Comfy Companion design system direction
            </h1>
            <p class="max-w-2xl text-sm leading-7 text-primary-foreground/80 sm:text-base">
              This route is the baseline reference for the app shell and future workflow UI.
              It is intentionally shadcn-oriented, compact, and color-disciplined.
            </p>
          </div>

          <div
            class="grid gap-3 rounded-md border border-primary-foreground/15 bg-primary-foreground/6 p-2 text-sm sm:grid-cols-2"
          >
            <div>
              <p class="text-xs uppercase tracking-[0.24em] text-primary-foreground/60">Primary</p>
              <p class="font-medium text-secondary">#001B2E</p>
            </div>
            <div>
              <p class="text-xs uppercase tracking-[0.24em] text-primary-foreground/60">Secondary</p>
              <p class="font-medium text-secondary">#FFC300</p>
            </div>
            <div>
              <p class="text-xs uppercase tracking-[0.24em] text-primary-foreground/60">Roundness</p>
              <p class="font-medium">small or medium</p>
            </div>
            <div>
              <p class="text-xs uppercase tracking-[0.24em] text-primary-foreground/60">Component style</p>
              <p class="font-medium">shadcn-vue conventions</p>
            </div>
          </div>
        </div>
      </header>

      <section class="grid gap-8 lg:grid-cols-[1.15fr_0.85fr]">
        <article class="rounded-md border border-border bg-card p-4 shadow-sm">
          <div class="mb-5 space-y-2">
            <h2 class="text-xl font-semibold tracking-tight text-card-foreground">Palette</h2>
            <p class="max-w-2xl text-sm leading-7 text-muted-foreground">
              `#001B2E` is the anchor color. `#FFC300` is the supporting emphasis color.
              The rest of the palette exists to support legibility and workflow feedback.
            </p>
          </div>

          <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <article
              v-for="swatch in palette"
              :key="swatch.name"
              class="overflow-hidden rounded-md border border-border bg-card"
            >
              <div
                class="flex h-28 items-end justify-between px-2 py-1"
                :class="swatch.textClass"
                :style="{ backgroundColor: swatch.hex }"
              >
                <p class="text-sm font-semibold">{{ swatch.name }}</p>
                <p class="text-xs font-medium uppercase tracking-[0.2em]">
                  {{ swatch.hex }}
                </p>
              </div>
              <div class="space-y-2 px-2 py-2">
                <p class="text-xs uppercase tracking-[0.24em] text-muted-foreground">Usage</p>
                <p class="text-sm leading-6 text-card-foreground">
                  {{ swatch.role }}
                </p>
              </div>
            </article>
          </div>
        </article>

        <aside class="space-y-8">
          <section class="rounded-md border border-border bg-card p-4 shadow-sm">
            <h2 class="text-xl font-semibold tracking-tight text-card-foreground">Core rules</h2>
            <ul class="mt-4 space-y-3">
              <li
                v-for="principle in principles"
                :key="principle"
                class="rounded-md border border-border bg-muted px-2 py-1 text-sm leading-6 text-muted-foreground"
              >
                {{ principle }}
              </li>
            </ul>
          </section>

          <section class="rounded-md border border-border bg-card p-4 shadow-sm">
            <h2 class="text-xl font-semibold tracking-tight text-card-foreground">Radius scale</h2>
            <div class="mt-5 grid gap-4 sm:grid-cols-3">
              <div class="space-y-3">
                <div class="h-20 rounded-sm border border-border bg-primary/95"></div>
                <div>
                  <p class="text-sm font-medium text-card-foreground">rounded-sm</p>
                  <p class="text-xs text-muted-foreground">micro chips only</p>
                </div>
              </div>
              <div class="space-y-3">
                <div class="h-20 rounded-md border border-border bg-accent"></div>
                <div>
                  <p class="text-sm font-medium text-card-foreground">rounded-md</p>
                  <p class="text-xs text-muted-foreground">main system radius</p>
                </div>
              </div>
              <div class="space-y-3">
                <div class="h-20 rounded-md border border-border bg-secondary"></div>
                <div>
                  <p class="text-sm font-medium text-card-foreground">rounded-md</p>
                  <p class="text-xs text-muted-foreground">panels stay in the same radius family</p>
                </div>
              </div>
            </div>
          </section>
        </aside>
      </section>

      <section class="rounded-md border border-border bg-card p-4 shadow-sm">
        <div class="mb-6 flex flex-col gap-2">
          <h2 class="text-xl font-semibold tracking-tight text-card-foreground">Component direction</h2>
          <p class="max-w-3xl text-sm leading-7 text-muted-foreground">
            These examples are not production components yet. They are visual targets for future
            shadcn-vue components and wrappers.
          </p>
        </div>

        <div class="grid gap-6 xl:grid-cols-[1fr_1fr]">
          <div class="rounded-md border border-border bg-background p-3">
            <p class="mb-4 text-xs font-semibold uppercase tracking-[0.28em] text-muted-foreground">
              Buttons
            </p>
            <div class="flex flex-wrap gap-3">
              <button
                class="inline-flex items-center rounded-md bg-primary px-2 py-0.5 text-sm font-medium text-primary-foreground shadow-sm transition hover:bg-primary/92"
              >
                Primary action
              </button>
              <button
                class="inline-flex items-center rounded-md bg-secondary px-2 py-0.5 text-sm font-medium text-secondary-foreground shadow-sm transition hover:bg-secondary/90"
              >
                Secondary action
              </button>
              <button
                class="inline-flex items-center rounded-md border border-border bg-card px-2 py-0.5 text-sm font-medium text-card-foreground transition hover:border-accent hover:text-accent"
              >
                Outline
              </button>
              <button
                class="inline-flex items-center rounded-md border border-destructive/20 bg-destructive px-2 py-0.5 text-sm font-medium text-destructive-foreground shadow-sm transition hover:bg-destructive/92"
              >
                Destructive
              </button>
            </div>
          </div>

          <div class="rounded-md border border-border bg-background p-3">
            <p class="mb-4 text-xs font-semibold uppercase tracking-[0.28em] text-muted-foreground">
              Inputs
            </p>
            <div class="space-y-4">
              <label class="grid gap-2 text-sm">
                <span class="font-medium text-card-foreground">Prompt</span>
                <textarea
                  rows="4"
                  class="min-h-28 rounded-md border border-input bg-card px-1 py-0.5 text-sm text-card-foreground outline-none ring-0 transition placeholder:text-muted-foreground focus:border-accent focus:ring-2 focus:ring-ring/25"
                  placeholder="Workflow-friendly prompt input"
                />
              </label>

              <div class="grid gap-4 sm:grid-cols-2">
                <label class="grid gap-2 text-sm">
                  <span class="font-medium text-card-foreground">Width</span>
                  <input
                    class="rounded-md border border-input bg-card px-1 py-0 text-sm text-card-foreground outline-none transition placeholder:text-muted-foreground focus:border-accent focus:ring-2 focus:ring-ring/25"
                    value="1024"
                  />
                </label>
                <label class="grid gap-2 text-sm">
                  <span class="font-medium text-card-foreground">Height</span>
                  <input
                    class="rounded-md border border-input bg-card px-1 py-0 text-sm text-card-foreground outline-none transition placeholder:text-muted-foreground focus:border-accent focus:ring-2 focus:ring-ring/25"
                    value="1024"
                  />
                </label>
              </div>
            </div>
          </div>

          <div class="rounded-md border border-border bg-background p-3">
            <p class="mb-4 text-xs font-semibold uppercase tracking-[0.28em] text-muted-foreground">
              Status and badges
            </p>
            <div class="flex flex-wrap gap-3">
              <span class="rounded-sm bg-primary px-0.5 py-0 text-xs font-medium text-primary-foreground">
                Ready
              </span>
              <span class="rounded-sm bg-accent px-0.5 py-0 text-xs font-medium text-accent-foreground">
                Running
              </span>
              <span class="rounded-sm bg-secondary px-0.5 py-0 text-xs font-medium text-secondary-foreground">
                Attention
              </span>
              <span class="rounded-sm bg-destructive px-0.5 py-0 text-xs font-medium text-destructive-foreground">
                Error
              </span>
            </div>
          </div>

          <div class="rounded-md border border-border bg-background p-3">
            <p class="mb-4 text-xs font-semibold uppercase tracking-[0.28em] text-muted-foreground">
              Alert treatment
            </p>
            <div class="space-y-4">
              <div class="rounded-md border border-secondary/40 bg-secondary/12 px-2 py-1">
                <p class="text-sm font-medium text-card-foreground">Use yellow for attention, not panic.</p>
                <p class="mt-1 text-sm text-muted-foreground">
                  Good for warnings, incomplete setup, or “review before run.”
                </p>
              </div>
              <div class="rounded-md border border-destructive/25 bg-destructive/10 px-2 py-1">
                <p class="text-sm font-medium text-card-foreground">Reserve red for real failure.</p>
                <p class="mt-1 text-sm text-muted-foreground">
                  Good for model load errors, destructive confirmations, or broken workflow execution.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section class="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <article class="rounded-md border border-border bg-card p-4 shadow-sm">
          <h2 class="text-xl font-semibold tracking-tight text-card-foreground">Usage notes</h2>
          <div class="mt-5 space-y-4">
            <article
              v-for="item in componentNotes"
              :key="item.title"
              class="rounded-md border border-border bg-muted px-2 py-2"
            >
              <h3 class="text-sm font-semibold text-card-foreground">{{ item.title }}</h3>
              <p class="mt-1 text-sm leading-6 text-muted-foreground">
                {{ item.note }}
              </p>
            </article>
          </div>
        </article>

        <article class="rounded-md border border-border bg-primary p-4 text-primary-foreground shadow-sm">
          <div class="space-y-3">
            <p class="text-xs font-semibold uppercase tracking-[0.3em] text-secondary">
              Reference summary
            </p>
            <h2 class="text-xl font-semibold tracking-tight">Do this consistently</h2>
            <ul class="space-y-3 text-sm leading-6 text-primary-foreground/80">
              <li>Use navy-first layouts with off-white surfaces nested inside.</li>
              <li>Use yellow to highlight what matters, not to carry whole sections.</li>
              <li>Let blue carry interaction and focus states.</li>
              <li>Prefer border definition over large drop shadows.</li>
              <li>Keep the UI operational and compact enough for tool-heavy workflows.</li>
            </ul>
          </div>
        </article>
      </section>
    </div>
  </main>
</template>
