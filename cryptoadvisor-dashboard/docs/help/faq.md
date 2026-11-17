# AssetAdvisor FAQ

## Getting started

### Do I need to belong to a firm?

No. Personal accounts have every portfolio feature: multiple portfolios, performance, allocation, statements, broker connections and the AI assistant. Firm accounts are an optional extra for teams.

### What can I track?

US stocks and ETFs, futures (equity index, commodity and Treasury), forex pairs, government bond yields and crypto (spot and perpetuals). Long and short positions are both supported.

### Is AssetAdvisor a broker? Can it place trades?

No. AssetAdvisor records and analyzes your trades. It never places orders. Broker connections only read your trades and cash; "log a trade" (by hand, from rebalancing or through the assistant) only records it in your journal.

## Sign-in and accounts

### I forgot my password.

There is no self-service reset yet. Contact AssetAdvisor support. After checking your identity, support sets a temporary password, which you then change under **Change Password**. If you have linked Google or Microsoft in Settings, you can sign in with that instead.

### My sign-in is paused.

After 5 wrong passwords in a row, sign-in is paused for 5 minutes. Wait, then try again.

### Why can't I sign in with my password any more?

Your firm has switched on **Require company sign-in**. Use the Google, Microsoft or company sign-in button instead. Firm admins can still use a password.

### Why does the Google or Microsoft button not appear?

These are switched on per site. If they are not shown, they are not available yet; use your password.

### Why was I signed out after a few hours?

Firms can set a shorter session length (1 to 24 hours) for their members. Sign in again.

### I think someone else is signed in to my account.

Open **Active Sessions** in the user menu and check the devices and IP addresses. Use **Sign out all other devices**, then change your password (which also signs out every other device). If anything looks changed, contact support.

### Is there two-factor authentication?

Not yet for sign-in. It is planned.

### How do I delete my account?

**Settings → Delete account**. This permanently deletes your portfolios, trades, cash, statements, broker connections, linked sign-ins and AI memory. If you are the only admin of a firm, make someone else admin or delete the firm first.

## Trades and data

### Which brokers can I connect?

Alpaca today. Plaid and SnapTrade, which together cover most US and Canadian brokers, are built and show "Coming soon" until they are switched on. Everything else can be imported from a CSV export.

### My broker isn't in the CSV list.

Choose **Other exchange or broker**, upload the file and match its columns once. AssetAdvisor remembers the mapping for next time.

### My broker connection shows a sync error.

The **Result** column on Broker Connections shows the last sync's outcome in red when it failed. Usually the API key was revoked or expired at the broker. Disconnect and connect again with a new key. Imported trades are kept.

### Will syncing create duplicate trades?

No. Each imported trade carries the broker's own id and is skipped if it has already been imported.

### How current are prices?

Crypto prices are live. Stocks, ETFs, futures and forex may be delayed by about 15 minutes.

### Why don't my returns look right?

Usually because deposits or withdrawals are not recorded. Add them under **Performance → Cash movements**; without them, money you added looks like a gain.

### What is the difference between time-weighted and money-weighted return?

Time-weighted return measures the investment decisions only and ignores when money was added or withdrawn; use it to compare with a benchmark or another manager. Money-weighted return is your personal experience, including the timing of your deposits and withdrawals.

### Why can't I log a trade or download a statement?

The switcher in the top bar is on a combined view ("All portfolios" or a whole firm). Pick a single portfolio. If the portfolio was shared with you as a Viewer, or you have a read-only firm role, you can view it but not change it.

### Can I get my data out?

Yes. **Data Export** (user menu) downloads everything as a JSON file. The tax report and the firm audit trail can be downloaded as CSV, and statements as PDF.

## Sharing and firms

### What's the difference between sharing with a user and a public share link?

Sharing with a user (Manage Portfolios → Access) requires them to sign in and can grant view or manage rights. A public share link (Portfolio → Share) is a read-only page anyone with the link can open. Revoke links you no longer need.

### How do I add someone to my firm?

On the firm page, under **Invitations**, choose their role and create a link, then send it to them. Links expire after 7 days. If your firm has allowed email domains set, colleagues can also simply sign in with Google using their work email.

### Someone left the firm. What should I do?

On the firm page, **suspend** or **remove** them under Members. Access stops immediately. Their actions remain in the audit trail.

### Can firm members see my personal portfolios?

No. Firm members see only portfolios owned by the firm. Your personal portfolios stay private unless you share them or move them into the firm.

### Who can see the audit trail?

Firm admins and the compliance role see the firm's trail. Every user sees their own activity under **Audit Log**.

## The AI assistant

### Can the assistant change my data without asking?

No. It can propose a change (log a trade, create an alert, edit the watchlist or In-Play rules), but it only happens when you press **Confirm** on the card.

### What does the assistant know about me?

Your portfolios, trades, alerts, settings and the facts in **AI Memory**, which you can view and delete. It does not see other users' data.

### Is the AI's analysis financial advice?

No. AI output can be wrong. Use it as input to your own judgment.

## Security and privacy

### How is my data protected?

Traffic is encrypted (HTTPS with HSTS). Passwords are hashed with bcrypt. Broker credentials are encrypted before storage. Pages carry a strict content security policy. The database is not reachable from the internet and is backed up nightly with an automatic restore test. Firm activity is recorded in a tamper-evident audit trail.

### Is AssetAdvisor SOC 2 certified?

Not yet. The technical controls are in place and the formal audit is being prepared.

### Who are your service providers?

Hosting (Hetzner), network, TLS and cookie-free page-load analytics (Cloudflare), AI (Anthropic), market data (Binance, Yahoo Finance, CoinGecko), and, only if you use them, Google or Microsoft sign-in, Alpaca, Plaid and SnapTrade.
