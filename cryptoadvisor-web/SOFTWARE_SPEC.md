# Software Specification
## Project: CryptoAdvisor Web
## Customer: braun.brelin@ai-elevate.ai
## Date: 2026-03-23

---

## 1. Executive Summary

CryptoAdvisor Web is a dark-themed, data-rich cryptocurrency portfolio dashboard built as a single-page React application. It gives crypto investors a consolidated view of their holdings, live-style price charts, AI-generated trading signals, configurable price alerts, transaction history, and a watchlist — all in one responsive interface.

The product solves a real friction point for active crypto traders: data is currently spread across exchanges, portfolio trackers, and signal services. CryptoAdvisor Web unifies it into a single professional dashboard modelled on institutional trading terminals, but designed for retail investors who want clarity without complexity.

This delivery is a fully functional frontend demo. All data is served from a typed in-memory mock layer — no API keys, no network calls, no infrastructure required. The architecture is explicitly designed so the mock layer can be replaced with a real backend at a later phase without touching any component code.

**Who it's for:** Retail cryptocurrency investors who actively manage a multi-asset portfolio and want performance analytics, price chart analysis, and AI-driven signal guidance in one place.

**What problem it solves:** Eliminates the need to context-switch between a portfolio tracker, a charting tool, a signal service, and a transaction log. Everything is on one screen.

---

## 2. User Personas

### Persona A — The Active Retail Trader ("Alex")
- **Profile:** Holds 4–10 crypto assets, checks portfolio 2–3× daily, makes 5–20 trades per month
- **Goals:** See total portfolio value and P&L at a glance; monitor price action with candlestick charts; act on AI signals quickly; review trade history
- **Pain points:** Switching between Binance, CoinGecko, and a spreadsheet is slow and error-prone
- **Tech comfort:** High — comfortable with trading terminals, used to data-dense UIs
- **Key pages used:** Dashboard (primary), Charts, Signals, Transactions

### Persona B — The Portfolio Watcher ("Morgan")
- **Profile:** Holds 2–5 assets long-term, checks portfolio weekly, rarely trades
- **Goals:** Understand overall allocation, see if holdings are up or down, track when price alerts fire
- **Pain points:** Doesn't want to dig through noise — just wants clean summaries
- **Tech comfort:** Medium — comfortable with apps, not with trading jargon
- **Key pages used:** Dashboard, Portfolio, Alerts, Watchlist

### Persona C — The Demo Evaluator ("Braun")
- **Profile:** Internal stakeholder reviewing the project as a portfolio demo for GigForge
- **Goals:** See a professional, complete, shippable frontend demo that showcases technical capability across charts, data tables, state management, and responsive design
- **Pain points:** Demos that look half-finished, have placeholder data, or fail visually on mobile
- **Key pages used:** All pages; Docker deployment for local review

---

## 3. Functional Requirements

### FR-001: Portfolio Overview — Stat Cards
- **Description:** The user can see their total portfolio value, 24-hour P&L in dollars, 24-hour P&L as a percentage, and a sparkline trend for each metric displayed as prominent stat cards at the top of the dashboard.
- **User story:** As Alex, I want to see my total portfolio value and 24h change the moment I open the app, so that I can immediately know if I'm up or down without scrolling.
- **Acceptance criteria:**
  - [ ] Displays total portfolio value in USD formatted with comma separators (e.g. `$84,320.47`)
  - [ ] Displays 24h dollar change with sign (e.g. `+$1,204.33` or `-$430.10`)
  - [ ] Displays 24h percentage change with sign (e.g. `+1.45%` or `-0.51%`)
  - [ ] Positive values are displayed in green (`#22c55e`); negative values in red (`#ef4444`)
  - [ ] Each stat card includes a mini sparkline (AreaChart) showing the trend
  - [ ] Stat cards display a loading skeleton while data is fetching (150ms delay)
  - [ ] Stat cards display an error state if the data fetch fails
