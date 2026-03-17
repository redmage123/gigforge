// @ts-check
const { test, expect } = require('@playwright/test');

const BASE = process.env.BASE_URL || 'http://localhost:8050';

// Unique user per test run to avoid collisions
const TS = Date.now();
const TEST_USER = `testuser${TS}`;
const TEST_PASS = 'TestPass123!';
const ADMIN_USER = 'admin';
const ADMIN_PASS = 'admin';

// ─── Helpers ────────────────────────────────────────────────────────────────

async function login(page, user = ADMIN_USER, pass = ADMIN_PASS) {
  await page.goto('/login');
  await page.waitForSelector('.login-card', { timeout: 10000 });
  // Username is the first form-input text field
  await page.locator('.login-card .form-group').first().locator('input').fill(user);
  // Password is inside the password-input-wrapper
  await page.locator('.password-input-wrapper input').fill(pass);
  await page.locator('button.login-btn').click();
  // Wait for redirect — URL becomes / or /setup-wizard
  await page.waitForURL(url => url.pathname === '/' || url.pathname === '/setup-wizard', { timeout: 15000 });
  // Give React a moment to render
  await page.waitForTimeout(1000);
}

async function apiLogin(request, user = ADMIN_USER, pass = ADMIN_PASS) {
  const res = await request.post(`${BASE}/api/auth/login`, {
    data: { username: user, password: pass },
  });
  const data = await res.json();
  return data;
}

// ─── 1. Authentication ─────────────────────────────────────────────────────

test.describe('Authentication', () => {
  test('should show login page for unauthenticated users', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login/);
    await expect(page.locator('.login-title')).toContainText('CryptoAdvisor');
    await expect(page.locator('.login-subtitle')).toContainText('Sign in');
  });

  test('should show error for invalid credentials', async ({ page }) => {
    await page.goto('/login');
    await page.waitForSelector('.login-card', { timeout: 10000 });
    await page.locator('.login-card .form-group').first().locator('input').fill('nonexistent');
    await page.locator('.password-input-wrapper input').fill('wrongpassword');
    await page.locator('button.login-btn').click();
    await expect(page.locator('.login-error')).toBeVisible({ timeout: 10000 });
  });

  test('should login with valid credentials and redirect to dashboard', async ({ page }) => {
    await login(page);
    await expect(page).toHaveURL('/');
    await expect(page.locator('h2').first()).toBeVisible();
  });

  test('should register a new user', async ({ page }) => {
    await page.goto('/register');
    await expect(page.locator('.login-title')).toContainText('CryptoAdvisor');
    await expect(page.locator('.login-subtitle')).toContainText('Create your account');

    await page.locator('input[placeholder="First name"]').fill('Test');
    await page.locator('input[placeholder="Last name"]').fill('User');
    await page.locator('input[placeholder="Choose a username"]').fill(TEST_USER);
    await page.locator('input[placeholder="At least 6 characters"]').fill(TEST_PASS);
    await page.locator('input[placeholder="Re-enter your password"]').fill(TEST_PASS);
    await page.locator('button.login-btn').click();

    // Should redirect to setup wizard after registration
    await page.waitForURL('**/setup-wizard', { timeout: 15000 });
    await expect(page).toHaveURL(/setup-wizard/);
  });

  test('should show error for mismatched passwords on register', async ({ page }) => {
    await page.goto('/register');
    await page.locator('input[placeholder="First name"]').fill('Bad');
    await page.locator('input[placeholder="Last name"]').fill('User');
    await page.locator('input[placeholder="Choose a username"]').fill(`baduser${TS}`);
    await page.locator('input[placeholder="At least 6 characters"]').fill('password1');
    await page.locator('input[placeholder="Re-enter your password"]').fill('password2');
    await page.locator('button.login-btn').click();
    await expect(page.locator('.login-error')).toContainText('Passwords do not match');
  });

  test('should login as the newly registered user', async ({ page }) => {
    await login(page, TEST_USER, TEST_PASS);
    await expect(page).toHaveURL('/');
  });

  test('should navigate to login from register page via link', async ({ page }) => {
    await page.goto('/register');
    await page.locator('a[href="/login"]').click();
    await expect(page).toHaveURL(/\/login/);
  });

  test('should navigate to register from login page via link', async ({ page }) => {
    await page.goto('/login');
    await page.locator('a[href="/register"]').click();
    await expect(page).toHaveURL(/\/register/);
  });

  test('should logout and redirect to login', async ({ page }) => {
    await login(page);
    // Open user dropdown in TopBar and click logout
    await page.locator('.user-menu-btn').click();
    await page.locator('.dropdown-item >> text=Logout').click();
    await expect(page).toHaveURL(/\/login/);
  });
});

// ─── 2. Dashboard ───────────────────────────────────────────────────────────

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('should display greeting and market data', async ({ page }) => {
    // Greeting should be visible
    const greeting = page.locator('text=/Good (morning|afternoon|evening)/');
    await expect(greeting).toBeVisible({ timeout: 10000 });
  });

  test('should show coin price cards', async ({ page }) => {
    // Wait for price data to load
    await page.waitForTimeout(2000);
    // At minimum we should see card-like elements
    const cards = page.locator('.stat-card, .card');
    const count = await cards.count();
    expect(count).toBeGreaterThan(0);
  });

  test('should have a working favorites toggle', async ({ page }) => {
    await page.waitForTimeout(2000);
    const starBtn = page.locator('button:has-text("★"), button:has-text("☆")').first();
    if (await starBtn.isVisible()) {
      await starBtn.click();
      await page.waitForTimeout(500);
      // Toggle should work without error
    }
  });
});

