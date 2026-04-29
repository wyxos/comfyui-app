import { playwright } from '@vitest/browser-playwright'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: 'coverage',
      include: ['src/**/*.{ts,vue}', 'server/**/*.mjs'],
      exclude: ['src/main.ts', 'src/assets/**', 'tests/**'],
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'node',
          include: ['tests/unit/**/*.{test,spec}.ts'],
          setupFiles: ['./tests/setup/unit.ts'],
          globals: true,
        },
      },
      {
        extends: true,
        test: {
          name: 'e2e',
          include: ['tests/e2e/**/*.{test,spec}.ts'],
          setupFiles: ['./tests/setup/e2e.ts'],
          testTimeout: 15000,
          browser: {
            enabled: true,
            headless: true,
            provider: playwright({
              launchOptions: {
                channel: 'chromium',
              },
              actionTimeout: 5000,
            }),
            instances: [{ browser: 'chromium' }],
            viewport: {
              width: 1280,
              height: 900,
            },
          },
        },
      },
    ],
  },
})