- **Priority:** Must-have

### FR-002: Portfolio Allocation Pie Chart
- **Description:** The user can see how their portfolio is distributed across assets as a colour-coded pie chart with a legend showing asset name, symbol, and allocation percentage.
- **User story:** As Morgan, I want to see my portfolio allocation as a visual chart, so that I can instantly understand if I'm overexposed to any single asset.
- **Acceptance criteria:**
  - [ ] Renders a Recharts `PieChart` with one slice per held asset
  - [ ] Each slice is labelled with the asset symbol (BTC, ETH, SOL, ADA)
  - [ ] Tooltip on hover shows asset name and allocation percentage (e.g. `Bitcoin — 42.3%`)
  - [ ] Legend lists all assets with their allocation percentages
  - [ ] Slices use a distinct colour per asset from the design system palette
  - [ ] Chart fills the available width responsively (`ResponsiveContainer`)
  - [ ] Displays loading skeleton while fetching; error state on failure
- **Priority:** Must-have

### FR-003: Candlestick Price Chart
- **Description:** The user can view OHLCV (open/high/low/close/volume) candlestick charts for any supported asset across three timeframes, with volume bars displayed below the price chart.
- **User story:** As Alex, I want to analyse price action on a candlestick chart for any asset I choose, so that I can identify patterns and time my entries and exits.
- **Acceptance criteria:**
  - [ ] Renders a Recharts `ComposedChart` with a custom `CandlestickBar` shape
  - [ ] Green candles for bullish bars (close ≥ open); red candles for bearish bars (close < open)
  - [ ] Volume `BarChart` rendered below the price chart in the same container
  - [ ] Timeframe selector with three buttons: `1D`, `1W`, `1M` — clicking switches the displayed dataset
  - [ ] Active timeframe button is visually highlighted
  - [ ] Asset selector dropdown with options: BTC, ETH, SOL, ADA — switching reloads chart data
  - [ ] Tooltip on hover shows O / H / L / C values and volume for the hovered candle
  - [ ] X-axis shows date/time labels appropriate to the selected timeframe
  - [ ] Chart fills available width responsively
  - [ ] Displays loading skeleton while fetching; error state on failure
- **Priority:** Must-have

### FR-004: Watchlist Panel
- **Description:** The user can view a watchlist of tracked assets showing current price, 24-hour change, and a mini sparkline for each asset.
- **User story:** As Alex, I want a watchlist panel that shows prices and trends for assets I'm tracking, so that I can monitor opportunities without holding them.
- **Acceptance criteria:**
  - [ ] Lists 6 watchlist assets (BTC, ETH, SOL, ADA + 2 others from mock data)
  - [ ] Each row shows: asset name, symbol, current price (USD), 24h change (dollar), 24h change (%), sparkline
  - [ ] 24h change values are colour-coded: positive = green, negative = red
  - [ ] Sparkline is a mini `AreaChart` (12 data points) rendered inline per row
  - [ ] Displays loading skeleton while fetching; error state on failure
  - [ ] Panel scrolls if content overflows its allocated height
- **Priority:** Must-have

### FR-005: Asset Selector — Chart Context Switching
- **Description:** The user can switch which asset's price chart is displayed by selecting from a dropdown or clicking an asset in the watchlist.
- **User story:** As Alex, I want to switch between BTC, ETH, SOL, and ADA on the chart with one click, so that I can compare price action across my holdings quickly.
- **Acceptance criteria:**
  - [ ] Asset selector dropdown is rendered above the candlestick chart
  - [ ] Selecting a new asset triggers a data reload and re-renders the chart
  - [ ] The selected asset label is shown in the chart header/title
  - [ ] Chart title updates to reflect the selected asset (e.g. `Bitcoin (BTC)`)
  - [ ] Selected asset persists when switching timeframes (1D/1W/1M)
- **Priority:** Should-have

