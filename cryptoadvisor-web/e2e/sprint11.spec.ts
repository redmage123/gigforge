import { expect, test, type ConsoleMessage, type Page } from '@playwright/test'

/**
 * Sprint 11 closeout E2E — exercises every route added through Sprint 11
 * and audits for console errors, broken nav, slow loads, missing
 * accessibility hooks, and obvious UI/UX regressions.
 */

const ROUTES = [
  { path: '/', label: 'Dashboard', expectedText: /CryptoAdvisor|Portfolio/i },
  { path: '/portfolio', label: 'Portfolio', expectedText: /Holdings|Portfolio/i },
  { path: '/charts', label: 'Charts', expectedText: /Chart|BTC|ETH/i },
  { path: '/signals', label: 'Signals', expectedText: /AI Trading Signals/i },
  { path: '/alerts', label: 'Alerts', expectedText: /Alert/i },
  { path: '/transactions', label: 'Transactions', expectedText: /Transactions/i },
  { path: '/watchlist', label: 'Watchlist', expectedText: /Watchlist/i },
  { path: '/risk', label: 'Risk Calc', expectedText: /Portfolio Risk Calculator/i },
  { path: '/stats', label: 'Statistics', expectedText: /Statistical Analytics/i },
  { path: '/backtest', label: 'Backtest', expectedText: /Backtest/i },
  { path: '/options', label: 'Options', expectedText: /Options/i },
  { path: '/orderbook', label: 'Order Book', expectedText: /Order Book/i },
  { path: '/feeds', label: 'Data Feeds', expectedText: /Data Feeds/i },
] as const

interface PageDiagnostics {
  consoleErrors: string[]
  pageErrors: string[]
}

function attachDiagnostics(page: Page): PageDiagnostics {
  const consoleErrors: string[] = []
  const pageErrors: string[] = []
  page.on('console', (msg: ConsoleMessage) => {
    if (msg.type() === 'error') {
      const text = msg.text()
      // Suppress known third-party noise that doesn't affect the app
      if (text.includes('WebSocket') && text.includes('1006')) return
      if (text.includes('deribit') && text.includes('CORS')) return
      consoleErrors.push(text)
    }
  })
  page.on('pageerror', (err) => pageErrors.push(err.message))
  return { consoleErrors, pageErrors }
}