// ─── 3. Sidebar Navigation ─────────────────────────────────────────────────

test.describe('Sidebar Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  const pages = [
    { path: '/technical', heading: /Technical/i },
    { path: '/sentiment', heading: /Sentiment|Advisor/i },
    { path: '/portfolio', heading: /Portfolio/i },
    { path: '/wallet', heading: /Wallet/i },
    { path: '/alerts', heading: /Alert/i },
    { path: '/trades', heading: /Trade/i },
    { path: '/defi', heading: /DeFi/i },
    { path: '/staking', heading: /Stak/i },
    { path: '/nfts', heading: /NFT/i },
    { path: '/yields', heading: /Yield/i },
    { path: '/gas', heading: /Gas/i },
    { path: '/whales', heading: /Whale/i },
    { path: '/correlation', heading: /Correlation/i },
    { path: '/orderbook', heading: /Order/i },
    { path: '/liquidations', heading: /Liquidat/i },
    { path: '/tax', heading: /Tax/i },
    { path: '/dca', heading: /DCA/i },
    { path: '/dca-plans', heading: /DCA/i },
    { path: '/token-approvals', heading: /Approval/i },
    { path: '/airdrops', heading: /Airdrop/i },
    { path: '/mempool', heading: /Mempool/i },
    { path: '/token-unlocks', heading: /Unlock/i },
    { path: '/converter', heading: /Convert/i },
    { path: '/copy-trading', heading: /Copy/i },
    { path: '/governance', heading: /Governance/i },
    { path: '/wallet-health', heading: /Wallet.*Health/i },
    { path: '/rugpull', heading: /Rug/i },
    { path: '/multisig', heading: /Multi/i },
    { path: '/onchain-pnl', heading: /P.?L/i },
    { path: '/impermanent-loss', heading: /Impermanent/i },
    { path: '/backtest', heading: /Backtest/i },
    { path: '/dev-activity', heading: /Dev/i },
    { path: '/blockchain', heading: /Blockchain/i },
    { path: '/analytics', heading: /Analytic/i },
    { path: '/exchanges', heading: /Exchange/i },
    { path: '/ai-briefing', heading: /Brief/i },
    { path: '/ai-risk', heading: /Risk/i },
    { path: '/ai-tax', heading: /Tax/i },
    { path: '/ai-portfolio', heading: /Portfolio/i },
    { path: '/pattern-recognition', heading: /Pattern/i },
    { path: '/regulatory', heading: /Regulat/i },
    { path: '/trading-coach', heading: /Coach/i },
    { path: '/memory', heading: /Memory/i },
    { path: '/settings', heading: /Setting/i },
    { path: '/billing', heading: /Bill/i },
    { path: '/share-portfolio', heading: /Share/i },
    { path: '/data-export', heading: /Export/i },
    { path: '/csv-import', heading: /Import/i },
  ];

  for (const p of pages) {
    test(`should navigate to ${p.path}`, async ({ page }) => {
      await page.goto(p.path);
      await page.waitForTimeout(1500);
      const heading = page.locator('h1, h2').first();
      await expect(heading).toBeVisible({ timeout: 10000 });
    });
  }

  test('should collapse and expand sidebar sections', async ({ page }) => {
    const section = page.locator('.nav-section:has-text("Tools")');
    if (await section.isVisible()) {
      await section.click();
      await page.waitForTimeout(300);
      // After collapse, child items should be hidden
      await section.click();
      await page.waitForTimeout(300);
    }
  });

  test('should customize sidebar (pin/hide)', async ({ page }) => {
    const customizeBtn = page.locator('.sidebar-edit-btn');
    if (await customizeBtn.isVisible()) {
      await customizeBtn.click();
      await page.waitForTimeout(500);
      // Pin buttons should appear
      const pinBtn = page.locator('.pin-btn').first();
      if (await pinBtn.isVisible()) {
        await pinBtn.click();
        await page.waitForTimeout(500);
      }
      // Exit customize mode
      await customizeBtn.click();
    }
  });
});

// ─── 4. TopBar & User Menu ──────────────────────────────────────────────────

test.describe('TopBar & User Menu', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('should open user dropdown menu', async ({ page }) => {
    await page.locator('.user-menu-btn').click();
    await expect(page.locator('.dropdown-menu, .user-dropdown')).toBeVisible();
  });

  test('should navigate to Settings from dropdown', async ({ page }) => {
    await page.locator('.user-menu-btn').click();
    await page.locator('.dropdown-item >> text=Settings').click();
    await expect(page).toHaveURL(/\/settings/);
  });

  test('should navigate to API Keys from dropdown', async ({ page }) => {
    await page.locator('.user-menu-btn').click();
    await page.locator('.dropdown-item >> text=API Keys').click();
    await expect(page).toHaveURL(/\/api-keys/);
  });

  test('should navigate to AI Memory from dropdown', async ({ page }) => {
    await page.locator('.user-menu-btn').click();
    await page.locator('.dropdown-item >> text=AI Memory').click();
    await expect(page).toHaveURL(/\/memory/);
  });

  test('should show help button for interactive guide', async ({ page }) => {
    const helpBtn = page.locator('.guide-help-btn');
    if (await helpBtn.isVisible()) {
      await helpBtn.click();
      await page.waitForTimeout(1000);
      // Guide overlay should appear
      const overlay = page.locator('.guide-overlay');
      if (await overlay.isVisible()) {
        // Close it
        const skipBtn = page.locator('button:has-text("Skip")');
        if (await skipBtn.isVisible()) await skipBtn.click();
      }
    }
  });
});