### FR-006: AI Trading Signals Panel
- **Description:** The user can view AI-generated trading signals for their assets, including the direction (BUY/SELL/HOLD), confidence score, reason, and how recently the signal was generated.
- **User story:** As Alex, I want to see AI trading signals with confidence ratings, so that I can use them as one input when deciding whether to buy, sell, or hold an asset.
- **Acceptance criteria:**
  - [ ] Each signal is displayed as a card showing: asset name/symbol, direction badge, confidence bar (0–100%), reason text, relative timestamp
  - [ ] Direction badges: BUY = green background, SELL = red background, HOLD = yellow/amber background
  - [ ] Confidence is displayed as both a percentage number and a visual progress bar
  - [ ] Timestamps are displayed in relative format: "2h ago", "Just now", "3d ago"
  - [ ] Signals are sorted by timestamp descending (most recent first)
  - [ ] Panel scrolls if more than 5 signals are present
  - [ ] Displays loading skeleton while fetching; error state on failure
- **Priority:** Must-have

### FR-007: Alerts Panel
- **Description:** The user can view their configured price alerts, seeing the target asset, threshold price, condition (above/below), current price, and whether the alert has triggered.
- **User story:** As Morgan, I want to see all my price alerts and their current status at a glance, so that I know which thresholds have been hit without having to check prices manually.
- **Acceptance criteria:**
  - [ ] Each alert is displayed as a card showing: asset, condition (`Price above $X` or `Price below $X`), current price, triggered status
  - [ ] Triggered alerts are visually distinguished from active alerts (e.g. different border colour, badge)
  - [ ] Current price is displayed alongside the threshold for quick comparison
  - [ ] "Triggered" alerts show a "TRIGGERED" badge in an appropriate colour (e.g. amber/orange)
  - [ ] "Active" alerts show an "ACTIVE" badge in green
  - [ ] Panel scrolls if content overflows
  - [ ] Displays loading skeleton while fetching; error state on failure
- **Priority:** Must-have

### FR-008: Transaction History Table
- **Description:** The user can view a sortable table of their recent transactions, including date, asset, transaction type, amount, price, total value, and status.
- **User story:** As Alex, I want to review my past 20 trades in a sortable table, so that I can reconcile my activity and track performance by asset.
- **Acceptance criteria:**
  - [ ] Table columns: Date, Asset, Type, Amount, Price (USD), Total (USD), Status
  - [ ] Type column renders a colour-coded badge: BUY = green, SELL = red
  - [ ] Status column renders a badge: `completed` = grey/muted, `pending` = yellow, `failed` = red
  - [ ] Clicking any column header sorts the table ascending by that column; clicking again reverses to descending
  - [ ] Active sort column is visually indicated (arrow icon or highlight)
  - [ ] Alternating row background shading for readability (zebra striping)
  - [ ] Displays the 20 most recent transactions from mock data
  - [ ] Displays loading skeleton while fetching; error state on failure
- **Priority:** Must-have

### FR-009: Sidebar Navigation
- **Description:** A persistent left-hand sidebar provides navigation between the seven main sections of the application, with the active page highlighted.
- **User story:** As any user, I want a clear navigation sidebar so that I can move between dashboard sections without losing my place.
- **Acceptance criteria:**
  - [ ] Sidebar contains links to all seven pages: Dashboard, Portfolio, Charts, Signals, Alerts, Transactions, Watchlist
  - [ ] Each link shows an icon and a label
  - [ ] The currently active page link is visually highlighted (distinct background/text colour)
  - [ ] Active state updates immediately on navigation
  - [ ] Sidebar is fixed/sticky and visible at all times on desktop (≥1280px)
  - [ ] On mobile (≤768px), sidebar collapses and is toggled by a hamburger/menu button
  - [ ] GigForge / CryptoAdvisor logo or wordmark is displayed at the top of the sidebar
- **Priority:** Must-have

