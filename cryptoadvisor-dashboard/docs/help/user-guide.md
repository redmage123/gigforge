# AssetAdvisor User Guide

This guide covers every part of AssetAdvisor: your account, portfolios, trades, performance, allocation, statements, market tools, the AI assistant, sharing and firm accounts. For a ten-minute introduction, read the Quick Start first.

## Contents

1. Accounts and sign-in
2. Finding your way around
3. Portfolios
4. Getting trades in
5. Positions and profit and loss
6. Cash movements
7. Performance
8. Allocation and rebalancing
9. Statements
10. Markets and research
11. In-Play scanner and alerts
12. The AI assistant
13. Sharing
14. Firm accounts
15. Settings, privacy and your data

## 1. Accounts and sign-in

### Creating an account

On the sign-in page choose **Create one**, then enter your first and last name, a username and a password. Passwords must be at least 10 characters. If you were sent an invitation link to a firm, open the link first: it lets you create an account (or sign in) and joins you to the firm.

### Ways to sign in

| Method | When it is available |
|---|---|
| Username and password | Always, unless your firm requires company sign-in |
| Continue with Google | When enabled on this site. A Google account whose verified email matches a firm's domain is created automatically on first sign-in |
| Continue with Microsoft | When enabled on this site, for accounts that have linked Microsoft in Settings |
| Company sign-in (SAML) | When your firm has connected its identity provider (Okta, Entra ID, Google Workspace and others). Enter your work email or the firm's short name on the sign-in page |

You can link or unlink Google and Microsoft under **Settings → Connected sign-ins**. You cannot unlink your only way of signing in.

### Security protections

- After 5 wrong passwords, sign-in is paused for 5 minutes.
- Sessions use a secure cookie. Firms can shorten how long a session lasts (1 to 24 hours).
- **Logout** (user menu) ends your session on this device. Always log out on shared computers.
- To change your password, use **Change Password** in the user menu.

## 2. Finding your way around

- **Sidebar**: features are grouped into Markets, Portfolio, Tools and AI Assistant. Click a group name to collapse it. Use **Customize** to pin favorite pages and hide groups you don't use.
- **Search box** (top bar): type a ticker or name (AAPL, gold, EUR/USD, bitcoin) to open that instrument's page.
- **Portfolio switcher** (top bar): appears when you can see more than one portfolio. It sets which portfolio every page shows.
- **Bell**: your notifications (alerts, In-Play hits, statements ready, sync problems).
- **?**: the interactive tour, which walks through the main screens.
- **User menu** (your name): settings, password, sessions, data export, audit log, and Help & Docs.

## 3. Portfolios

Everyone starts with one portfolio. Under **Portfolio → Manage Portfolios** you can:

- **Create** more portfolios with **New portfolio**, for example to separate long-term investing from trading, or one per client. Each has a name, a type (own account, client account or model portfolio), an optional client name, and a **benchmark** (any index or instrument, such as the S&P 500) that performance is compared with.
- **Edit** a portfolio's name, type, client name or benchmark.
- **Delete** a portfolio you no longer need. You choose whether its trades and cash move to another portfolio or are deleted too. Your default (first) portfolio cannot be deleted.
- **Access**: give another AssetAdvisor user access to a portfolio as a **Viewer** (can see it) or **Manager** (can also log trades, cash and targets), and remove access again. Someone you share with can use **Remove from my list** to leave it.
- **View all combined**: open the combined view of all your own portfolios.

### The switcher

When you have more than one portfolio, the switcher in the top bar offers:

- **All portfolios**: a combined view of everything you own (portfolios shared with you are not mixed in).
- Each of your portfolios, and each portfolio shared with you.
- For firm members: each firm's portfolios, and the whole firm combined.

Combined views are read-only for actions that need a single portfolio (logging a trade, setting targets, downloading a statement). Pick one portfolio first.

## 4. Getting trades in

### Broker connections

**Portfolio → Broker Connections** links an account so trades and cash movements arrive automatically.

- **Alpaca**: paste your Alpaca API key ID and secret (tick **Paper-trading account** for a paper account). AssetAdvisor checks them with Alpaca before saving.
- **Plaid** and **SnapTrade**: connect many brokers through their sign-in windows. These show "Coming soon" until they are switched on for this site.

Connections sync every 6 hours, and you can press **Sync now** at any time. Each connection imports into the portfolio that was selected in the switcher when you connected it. Trades are never imported twice. Credentials are stored encrypted. **Disconnect** stops syncing and deletes the stored credentials; imported trades stay.