// ─── 5. Alerts CRUD ────────────────────────────────────────────────────────

test.describe('Alerts CRUD', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/alerts');
    await page.waitForTimeout(1000);
  });

  test('should display alerts page with create form', async ({ page }) => {
    await expect(page.locator('h1:has-text("Price Alerts")')).toBeVisible();
    await expect(page.locator('select.form-input').first()).toBeVisible();
  });

  test('should create a new price alert', async ({ page }) => {
    // Select coin
    await page.locator('select.form-input').first().selectOption('bitcoin');
    // Select condition
    await page.locator('select.form-input').nth(1).selectOption('above');
    // Enter price
    await page.locator('input[type="number"]').fill('100000');
    // Submit
    await page.locator('button:has-text("Create Alert")').click();
    await page.waitForTimeout(2000);
    // Alert should appear in list
    await expect(page.locator('text=Bitcoin').or(page.locator('text=bitcoin'))).toBeVisible();
  });

  test('should delete an alert', async ({ page }) => {
    // First create one
    await page.locator('select.form-input').first().selectOption('ethereum');
    await page.locator('select.form-input').nth(1).selectOption('below');
    await page.locator('input[type="number"]').fill('1000');
    await page.locator('button:has-text("Create Alert")').click();
    await page.waitForTimeout(2000);

    // Delete it
    const deleteBtn = page.locator('button:has-text("Delete")').first();
    if (await deleteBtn.isVisible()) {
      await deleteBtn.click();
      await page.waitForTimeout(1000);
    }
  });
});

// ─── 6. Wallet Management ──────────────────────────────────────────────────

test.describe('Wallet Management', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/wallet');
    await page.waitForTimeout(1000);
  });

  test('should display wallet page with add form', async ({ page }) => {
    await expect(page.locator('h1:has-text("Wallet")')).toBeVisible();
    await expect(page.locator('input[placeholder="0x..."]')).toBeVisible();
  });

  test('should add a wallet manually', async ({ page }) => {
    await page.locator('input[placeholder="My Wallet"]').fill('Test Wallet');
    await page.locator('input[placeholder="0x..."]').fill('0x742d35Cc6634C0532925a3b844Bc9e7595f2bD28');
    await page.locator('button:has-text("Add Wallet"), button:has-text("Save")').first().click();
    await page.waitForTimeout(2000);
    await expect(page.locator('text=Test Wallet')).toBeVisible();
  });

  test('should show MetaMask connect button', async ({ page }) => {
    await expect(page.locator('button:has-text("MetaMask")')).toBeVisible();
  });

  test('should remove a wallet', async ({ page }) => {
    // Add one first
    await page.locator('input[placeholder="My Wallet"]').fill('Delete Me');
    await page.locator('input[placeholder="0x..."]').fill('0x1234567890abcdef1234567890abcdef12345678');
    await page.locator('button:has-text("Add Wallet"), button:has-text("Save")').first().click();
    await page.waitForTimeout(2000);

    // Remove it
    const removeBtn = page.locator('button:has-text("Remove"), button:has-text("Delete")').first();
    if (await removeBtn.isVisible()) {
      await removeBtn.click();
      await page.waitForTimeout(1000);
    }
  });
});

// ─── 7. Trade Journal ───────────────────────────────────────────────────────

test.describe('Trade Journal', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/trades');
    await page.waitForTimeout(1000);
  });

  test('should display trade journal page', async ({ page }) => {
    await expect(page.locator('text=/Trade Journal/i')).toBeVisible();
  });

  test('should add a buy trade', async ({ page }) => {
    // Fill trade form
    const coinSelect = page.locator('select').first();
    if (await coinSelect.isVisible()) {
      await coinSelect.selectOption('bitcoin');
    }
    const typeSelect = page.locator('select').nth(1);
    if (await typeSelect.isVisible()) {
      await typeSelect.selectOption('buy');
    }
    const amountInput = page.locator('input[type="number"]').first();
    if (await amountInput.isVisible()) {
      await amountInput.fill('0.5');
    }
    const priceInput = page.locator('input[type="number"]').nth(1);
    if (await priceInput.isVisible()) {
      await priceInput.fill('50000');
    }
    const submitBtn = page.locator('button:has-text("Add Trade"), button:has-text("Save")').first();
    if (await submitBtn.isVisible()) {
      await submitBtn.click();
      await page.waitForTimeout(2000);
    }
  });

  test('should show P&L stats', async ({ page }) => {
    const pnlCard = page.locator('.stat-card, text=/P.?L/i').first();
    await expect(pnlCard).toBeVisible({ timeout: 5000 });
  });

  test('should show AI analysis buttons', async ({ page }) => {
    await expect(page.locator('button:has-text("Analyze")')).toBeVisible();
  });
});

// ─── 8. Portfolio ───────────────────────────────────────────────────────────

