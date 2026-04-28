import { defineConfig, devices } from '@playwright/test'

const PORT = process.env.E2E_PORT ?? '5173'
const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // single shared dev server
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? [['html', { open: 'never' }], ['github']] : 'list',

  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: process.env.E2E_NO_SERVER
    ? undefined
    : {
        // Default: spin up the Vite dev server with mock data (no CMS dependency).
        // For full-stack E2E, run `docker compose up -d` first and set
        // E2E_NO_SERVER=1 + E2E_BASE_URL=http://localhost:3000.
        command: 'npm run dev -- --port 5173 --strictPort',
        url: BASE_URL,
        timeout: 90_000,
        reuseExistingServer: !process.env.CI,
      },
})