### FR-010: Page Header
- **Description:** A top header bar displays the current page title and a placeholder global search input.
- **User story:** As any user, I want a clear page title so that I always know which section I'm in.
- **Acceptance criteria:**
  - [ ] Header displays the current page title (e.g. "Dashboard", "Signals", "Transactions")
  - [ ] Page title updates on route change
  - [ ] A search input field is present as a visual placeholder (non-functional in this delivery)
  - [ ] Header is visually distinct from the sidebar and content area
- **Priority:** Must-have

### FR-011: Portfolio Holdings Page
- **Description:** A dedicated Portfolio page shows a full holdings table with per-asset breakdown: amount held, current price, total value, average buy price, P&L in dollars, and P&L as a percentage.
- **User story:** As Morgan, I want a detailed breakdown of each asset I hold, so that I can see exactly how each position is performing.
- **Acceptance criteria:**
  - [ ] Full-page table with columns: Asset, Symbol, Amount, Current Price, Total Value, Avg Buy Price, P&L ($), P&L (%)
  - [ ] P&L values colour-coded: positive = green, negative = red
  - [ ] Allocation pie chart repeated or summarised on this page
  - [ ] Shows all holdings from mock portfolio data
  - [ ] Displays loading skeleton while fetching
- **Priority:** Must-have

### FR-012: Full Charts Page
- **Description:** A dedicated Charts page presents the candlestick chart at full-page width with extended controls, giving the user more screen space for technical analysis.
- **User story:** As Alex, I want a full-page chart view so that I can do serious technical analysis without the dashboard layout constraining the chart size.
- **Acceptance criteria:**
  - [ ] Candlestick chart occupies the full content area (not a panel within a grid)
  - [ ] Asset selector and timeframe selector (1D / 1W / 1M) are both present
  - [ ] Volume bars rendered below the chart
  - [ ] Tooltip shows O/H/L/C on hover
  - [ ] Chart fills the full available width at all viewport sizes
- **Priority:** Must-have

### FR-013: Full Signals Page
- **Description:** A dedicated Signals page shows the complete list of AI trading signals with the option to filter by direction.
- **User story:** As Alex, I want to see all signals on a dedicated page so that I can review them without the summary panel's scroll constraint.
- **Acceptance criteria:**
  - [ ] Full list of signals from mock data (not capped at 5)
  - [ ] Filter controls to show: All / BUY only / SELL only / HOLD only
  - [ ] Active filter is visually highlighted
  - [ ] Signal cards show all the same information as the dashboard panel (FR-006)
  - [ ] Sorted by timestamp descending by default
- **Priority:** Must-have

### FR-014: Full Alerts Page
- **Description:** A dedicated Alerts page shows all price alerts with filters for triggered vs active status.
- **User story:** As Morgan, I want a full alerts page with filtering so that I can review my active alerts separately from ones that have already fired.
- **Acceptance criteria:**
  - [ ] Full list of alerts from mock data
  - [ ] Filter tabs/buttons: All / Active / Triggered
  - [ ] Active filter is visually highlighted
  - [ ] Alert cards show the same information as the dashboard panel (FR-007)
- **Priority:** Must-have

### FR-015: Full Transactions Page
- **Description:** A dedicated Transactions page shows the full sortable transaction history table.
- **User story:** As Alex, I want a full-page transactions table so that I can sort and review my complete trade history without the dashboard panel's row limit.
- **Acceptance criteria:**
  - [ ] Full sortable table (same columns as FR-008)
  - [ ] All 20 transactions visible (no row cap)
  - [ ] All sort and badge behaviour identical to dashboard panel
- **Priority:** Must-have

### FR-016: Full Watchlist Page
- **Description:** A dedicated Watchlist page shows all watched assets with larger sparkline charts.
- **User story:** As Alex, I want a full watchlist page so that I can see trend charts in more detail than the compact dashboard panel allows.
- **Acceptance criteria:**
  - [ ] All 6 watchlist assets displayed
  - [ ] Larger sparklines than the dashboard panel (more visual space)
  - [ ] All price and change data identical to the dashboard panel (FR-004)