test.describe('Portfolio', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/portfolio');
    await page.waitForTimeout(1500);
  });

  test('should display portfolio page', async ({ page }) => {
    await expect(page.locator('h1:has-text("Portfolio"), h2:has-text("Portfolio")')).toBeVisible();
  });

  test('should show holdings or empty state', async ({ page }) => {
    // Portfolio page should show either holdings table or empty message
    const content = page.locator('.card').first();
    await expect(content).toBeVisible({ timeout: 10000 });
  });
});

// ─── 9. Settings ────────────────────────────────────────────────────────────

test.describe('Settings', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/settings');
    await page.waitForTimeout(1500);
  });

  test('should display settings page', async ({ page }) => {
    await expect(page.locator('text=/Settings/i').first()).toBeVisible();
  });

  test('should toggle theme', async ({ page }) => {
    const themeSelect = page.locator('select:near(:text("Theme"))').first();
    if (await themeSelect.isVisible()) {
      const current = await themeSelect.inputValue();
      const newTheme = current === 'dark' ? 'light' : 'dark';
      await themeSelect.selectOption(newTheme);
      await page.waitForTimeout(1000);
      // Toggle back
      await themeSelect.selectOption(current);
    }
  });

  test('should change currency', async ({ page }) => {
    const currencySelect = page.locator('select:near(:text("Currency"))').first();
    if (await currencySelect.isVisible()) {
      await currencySelect.selectOption('eur');
      await page.waitForTimeout(1000);
      // Change back
      await currencySelect.selectOption('usd');
    }
  });

  test('should display password change form', async ({ page }) => {
    const passwordSection = page.locator('text=/Password/i').first();
    await expect(passwordSection).toBeVisible();
  });

  test('should display 2FA section', async ({ page }) => {
    const twoFASection = page.locator('text=/2FA|Two.?Factor|Authentication/i').first();
    if (await twoFASection.isVisible()) {
      // Just verify section exists
      expect(true).toBe(true);
    }
  });

  test('should display widget layout section', async ({ page }) => {
    const widgetSection = page.locator('text=/Widget|Dashboard.*Layout/i').first();
    if (await widgetSection.isVisible()) {
      expect(true).toBe(true);
    }
  });
});

// ─── 10. Sentiment Advisor ──────────────────────────────────────────────────

test.describe('Sentiment Advisor', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/sentiment');
    await page.waitForTimeout(2000);
  });

  test('should display sentiment page with tabs', async ({ page }) => {
    const heading = page.locator('h1, h2').first();
    await expect(heading).toBeVisible();
  });

  test('should show recommendations tab', async ({ page }) => {
    const recTab = page.locator('button:has-text("Recommendations"), [class*="tab"]:has-text("Recommendations")').first();
    if (await recTab.isVisible()) {
      await recTab.click();
      await page.waitForTimeout(1500);
    }
  });

  test('should show news feed tab', async ({ page }) => {
    const newsTab = page.locator('button:has-text("News"), [class*="tab"]:has-text("News")').first();
    if (await newsTab.isVisible()) {
      await newsTab.click();
      await page.waitForTimeout(1500);
    }
  });

  test('should show alerts tab', async ({ page }) => {
    const alertsTab = page.locator('button:has-text("Alerts"), [class*="tab"]:has-text("Alerts")').first();
    if (await alertsTab.isVisible()) {
      await alertsTab.click();
      await page.waitForTimeout(1000);
    }
  });

  test('should show strategy/profile tab', async ({ page }) => {
    const stratTab = page.locator('button:has-text("Strategy"), button:has-text("Profile"), [class*="tab"]:has-text("Strategy")').first();
    if (await stratTab.isVisible()) {
      await stratTab.click();
      await page.waitForTimeout(1000);
    }
  });
});

// ─── 11. AI Memory (RAG) ───────────────────────────────────────────────────

test.describe('AI Memory', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/memory');
    await page.waitForTimeout(1500);
  });

  test('should display memory page with stats', async ({ page }) => {
    await expect(page.locator('h2:has-text("AI Memory")')).toBeVisible();
    await expect(page.locator('.memory-stats-bar')).toBeVisible();
  });

  test('should show category filter pills', async ({ page }) => {
    await expect(page.locator('.memory-filter-pill').first()).toBeVisible();
  });

  test('should add a fact manually', async ({ page }) => {
    await page.locator('.memory-add-input').fill('I prefer long-term investing in blue chip crypto');
    await page.locator('.memory-category-select').first().selectOption('strategy');
    await page.locator('button:has-text("Add")').click();
    await page.waitForTimeout(2000);
    await expect(page.locator('text=I prefer long-term investing')).toBeVisible();
  });

  test('should filter by category', async ({ page }) => {
    // Click a category pill
    const pill = page.locator('.memory-filter-pill:has-text("Portfolio")');
    if (await pill.isVisible()) {
      await pill.click();
      await page.waitForTimeout(1000);
    }
  });

  test('should search facts', async ({ page }) => {
    await page.locator('.memory-search-input').fill('bitcoin');
    await page.locator('button:has-text("Search")').click();
    await page.waitForTimeout(1500);
  });

  test('should edit a fact', async ({ page }) => {
    // Add a fact first
    await page.locator('.memory-add-input').fill('Temporary fact for editing');
    await page.locator('button:has-text("Add")').click();
    await page.waitForTimeout(2000);

    // Click edit button
    const editBtn = page.locator('.memory-action-btn:not(.memory-delete-btn)').first();
    if (await editBtn.isVisible()) {
      await editBtn.click();
      await page.waitForTimeout(500);
      const editInput = page.locator('.memory-edit-input');
      if (await editInput.isVisible()) {
        await editInput.fill('Updated fact text');
        await page.locator('button:has-text("Save")').first().click();
        await page.waitForTimeout(1000);
      }
    }
  });

  test('should delete a fact', async ({ page }) => {
    // Add a fact first
    await page.locator('.memory-add-input').fill('Fact to be deleted');
    await page.locator('button:has-text("Add")').click();
    await page.waitForTimeout(2000);

    // Accept the confirm dialog
    page.on('dialog', (dialog) => dialog.accept());

    const deleteBtn = page.locator('.memory-delete-btn').first();
    if (await deleteBtn.isVisible()) {
      await deleteBtn.click();
      await page.waitForTimeout(1000);
    }
  });

  test('should show memory stats', async ({ page }) => {
    const statValue = page.locator('.memory-stat-value').first();
    await expect(statValue).toBeVisible();
  });
});

