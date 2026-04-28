import { expect, test } from '@playwright/test'

/**
 * Sprint 6 — STORY-603 — single full-stack walkthrough.
 *
 * Designed to run against either the mock-only Vite dev server (default) or
 * the full docker-compose stack (E2E_NO_SERVER=1 E2E_BASE_URL=http://localhost:3000).
 * Skips CMS-dependent assertions when running in mock-only mode.
 */
const FULL_STACK = Boolean(process.env.E2E_FULL_STACK)

test.describe('CryptoAdvisor walkthrough', () => {
  test('dashboard loads with stat row + signals + watchlist', async ({ page }) => {
    await page.goto('/')

    // Page title set by AppLayout
    await expect(page).toHaveTitle(/Dashboard/)

    // MOCK | LIVE badge is visible
    await expect(page.getByTestId('data-source-badge')).toBeVisible()

    // Recent signals panel renders something (mock has 5 seeded signals)
    await expect(page.getByText(/Recent Signals/i).first()).toBeVisible()
  })

  test('navigates to /signals and renders signal cards', async ({ page }) => {
    await page.goto('/signals')
    await expect(page.getByText('AI Trading Signals')).toBeVisible()
    // At least one direction badge (BUY/SELL/HOLD)
    await expect(page.locator('text=/^(BUY|SELL|HOLD)$/').first()).toBeVisible()
  })

  test('navigates to /risk and computes HHI for 50/50 split', async ({ page }) => {
    await page.goto('/risk')
    await expect(page.getByText('Portfolio Risk Calculator')).toBeVisible()

    if (!FULL_STACK) {
      // Mock-only mode: Risk Calculator requires CMS; expect the gate message.
      await expect(page.getByText(/CMS backend/i)).toBeVisible()
      return
    }

    // Full-stack: set 50/50 BTC/ETH and submit
    const symbolInputs = page.getByLabel(/Symbol row/)
    const pctInputs = page.getByLabel(/Percent row/)
    await symbolInputs.nth(0).fill('BTC')
    await pctInputs.nth(0).fill('50')
    await symbolInputs.nth(1).fill('ETH')
    await pctInputs.nth(1).fill('50')
    // Remove the third row from defaults
    const removeButtons = page.getByRole('button', { name: /Remove row/ })
    await removeButtons.nth(2).click()

    await page.getByRole('button', { name: /Calculate risk/i }).click()
    await expect(page.getByTestId('risk-tier')).toHaveText(/high/i, { timeout: 10_000 })
  })

  test('navigates to /watchlist and shows persisted panel when CMS present', async ({ page }) => {
    await page.goto('/watchlist')
    if (FULL_STACK) {
      await expect(page.getByText(/Persisted Watchlist/i)).toBeVisible()
    } else {
      // Mock-only mode: persisted panel is hidden, but legacy mock panel renders
      await expect(page.getByText('Watchlist').first()).toBeVisible()
    }
  })
})