- **Priority:** Must-have

### FR-017: Loading Skeleton States
- **Description:** Every panel and table that fetches data shows an animated skeleton placeholder during the 150ms loading window.
- **User story:** As any user, I want to see a loading skeleton instead of blank panels, so that the app feels responsive and I know data is on its way.
- **Acceptance criteria:**
  - [ ] All seven data panels (portfolio stats, pie chart, candlestick, watchlist, signals, alerts, transactions) show a skeleton while loading
  - [ ] Skeletons match the approximate shape of the loaded content (e.g. card-shaped, table-row-shaped)
  - [ ] Skeletons animate with a shimmer effect (CSS animation)
  - [ ] Skeletons disappear immediately when data resolves
- **Priority:** Should-have

### FR-018: Empty and Error States
- **Description:** Every panel shows a purposeful empty state when there is no data to display, and a clear error state when a data fetch fails.
- **User story:** As any user, I want clear feedback when something goes wrong or there's no data, so that I'm never left looking at a broken or blank panel.
- **Acceptance criteria:**
  - [ ] Empty state: an icon and short explanatory message centred in the panel (e.g. "No signals yet")
  - [ ] Error state: a red/amber banner with the error message and a retry affordance (text or button)
  - [ ] Both states are implemented for all seven data panels
  - [ ] Error state is triggered when the mock function rejects (testable)
- **Priority:** Should-have

### FR-019: Responsive Layout
- **Description:** The application is fully usable at three breakpoints: mobile (375px), tablet (768px), and desktop (1280px+).
- **User story:** As Morgan, I want to check my portfolio from my phone, so that I don't have to open my laptop just to see if I'm up or down today.
- **Acceptance criteria:**
  - [ ] At 1280px (desktop): sidebar is always visible; dashboard uses a multi-column grid
  - [ ] At 768px (tablet): sidebar collapses or is replaced with a top nav; content stacks to fewer columns
  - [ ] At 375px (mobile): single-column layout; sidebar is hidden behind a toggle button; all content accessible
  - [ ] No horizontal scroll at any breakpoint
  - [ ] Tap targets are ≥44px on mobile
  - [ ] Charts resize and remain readable at all breakpoints
- **Priority:** Must-have

### FR-020: Dark Theme
- **Description:** The entire application uses a dark financial theme with CSS design tokens defining all colours. There is no light mode toggle — the app is dark-only.
- **User story:** As Alex, I want a dark-themed UI that reduces eye strain during extended trading sessions and feels like a professional terminal.
- **Acceptance criteria:**
  - [ ] `dark` class applied to `<html>` at startup; never toggled
  - [ ] All colour values come from CSS custom properties defined in `src/index.css`
  - [ ] No hardcoded hex colour values inside component TSX files
  - [ ] Background: near-black (`#0f172a` or equivalent); surface cards: slightly lighter (`#1e293b` or equivalent)
  - [ ] Text: primary white/off-white; secondary muted grey
  - [ ] Accent colour: a single brand accent (e.g. indigo or blue) used for interactive elements
  - [ ] Financial colours: `#22c55e` for gains/positive; `#ef4444` for losses/negative
- **Priority:** Must-have

---

## 4. User Flows

### Flow 1 — First Load / Dashboard View
1. User opens the app at `http://localhost:5000` (Docker) or `http://localhost:5173` (dev)
2. App renders immediately with the dark shell (sidebar + header + grid layout)
3. All dashboard panels display animated loading skeletons simultaneously
4. After ~150ms, all mock data resolves; skeletons are replaced with live content
5. User sees: stat cards (total value, P&L), allocation pie, candlestick chart (BTC / 1D), watchlist, signals panel, alerts panel, transaction table summary
6. User reads their P&L from the stat cards — green for gains, red for losses

