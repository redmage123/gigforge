import { expect, test } from '@playwright/test'

/**
 * Sprint 12 E2E — Sentiment + On-Chain pages.
 *
 * The pages depend on third-party APIs (Alternative.me, Reddit, GDELT, HN,
 * Mempool, Blockchain.com, Etherscan, DefiLlama) that may or may not be
 * reachable in headless mode (CORS, rate limits, network policy). We
 * verify the page shell renders and panel headers are visible — actual
 * data load is best-effort and tracked via Tooltip-area visibility.
 */
test.describe('Sprint 12 — Sentiment + On-Chain', () => {
  test('Sentiment page renders all four source panels', async ({ page }) => {
    await page.goto('/sentiment', { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('Composite Sentiment')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText(/Fear & Greed/i).first()).toBeVisible()
    await expect(page.getByText(/Reddit/i).first()).toBeVisible()
    await expect(page.getByText(/HackerNews/i)).toBeVisible()
  })

  test('On-Chain page renders all four feed panels', async ({ page }) => {
    await page.goto('/onchain', { waitUntil: 'domcontentloaded' })
    await expect(page.getByText(/Bitcoin On-Chain/)).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText(/BTC Hashrate/i)).toBeVisible()
    await expect(page.getByText(/Ethereum/i).first()).toBeVisible()
    await expect(page.getByText(/DeFi TVL/i)).toBeVisible()
    await expect(page.getByText(/Top 10 DeFi/i)).toBeVisible()
  })

  test('Both new pages appear in the sidebar', async ({ page }) => {
    await page.goto('/')
    const nav = page.getByRole('navigation', { name: /Main navigation/i })
    await expect(nav.getByRole('link', { name: /Sentiment/i })).toBeVisible()
    await expect(nav.getByRole('link', { name: /On-Chain/i })).toBeVisible()
  })
})