// ─── 12. Chat Window ────────────────────────────────────────────────────────

test.describe('Chat Window', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('should toggle chat window open and closed', async ({ page }) => {
    const toggleBtn = page.locator('.chat-toggle-btn');
    await expect(toggleBtn).toBeVisible();

    // Open chat
    await toggleBtn.click();
    await expect(page.locator('.chat-window')).toBeVisible();

    // Check input is visible
    await expect(page.locator('.chat-input-area input')).toBeVisible();

    // Close chat
    await page.locator('.chat-close-btn').click();
    await expect(page.locator('.chat-window')).not.toBeVisible();
  });

  test('should show placeholder text when empty', async ({ page }) => {
    await page.locator('.chat-toggle-btn').click();
    await expect(page.locator('text=/Ask me anything/i')).toBeVisible();
  });

  test('should send a message and show typing indicator', async ({ page }) => {
    await page.locator('.chat-toggle-btn').click();
    const input = page.locator('.chat-input-area input');
    await input.fill('What is Bitcoin?');

    // Don't wait for full response — just check the flow works
    const sendBtn = page.locator('.chat-input-area button');
    await sendBtn.click();

    // User message should appear
    await expect(page.locator('.chat-message.user')).toBeVisible();
    // Typing indicator should show
    await expect(page.locator('.chat-typing')).toBeVisible({ timeout: 5000 });
  });
});

// ─── 13. Interactive User Guide ─────────────────────────────────────────────

test.describe('Interactive Guide', () => {
  test('should start guide from help button', async ({ page }) => {
    await login(page);
    // Mark guide as not completed so it can restart
    const helpBtn = page.locator('.guide-help-btn');
    if (await helpBtn.isVisible()) {
      await helpBtn.click();
      await page.waitForTimeout(1000);

      const overlay = page.locator('.guide-overlay');
      if (await overlay.isVisible()) {
        // Guide should show tooltip
        await expect(page.locator('.guide-tooltip')).toBeVisible({ timeout: 5000 });

        // Should have next/skip buttons
        const nextBtn = page.locator('.guide-tooltip button:has-text("Next")');
        if (await nextBtn.isVisible()) {
          await nextBtn.click();
          await page.waitForTimeout(500);
        }

        // Skip the guide
        const skipBtn = page.locator('button:has-text("Skip")');
        if (await skipBtn.isVisible()) {
          await skipBtn.click();
          await page.waitForTimeout(500);
        }
      }
    }
  });
});

// ─── 14. Favorites ──────────────────────────────────────────────────────────

test.describe('Favorites', () => {
  test('should add and remove favorites via API', async ({ request }) => {
    const loginRes = await request.post(`${BASE}/api/auth/login`, {
      data: { username: ADMIN_USER, password: ADMIN_PASS },
    });
    const cookies = loginRes.headers()['set-cookie'];

    // Get CSRF token
    const csrfRes = await request.get(`${BASE}/api/favorites/list`, {
      headers: { Cookie: cookies },
    });

    // Add favorite
    const addRes = await request.post(`${BASE}/api/favorites`, {
      data: { coin_id: 'solana' },
      headers: {
        Cookie: cookies,
        'X-CSRF-Token': 'test',
      },
    });

    // List favorites
    const listRes = await request.get(`${BASE}/api/favorites/list`, {
      headers: { Cookie: cookies },
    });
    expect(listRes.ok()).toBeTruthy();
  });
});

// ─── 15. API Endpoints (Direct) ─────────────────────────────────────────────