### Flow 2 — Switching Asset on Price Chart
1. User is on Dashboard or Charts page
2. User clicks the asset selector dropdown — it opens showing BTC, ETH, SOL, ADA
3. User selects ETH
4. Chart panel shows loading skeleton briefly (150ms)
5. Chart re-renders with ETH candlestick data for the current timeframe
6. Chart title updates to "Ethereum (ETH)"
7. User clicks "1W" timeframe button — chart reloads with weekly candle data for ETH
8. Active timeframe button is highlighted; other buttons are muted

### Flow 3 — Reviewing AI Signals
1. User clicks "Signals" in the sidebar navigation
2. URL updates to `/signals`; Signals page renders
3. Full list of signals loads with BUY/SELL/HOLD badges visible
4. User clicks "BUY" filter button — list filters to show only BUY signals
5. User reads signal reasoning text and confidence bars
6. User clicks "All" to clear filter and sees all signals again

### Flow 4 — Checking Price Alerts
1. User clicks "Alerts" in the sidebar
2. URL updates to `/alerts`; Alerts page renders
3. Full alerts list loads showing active and triggered alerts
4. User clicks "Triggered" tab — list filters to show only alerts that have fired
5. User notes the triggered asset/price and returns to Dashboard via sidebar

### Flow 5 — Sorting Transaction History
1. User clicks "Transactions" in the sidebar
2. Full transactions table renders with 20 rows
3. User clicks the "Asset" column header — rows sort alphabetically ascending by asset
4. User clicks "Asset" again — rows sort descending
5. User clicks "Total" column header — rows sort by trade value ascending
6. User identifies their largest trade by value

### Flow 6 — Mobile Dashboard
1. User opens the app on a 375px mobile device
2. Sidebar is hidden; a hamburger menu icon is visible in the header
3. Dashboard content is stacked in a single column
4. User taps the hamburger icon — sidebar slides in as an overlay
5. User taps "Portfolio" — sidebar closes; Portfolio page renders single-column
6. User taps the hamburger icon again to return to nav

---

## 5. Scope & Constraints

### In Scope

- React 19 SPA with TypeScript 5 (strict mode)
- Dark theme with CSS design token system (no light mode)
- Seven routed pages: Dashboard, Portfolio, Charts, Signals, Alerts, Transactions, Watchlist
- Portfolio stat cards with sparklines
- Portfolio allocation pie chart (Recharts)
- Candlestick price chart with volume bars, asset selector, and 1D/1W/1M timeframe selector (Recharts)
- Watchlist panel with mini sparklines
- AI trading signals panel with direction badges and confidence bars
- Price alerts panel with triggered/active status
- Sortable transaction history table with type/status badges
- Loading skeleton states for all data panels
- Empty and error states for all data panels
- Responsive layout at 375px / 768px / 1280px
- Typed in-memory mock data layer (`src/api/mock/`) with 150ms simulated async delay
- TanStack Query v5 for data fetching and caching
- React Router v7 for client-side routing
- Vitest + Testing Library test suite, ≥80% coverage on components/hooks/mock
- Multi-stage Dockerfile (nginx:alpine) with docker-compose, served on port 5000
- GitHub Actions CI (test + build + docker-build jobs)
- README with setup, run, test, and Docker instructions

### Out of Scope

- Real cryptocurrency API calls (no CoinGecko, Binance, CryptoCompare, or similar)
- User authentication or login
- Account creation or user management
- Persistent data storage (no localStorage, no database, no server)
- Creating, editing, or deleting alerts within the UI
- Creating, editing, or deleting watchlist items within the UI
- Placing trades or order management
- Push notifications or real-time WebSocket price feeds
- Light mode or theme toggle
- Internationalisation (i18n) or currency switching
- Export to CSV/PDF
- Backend server or REST API
- Payment or subscription features

### Budget and Timeline Constraints