AssetAdvisor only reads from your broker. It cannot place orders.

### CSV import

**Portfolio → Import Trades (CSV)** accepts exports from Binance, BTCC, Coinbase and Kraken, a generic format, and any other broker:

- **Generic**: one row per trade with the columns `date, symbol, side, quantity, price` (and optionally `fee` and `asset_class`).
- **BTCC** or **Other exchange or broker**: upload the file, match each needed field to a column, check the preview, then import. AssetAdvisor remembers your column choices for next time.

### Logging trades by hand

**Portfolio → Trades → Add Trade**: choose the instrument, buy or sell, quantity, price and date. Short positions are supported (sell first). For futures, quantity is in contracts. For forex, it is in units of the base currency.

The assistant can also log trades for you (see section 12).

## 5. Positions and profit and loss

The **Portfolio** page shows your open positions grouped by asset class, each with quantity, average cost, current price, market value and unrealized profit or loss, plus realized profit and loss from closed trades.

- Prices for stocks, ETFs, futures and forex may be delayed by about 15 minutes. Crypto prices are live.
- Profit and loss on forex and non-USD instruments is converted to US dollars.
- **Trades** lists every trade with filters, and **Trade AI Insights** reviews your trading patterns.

## 6. Cash movements

On **Performance → Cash movements** record money moving in and out of a portfolio:

| Type | Effect |
|---|---|
| Deposit / Withdrawal | Money you add or take out. Excluded from returns, so adding money is not counted as a gain |
| Dividend / Interest | Income. Counts toward performance |
| Fee | A charge. Counts against performance |

Trades move cash automatically. Broker connections import cash movements for you.

## 7. Performance

**Performance** shows, for the selected portfolio or combined view:

- **Growth of $100**: how $100 invested at the start would have grown, next to the portfolio's benchmark.
- **Versus benchmark**: the return of the benchmark over the same period and the difference.
- **Time-weighted return (TWR)**: the return of your investment decisions, unaffected by when you added or withdrew money. Use this to compare with a benchmark or another manager.
- **Money-weighted return (MWR)**: your personal return, including the effect of the timing of your deposits and withdrawals.
- **Monthly returns**: a month-by-month table.

Accurate returns need your deposits and withdrawals recorded (section 6).

## 8. Allocation and rebalancing

On **Allocation** set a target weight for each asset class or instrument, plus a drift threshold (default 5 percentage points).

- **Current vs target** compares actual weights with your targets.
- **Trades to rebalance** lists the buys and sells that would bring the portfolio back to target. Select the ones you want and **Log selected trades** to record them in your journal at the current market price once you have placed them with your broker.
- When any weight drifts beyond the threshold you get a notification, at most once a day.

## 9. Statements

Statements are PDF reports of a portfolio's holdings, activity, cash and performance for a period.

- **Monthly statements** are produced automatically after each month ends, for every portfolio with activity. You get a notification when one is ready.
- **Any period**: on **Performance → Statements**, choose a start and end date and press **Download statement**.

Each statement includes returns against the benchmark, holdings, allocation and every transaction in the period.

Statements need a single portfolio selected in the switcher.

## 10. Markets and research

| Page | What it does |
|---|---|
| Dashboard | Indices, yields, commodities, crypto, your watchlist and quick actions |
| Instrument page | Chart, key data and news for any instrument; add to watchlist |
| Technical | Indicators (moving averages, RSI, MACD and others) on any chart |
| Sentiment | News and social sentiment scores |
| Correlation | How instruments move together |
| Order Book, Liquidations | Crypto market depth and liquidation activity |
| Carbon Desk | Carbon credit markets |
| Backtest | Test a simple strategy on historical prices |
| Tax Report | Realized gains for a year using FIFO or LIFO, downloadable as CSV |
| DCA Calculator and DCA Plans | Model or schedule regular purchases |
| Converter | Convert between currencies and crypto |

Tax figures are an aid for your own records, not tax advice.

## 11. In-Play scanner and alerts

### In-Play

Every 15 minutes the scanner checks the markets you choose (crypto perpetuals, US large-cap stocks, ETFs, futures, forex) for an unusual move: volume several times its average plus a large candle with a solid body. For each hit it finds the likely news catalyst and writes a short summary.

Under **Alert Rules** you can set:

- the timeframe (1 hour to 9 days),
- how many candles to average volume and price range over,
- the volume and range multipliers, maximum wick and minimum body size,
- an optional SurgeX filter that keeps only moves that are still accelerating,
- how many days of hits to keep.