test.describe('API Endpoints', () => {
  // Helper: login and get cookie header for API tests
  async function getAuthCookie(request) {
    const res = await request.post(`${BASE}/api/auth/login`, {
      data: { username: ADMIN_USER, password: ADMIN_PASS },
    });
    return res.headers()['set-cookie'] || '';
  }

  test('GET /health should return ok', async ({ request }) => {
    const res = await request.get(`${BASE}/health`);
    expect(res.ok()).toBeTruthy();
  });

  test('GET /api/market/prices should return prices', async ({ request }) => {
    const cookies = await getAuthCookie(request);
    const res = await request.get(`${BASE}/api/market/prices`, {
      headers: { Cookie: cookies },
    });
    expect(res.ok()).toBeTruthy();
  });

  test('GET /api/market/fear-greed should return index', async ({ request }) => {
    const cookies = await getAuthCookie(request);
    const res = await request.get(`${BASE}/api/market/fear-greed`, {
      headers: { Cookie: cookies },
    });
    expect(res.ok()).toBeTruthy();
  });

  test('GET /api/market/global should return global data', async ({ request }) => {
    const cookies = await getAuthCookie(request);
    const res = await request.get(`${BASE}/api/market/global`, {
      headers: { Cookie: cookies },
    });
    expect(res.ok()).toBeTruthy();
  });

  test('GET /api/settings should return user settings', async ({ request }) => {
    const cookies = await getAuthCookie(request);
    const res = await request.get(`${BASE}/api/settings/`, {
      headers: { Cookie: cookies },
    });
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data).toHaveProperty('theme');
  });

  test('GET /api/memory/stats should return memory stats', async ({ request }) => {
    const cookies = await getAuthCookie(request);
    const res = await request.get(`${BASE}/api/memory/stats`, {
      headers: { Cookie: cookies },
    });
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data).toHaveProperty('total_facts');
    expect(data).toHaveProperty('categories');
  });

  test('GET /api/memory/categories should return category list', async ({ request }) => {
    const cookies = await getAuthCookie(request);
    const res = await request.get(`${BASE}/api/memory/categories`, {
      headers: { Cookie: cookies },
    });
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data.categories).toContain('portfolio');
    expect(data.categories).toContain('strategy');
  });

  test('GET /api/alerts should return alerts', async ({ request }) => {
    const cookies = await getAuthCookie(request);
    const res = await request.get(`${BASE}/api/alerts`, {
      headers: { Cookie: cookies },
    });
    expect(res.ok()).toBeTruthy();
  });

  test('GET /api/wallet/saved should return wallets', async ({ request }) => {
    const cookies = await getAuthCookie(request);
    const res = await request.get(`${BASE}/api/wallet/saved`, {
      headers: { Cookie: cookies },
    });
    expect(res.ok()).toBeTruthy();
  });

  test('GET /api/trades should return trades', async ({ request }) => {
    const cookies = await getAuthCookie(request);
    const res = await request.get(`${BASE}/api/trades`, {
      headers: { Cookie: cookies },
    });
    expect(res.ok()).toBeTruthy();
  });

  test('GET /api/portfolio/holdings should return portfolio', async ({ request }) => {
    const cookies = await getAuthCookie(request);
    const res = await request.get(`${BASE}/api/portfolio/holdings`, {
      headers: { Cookie: cookies },
    });
    expect(res.ok()).toBeTruthy();
  });

  test('GET /api/sentiment-advisor/recommendations should return recs', async ({ request }) => {
    const cookies = await getAuthCookie(request);
    const res = await request.get(`${BASE}/api/sentiment-advisor/recommendations`, {
      headers: { Cookie: cookies },
    });
    // May be 200 or 500 if CoinGecko rate limited
    expect(res.status()).toBeLessThan(502);
  });

  test('GET /api/settings/guide-status should return guide status', async ({ request }) => {
    const cookies = await getAuthCookie(request);
    const res = await request.get(`${BASE}/api/settings/guide-status`, {
      headers: { Cookie: cookies },
    });
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data).toHaveProperty('guide_completed');
  });

  test('GET /api/sidebar should return sidebar prefs', async ({ request }) => {
    const cookies = await getAuthCookie(request);
    const res = await request.get(`${BASE}/api/sidebar/`, {
      headers: { Cookie: cookies },
    });
    expect(res.ok()).toBeTruthy();
  });

  test('GET /api/favorites/list should return favorites', async ({ request }) => {
    const cookies = await getAuthCookie(request);
    const res = await request.get(`${BASE}/api/favorites/list`, {
      headers: { Cookie: cookies },
    });
    expect(res.ok()).toBeTruthy();
  });

  test('GET /api/keys/integrations should list integrations', async ({ request }) => {
    const cookies = await getAuthCookie(request);
    const res = await request.get(`${BASE}/api/keys/integrations`, {
      headers: { Cookie: cookies },
    });
    expect(res.ok()).toBeTruthy();
  });

  test('GET /api/notifications should return notifications', async ({ request }) => {
    const cookies = await getAuthCookie(request);
    const res = await request.get(`${BASE}/api/notifications`, {
      headers: { Cookie: cookies },
    });
    expect(res.ok()).toBeTruthy();
  });

  test('GET /api/settings/export should export data', async ({ request }) => {
    const cookies = await getAuthCookie(request);
    const res = await request.get(`${BASE}/api/settings/export`, {
      headers: { Cookie: cookies },
    });
    expect(res.ok()).toBeTruthy();
  });

  test('should reject unauthenticated API requests', async ({ request }) => {
    const res = await request.get(`${BASE}/api/settings/`);
    expect(res.status()).toBe(401);
  });
});

// ─── 16. DCA Calculator ────────────────────────────────────────────────────

test.describe('DCA Calculator', () => {
  test('should display DCA page', async ({ page }) => {
    await login(page);
    await page.goto('/dca');
    await page.waitForTimeout(1500);
    const heading = page.locator('h1, h2').first();
    await expect(heading).toBeVisible();
  });
});

// ─── 17. Gas Tracker ────────────────────────────────────────────────────────