- **Project type:** Internal portfolio demo — no billing
- **Tier:** L (8–16h estimated developer time)
- **Sprint 0:** 0.5 days — UX design specs and design tokens
- **Sprint 1:** 1 day — project scaffold, mock data layer, app shell
- **Sprint 2:** 1.5 days — core dashboard components (portfolio, charts, watchlist)
- **Sprint 3:** 2 days — signals, alerts, transactions, polish, tests, Docker
- **Total timeline:** 5 days
- **Team:** gigforge-pm (PM), gigforge-engineer / gigforge-dev-frontend (engineering), gigforge-ux (UX design)
- **Stack constraint:** React + Tailwind as specified by the customer; Recharts for charts as specified in the sprint plan and tech stack decision

---

## 6. Acceptance Criteria (Project Level)

The project is considered **Done** when all of the following are true:

### Functional Completeness
- [ ] All seven pages are routable and render without crashing: Dashboard, Portfolio, Charts, Signals, Alerts, Transactions, Watchlist
- [ ] All dashboard panels render with realistic mock data: stat cards, pie chart, candlestick chart, watchlist, signals, alerts, transactions table
- [ ] Candlestick chart responds to asset selection (BTC/ETH/SOL/ADA) and timeframe selection (1D/1W/1M)
- [ ] Transaction history table is sortable by all columns (ascending and descending)
- [ ] Signals page filter (All/BUY/SELL/HOLD) correctly filters the visible signals
- [ ] Alerts page filter (All/Active/Triggered) correctly filters the visible alerts
- [ ] Sidebar navigation links to all seven pages; active page is highlighted
- [ ] All panels show loading skeletons during the 150ms mock fetch delay
- [ ] All panels show appropriate error states when data fetch fails

### Visual Quality
- [ ] Dark theme is applied consistently across all pages and components
- [ ] No hardcoded hex colours in component TSX files
- [ ] BUY badges are green, SELL badges are red, HOLD badges are amber/yellow — consistently
- [ ] Positive values are green, negative values are red — consistently
- [ ] No visible layout breaks, overflow issues, or unstyled content at 375px, 768px, or 1280px viewport widths

### Code Quality
- [ ] `pnpm build` completes with zero TypeScript errors (`tsc --noEmit` passes)
- [ ] Zero use of `any` type anywhere in `src/`
- [ ] All mock service functions return `Promise<T>` with proper TypeScript types
- [ ] Components only import from `src/api/index.ts` (never directly from `src/api/mock/`)
- [ ] All React Query keys follow the defined convention

### Test Suite
- [ ] `pnpm test --run` exits with code 0 (zero test failures)
- [ ] Every component in `src/components/` has a corresponding `*.test.tsx` file
- [ ] Line coverage ≥ 80% on `src/components/`, `src/hooks/`, and `src/api/mock/`
- [ ] Recharts is mocked in `src/setupTests.ts` to prevent jsdom SVG/ResizeObserver failures

### Deployment
- [ ] `docker build -t cryptoadvisor-web .` completes successfully
- [ ] `docker run -p 5000:80 cryptoadvisor-web` serves the application at `http://localhost:5000`
- [ ] Docker image is under 100MB
- [ ] `docker-compose up --build` starts the service correctly
- [ ] nginx config includes `try_files $uri /index.html` for SPA routing
- [ ] GitHub Actions CI passes all three jobs: `test`, `build`, `docker-build`

### Documentation
- [ ] `README.md` includes: project description, prerequisites, `pnpm dev` setup, `pnpm test` instructions, Docker build and run commands
- [ ] `specs/design-system.md` documents all design tokens (colour, typography, spacing)

### Approval Gate
- [ ] **QA Engineer** has run the full test suite, manually verified every acceptance criterion above, and taken screenshots of all seven pages at desktop and mobile viewports — verdict: APPROVED
- [ ] **Client Advocate** has reviewed the running application as a paying client, scored across brief match / value for money / usability / professionalism / completeness — verdict: APPROVED

Both must approve. No deliverable ships without both sign-offs.