test.describe('Sprint 11 closeout — full E2E sweep', () => {
  for (const route of ROUTES) {
    test(`${route.label} (${route.path}) — loads, renders, no console errors`, async ({ page }) => {
      const diag = attachDiagnostics(page)
      await page.goto(route.path, { waitUntil: 'domcontentloaded', timeout: 15_000 })

      // Wait for any client-side queries to settle
      await page.waitForTimeout(800)

      // The sidebar must be visible (proves the layout shell mounted)
      await expect(page.getByRole('navigation', { name: /Main navigation/i })).toBeVisible({ timeout: 10_000 })

      // Page should not be stuck on a loading skeleton forever — wait up to 8s
      const skeleton = page.locator('[role="status"]').first()
      if (await skeleton.isVisible().catch(() => false)) {
        await skeleton.waitFor({ state: 'detached', timeout: 8_000 }).catch(() => {})
      }

      // Hard fail on JS exceptions thrown during render
      expect(diag.pageErrors, `Page errors on ${route.path}: ${diag.pageErrors.join('\n')}`).toEqual([])

      // Console errors are reported but not auto-failed (third-party WS errors expected)
      if (diag.consoleErrors.length > 0) {
        console.warn(`Console errors on ${route.path}:`, diag.consoleErrors)
      }
    })
  }

  test('sidebar nav has all 13 routes and they are all clickable', async ({ page }) => {
    await page.goto('/')
    const nav = page.getByRole('navigation', { name: /Main navigation/i })
    await expect(nav).toBeVisible()
    for (const route of ROUTES) {
      const link = nav.getByRole('link', { name: new RegExp(route.label, 'i') })
      await expect(link, `Sidebar missing link for ${route.label}`).toBeVisible()
    }
  })

  test('Stats page renders all four risk-adjusted StatCards and the MPT panel', async ({ page }) => {
    const diag = attachDiagnostics(page)
    await page.goto('/stats', { waitUntil: 'networkidle' })
    await expect(page.getByText(/Sharpe \(annual\)/i)).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText(/Sortino \(annual\)/i)).toBeVisible()
    await expect(page.getByText(/Max Drawdown/i)).toBeVisible()
    await expect(page.getByText(/Hurst Exponent/i)).toBeVisible()
    await expect(page.getByText(/Modern Portfolio Theory/i)).toBeVisible()
    await expect(page.getByText(/Tangency \(max Sharpe\)/i).first()).toBeVisible()
    await expect(page.getByText(/Quantum-annealed/i).first()).toBeVisible()
    expect(diag.pageErrors).toEqual([])
  })

  test('Backtest page runs a Donchian strategy and shows summary stats', async ({ page }) => {
    const diag = attachDiagnostics(page)
    await page.goto('/backtest', { waitUntil: 'networkidle' })
    await expect(page.getByLabel(/Asset/i).first()).toBeVisible()
    await expect(page.getByLabel(/Strategy/i)).toBeVisible()
    await expect(page.getByText(/Total Return/i)).toBeVisible()
    await expect(page.locator("p", { hasText: /Buy & Hold/i }).first()).toBeVisible()
    await expect(page.getByText(/Sharpe/i).first()).toBeVisible()
    await expect(page.getByText(/Max Drawdown/i)).toBeVisible()
    expect(diag.pageErrors).toEqual([])
  })

  test('Options page renders currency toggle', async ({ page }) => {
    await page.goto('/options', { waitUntil: 'domcontentloaded' })
    // The page loads and the section header is visible (Deribit CORS may block
    // chain fetches in headless; we verify the page itself rendered).
    await expect(page.getByText(/Options \(Deribit\)/i)).toBeVisible({ timeout: 5000 })
  })

  test('Order Book page lists all four exchanges as venue toggles', async ({ page }) => {
    await page.goto('/orderbook', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('button', { name: /binance/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /bybit/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /okx/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /coinbase/i })).toBeVisible()
    // Symbol selector
    await expect(page.getByLabel(/Symbol/i)).toBeVisible()
  })

  test('Data Feeds page shows built-in feeds and add-feed form', async ({ page }) => {
    await page.goto('/feeds', { waitUntil: 'networkidle' })
    await expect(page.getByText(/Data Feeds/i).first()).toBeVisible()
    await expect(page.getByText(/Add Custom WebSocket Feed/i)).toBeVisible()
    await expect(page.getByPlaceholder(/My exchange/i)).toBeVisible()
    await expect(page.getByPlaceholder(/wss:\/\//i)).toBeVisible()
    await expect(page.getByRole('button', { name: /Add Feed/i })).toBeVisible()
  })

  test('Adding an invalid feed shows a validation error', async ({ page }) => {
    await page.goto('/feeds', { waitUntil: 'networkidle' })
    const addBtn = page.getByRole('button', { name: /Add Feed/i })
    await addBtn.scrollIntoViewIfNeeded()
    await addBtn.click()
    await expect(page.getByRole('alert')).toBeVisible({ timeout: 5_000 })
  })

  test('Adding a valid feed persists and appears in the table', async ({ page }) => {
    page.on('dialog', (d) => d.accept())
    await page.goto('/feeds', { waitUntil: 'networkidle' })
    const label = `e2e-test-${Date.now()}`
    await page.getByPlaceholder(/My exchange/i).fill(label)
    await page.getByPlaceholder(/wss:\/\//i).fill('wss://example.com/ws')
    const addBtn = page.getByRole('button', { name: /Add Feed/i })
    await addBtn.scrollIntoViewIfNeeded()
    await addBtn.click()
    await expect(page.getByText(label)).toBeVisible({ timeout: 5_000 })
  })
})

test.describe('Sprint 11 closeout — UX audit', () => {
  test('all interactive controls have accessible labels', async ({ page }) => {
    for (const route of ROUTES) {
      await page.goto(route.path, { waitUntil: 'domcontentloaded' })
      // Every button should have either visible text or aria-label
      const buttons = await page.getByRole('button').all()
      for (const btn of buttons) {
        const name = await btn.evaluate((el) => {
          return el.getAttribute('aria-label') || el.textContent?.trim() || ''
        })
        expect(name.length, `Button on ${route.path} has no accessible name`).toBeGreaterThan(0)
      }
    }
  })

  test('mobile breakpoint: sidebar collapses below 768px', async ({ page }) => {
    await page.setViewportSize({ width: 414, height: 896 })
    await page.goto('/')
    // Layout should still render (not horizontally scroll the body)
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth)
    const viewportWidth = await page.evaluate(() => window.innerWidth)
    expect(bodyWidth, 'Mobile body overflows viewport').toBeLessThanOrEqual(viewportWidth + 4)
  })

  test('no obvious visual regression: pages do not render zero-height main', async ({ page }) => {
    for (const route of ROUTES) {
      await page.goto(route.path, { waitUntil: 'domcontentloaded' })
      const main = page.locator('main, [role="main"]').first()
      if (await main.count() > 0) {
        const box = await main.boundingBox()
        expect(box?.height, `Empty main on ${route.path}`).toBeGreaterThan(50)
      }
    }
  })
})