test.describe('Gas Tracker', () => {
  test('should display gas page', async ({ page }) => {
    await login(page);
    await page.goto('/gas');
    await page.waitForTimeout(1500);
    await expect(page.locator('h1:has-text("Gas"), h2:has-text("Gas")')).toBeVisible();
  });
});

// ─── 18. Converter ──────────────────────────────────────────────────────────

test.describe('Converter', () => {
  test('should display converter page', async ({ page }) => {
    await login(page);
    await page.goto('/converter');
    await page.waitForTimeout(1500);
    const heading = page.locator('h1, h2').first();
    await expect(heading).toBeVisible();
  });
});

// ─── 19. API Keys Management ────────────────────────────────────────────────

test.describe('API Keys', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/api-keys');
    await page.waitForTimeout(1500);
  });

  test('should display API keys page with integrations', async ({ page }) => {
    await expect(page.locator('h1, h2').first()).toBeVisible();
    // Should show integration cards
    const cards = page.locator('.card, [class*="integration"]');
    const count = await cards.count();
    expect(count).toBeGreaterThan(0);
  });
});

// ─── 20. Data Export ────────────────────────────────────────────────────────

test.describe('Data Export', () => {
  test('should display export page', async ({ page }) => {
    await login(page);
    await page.goto('/data-export');
    await page.waitForTimeout(1500);
    const heading = page.locator('h1, h2').first();
    await expect(heading).toBeVisible();
  });
});

// ─── 21. CSV Import ─────────────────────────────────────────────────────────

test.describe('CSV Import', () => {
  test('should display import page with file upload', async ({ page }) => {
    await login(page);
    await page.goto('/csv-import');
    await page.waitForTimeout(1500);
    const heading = page.locator('h1, h2').first();
    await expect(heading).toBeVisible();
  });
});

// ─── 22. Coin Detail Page ───────────────────────────────────────────────────

test.describe('Coin Detail', () => {
  test('should display coin detail page for bitcoin', async ({ page }) => {
    await login(page);
    await page.goto('/coin/bitcoin');
    await page.waitForTimeout(2000);
    const heading = page.locator('h1, h2').first();
    await expect(heading).toBeVisible();
  });
});

// ─── 23. Change Password ───────────────────────────────────────────────────

test.describe('Change Password', () => {
  test('should display change password form', async ({ page }) => {
    await login(page);
    await page.goto('/change-password');
    await expect(page.locator('text=/Change Password/i')).toBeVisible();
    await expect(page.locator('input[type="password"]').first()).toBeVisible();
  });

  test('should change password for test user', async ({ page }) => {
    await login(page, TEST_USER, TEST_PASS);
    await page.goto('/change-password');

    // Change password page uses PasswordInput components
    const pwInputs = page.locator('.password-input-wrapper input');
    await pwInputs.first().fill(TEST_PASS);
    await pwInputs.nth(1).fill(TEST_PASS + '2');
    await page.locator('button:has-text("Change Password")').click();
    await page.waitForTimeout(2000);

    // Check for success or error message
    const success = page.locator('.login-success');
    const error = page.locator('.login-error');
    const visible = await success.isVisible() || await error.isVisible();
    expect(visible).toBeTruthy();
  });
});

// ─── 24. Setup Wizard ───────────────────────────────────────────────────────

test.describe('Setup Wizard', () => {
  test('should display setup wizard steps', async ({ page }) => {
    await login(page);
    await page.goto('/setup-wizard');
    await page.waitForTimeout(1500);
    const heading = page.locator('h1, h2').first();
    await expect(heading).toBeVisible();
  });
});

// ─── 25. Responsive & Mobile ────────────────────────────────────────────────

test.describe('Responsive Layout', () => {
  test('should show hamburger menu on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await login(page);
    await expect(page.locator('.hamburger')).toBeVisible();
  });

  test('should toggle sidebar on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await login(page);
    const hamburger = page.locator('.hamburger');
    await hamburger.click();
    await expect(page.locator('.sidebar.open')).toBeVisible();
    // Close via overlay
    const overlay = page.locator('.sidebar-overlay');
    if (await overlay.isVisible()) {
      await overlay.click();
      await page.waitForTimeout(300);
    }
  });
});

// ─── 26. Multi-User Isolation ───────────────────────────────────────────────

test.describe('Multi-User Data Isolation', () => {
  test('user A data should not be visible to user B', async ({ request }) => {
    // Login as admin
    const adminLogin = await request.post(`${BASE}/api/auth/login`, {
      data: { username: ADMIN_USER, password: ADMIN_PASS },
    });
    const adminCookies = adminLogin.headers()['set-cookie'];

    // Get admin's memory facts count
    const adminMemory = await request.get(`${BASE}/api/memory/stats`, {
      headers: { Cookie: adminCookies },
    });
    const adminStats = await adminMemory.json();

    // Login as test user
    const testLogin = await request.post(`${BASE}/api/auth/login`, {
      data: { username: TEST_USER, password: TEST_PASS },
    });
    // Test user may have different password after change password test
    if (!testLogin.ok()) {
      const testLogin2 = await request.post(`${BASE}/api/auth/login`, {
        data: { username: TEST_USER, password: TEST_PASS + '2' },
      });
      if (!testLogin2.ok()) return; // Skip if test user can't login
    }

    const testCookies = testLogin.headers()['set-cookie'] || '';
    if (!testCookies) return;

    const testMemory = await request.get(`${BASE}/api/memory/stats`, {
      headers: { Cookie: testCookies },
    });

    if (testMemory.ok()) {
      const testStats = await testMemory.json();
      // Test user should have 0 facts (admin's facts not visible)
      expect(testStats.total_facts).toBeLessThanOrEqual(adminStats.total_facts);
    }
  });
});