**Phone Alerts** send hits to your phone through the free ntfy app: install it, subscribe to the topic shown on the page, and switch alerts on.

### Price alerts

On **Alerts** choose an instrument, above or below, and a price. You are notified when it crosses. Triggered alerts are listed below.

## 12. The AI assistant

The chat button at the bottom right of every page opens the assistant. It can see your portfolios, trades, alerts and settings, and answer questions such as:

- "What is my biggest risk right now?"
- "Why did my portfolio drop this week?"
- "Explain the last In-Play hit on NVDA."

It can also propose changes: log a trade, create a price alert, add or remove a watchlist item, or change your In-Play rules. Every proposal appears as a card with **Confirm** and **Cancel**. Nothing changes until you confirm. The assistant never places real orders.

Previous conversations are kept so you can continue later. **AI Memory** (user menu) shows the facts the assistant has remembered about you and lets you delete them.

The **AI Assistant** section of the sidebar has dedicated reports: Market Briefing, Risk Report, Tax Optimizer, Portfolio Builder, Pattern Recognition and Trading Coach.

AI output can be wrong. Treat it as a starting point for your own judgment, not financial advice.

## 13. Sharing

There are two ways to share:

- **With another user** (Manage Portfolios → share): they sign in to see the portfolio, as Viewer or Manager. Best for an adviser, partner or colleague.
- **A public link** (Portfolio → Share): a read-only view anyone with the link can open, without signing in. You can see and revoke active links on the same page.

## 14. Firm accounts

Firms are for teams that manage portfolios together. They are optional: personal accounts keep every feature.

### Creating a firm and inviting members

1. **Portfolio → Firm Accounts → Create a firm**. You become its admin.
2. On the firm page, under **Invitations**, choose a role and create an invitation link. Send it to the person. Links expire after 7 days and can be revoked.
3. When they open the link they sign in or create an account, and join with that role.

### Roles

| Role | Can do |
|---|---|
| Admin | Everything: members, invitations, sign-in policy, company sign-in, firm portfolios, audit trail |
| Portfolio manager (pm) | Create and manage firm portfolios; log trades, cash and targets |
| Analyst | View all firm portfolios |
| Compliance | View all firm portfolios, the audit trail and access reviews |
| Viewer | View all firm portfolios |

### Firm portfolios

Under **Firm portfolios**, admins and portfolio managers create portfolios owned by the firm (house account, client account or model portfolio), or use **Move into firm** to transfer one of their personal portfolios. Firm portfolios appear in every member's switcher and work with every portfolio feature.

### Members

Admins can change a member's role, **suspend** them (immediate loss of access, reversible) or **remove** them. A firm always keeps at least one admin. **Confirm access review** records a periodic review of who has access, which auditors ask for.

### Sign-in policy

- **Require company sign-in**: members must sign in with Google, Microsoft or the firm's SAML provider. Admins can still use a password so the firm cannot lock itself out.
- **Allowed email domains**: Google accounts with a verified email on these domains join the firm automatically on first sign-in, with the default role you choose.
- **Session length**: 1 to 24 hours for members.

### Company sign-in (SAML 2.0)

Admins paste the identity provider's metadata (entity ID, sign-in URL and signing certificate) under **Company sign-in**. The page shows AssetAdvisor's own metadata URL and sign-in address to give to the identity provider. Use **Test: link my company sign-in** to check the setup with your own account. Members then sign in by entering their work email address or the firm's short name under company sign-in on the sign-in page.

### Audit trail

Admins and compliance can search the firm's audit trail and export it as CSV. It records sign-ins, membership and role changes, invitations, policy changes, and every change to firm portfolios (trades, cash, targets, sharing, broker connections). Entries cannot be edited or deleted, and the system checks daily that none have been tampered with.

## 15. Settings, privacy and your data

- **Settings**: profile, display preferences, dashboard widgets, notification preferences, security, connected sign-ins, and account deletion.
- **API Keys**: keys for optional third-party data integrations, stored encrypted.
- **Telegram Setup**: receive notifications in Telegram.
- **Data Export**: download everything AssetAdvisor holds about you as a JSON file.
- **Audit Log**: your own account activity.
- **Delete account** (Settings): permanently deletes your portfolios, trades, cash, statements, connections, sign-in links and AI memory. Firm audit entries are kept for the firm's records but your name is removed from them. If you are the only admin of a firm, make someone else admin or delete the firm first.