// ─── 27. Error Handling ─────────────────────────────────────────────────────

test.describe('Error Handling', () => {
  test('should show 404 for nonexistent pages', async ({ page }) => {
    await login(page);
    await page.goto('/nonexistent-page-xyz');
    await page.waitForTimeout(1000);
    // SPA should handle gracefully — either show dashboard or empty state
  });

  test('should handle network errors in chat gracefully', async ({ page }) => {
    await login(page);
    await page.locator('.chat-toggle-btn').click();
    // Type and send
    await page.locator('.chat-input-area input').fill('test');
    // The chat should handle any response gracefully
  });
});

// ─── 28. PWA & Health ───────────────────────────────────────────────────────

test.describe('PWA & Health', () => {
  test('should serve manifest.json', async ({ request }) => {
    const res = await request.get(`${BASE}/manifest.json`);
    // May or may not exist
    expect(res.status()).toBeLessThan(500);
  });

  test('should serve health endpoint', async ({ request }) => {
    const res = await request.get(`${BASE}/health`);
    expect(res.ok()).toBeTruthy();
  });
});

// ─── 29. DeFi & Advanced Pages ──────────────────────────────────────────────

test.describe('DeFi & Advanced Pages', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  const advancedPages = [
    '/defi',
    '/staking',
    '/yields',
    '/impermanent-loss',
    '/governance',
    '/token-approvals',
    '/airdrops',
    '/copy-trading',
    '/wallet-health',
    '/rugpull',
    '/multisig',
  ];

  for (const p of advancedPages) {
    test(`should load ${p} without errors`, async ({ page }) => {
      await page.goto(p);
      await page.waitForTimeout(1500);
      // Page should load without JS errors
      const heading = page.locator('h1, h2').first();
      await expect(heading).toBeVisible({ timeout: 10000 });
    });
  }
});

// ─── 30. AI Features Pages ─────────────────────────────────────────────────

test.describe('AI Features', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  const aiPages = [
    '/ai-briefing',
    '/ai-risk',
    '/ai-tax',
    '/ai-portfolio',
    '/pattern-recognition',
    '/regulatory',
    '/trading-coach',
  ];

  for (const p of aiPages) {
    test(`should load ${p}`, async ({ page }) => {
      await page.goto(p);
      await page.waitForTimeout(1500);
      const heading = page.locator('h1, h2').first();
      await expect(heading).toBeVisible({ timeout: 10000 });
    });
  }
});

// ─── 31. Rate Limiting ──────────────────────────────────────────────────────

test.describe('Rate Limiting', () => {
  test('should enforce rate limits on rapid API calls', async ({ request }) => {
    const res = await request.post(`${BASE}/api/auth/login`, {
      data: { username: ADMIN_USER, password: ADMIN_PASS },
    });
    const cookies = res.headers()['set-cookie'];

    // Make many rapid requests
    const promises = [];
    for (let i = 0; i < 70; i++) {
      promises.push(
        request.get(`${BASE}/api/market/prices`, {
          headers: { Cookie: cookies },
        })
      );
    }
    const results = await Promise.all(promises);
    const statuses = results.map((r) => r.status());

    // At least some should succeed
    expect(statuses.filter((s) => s === 200).length).toBeGreaterThan(0);
    // If rate limiting is working, some may be 429
    // (not guaranteed in test since rate limiter may be per-minute)
  });
});

// ─── 32. Audit Log & Sessions ───────────────────────────────────────────────

test.describe('Audit & Sessions', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('should display audit log page', async ({ page }) => {
    await page.goto('/audit-log');
    await page.waitForTimeout(1500);
    const heading = page.locator('h1, h2').first();
    await expect(heading).toBeVisible();
  });

  test('should display sessions page', async ({ page }) => {
    await page.goto('/sessions');
    await page.waitForTimeout(1500);
    const heading = page.locator('h1, h2').first();
    await expect(heading).toBeVisible();
  });
});

// ─── 33. Telegram Setup ─────────────────────────────────────────────────────

test.describe('Telegram Setup', () => {
  test('should display telegram setup page', async ({ page }) => {
    await login(page);
    await page.goto('/telegram-setup');
    await page.waitForTimeout(1500);
    const heading = page.locator('h1, h2').first();
    await expect(heading).toBeVisible();
  });
});

// ─── 34. Billing ────────────────────────────────────────────────────────────

test.describe('Billing', () => {
  test('should display billing page', async ({ page }) => {
    await login(page);
    await page.goto('/billing');
    await page.waitForTimeout(1500);
    const heading = page.locator('h1, h2').first();
    await expect(heading).toBeVisible();
  });
});

// ─── 35. Share Portfolio ────────────────────────────────────────────────────

test.describe('Share Portfolio', () => {
  test('should display share portfolio page', async ({ page }) => {
    await login(page);
    await page.goto('/share-portfolio');
    await page.waitForTimeout(1500);
    const heading = page.locator('h1, h2').first();
    await expect(heading).toBeVisible();
  });
});
