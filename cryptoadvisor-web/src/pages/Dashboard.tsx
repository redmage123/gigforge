import { Link } from 'react-router'
import { usePortfolio } from '../hooks/usePortfolio'
import { useSignals } from '../hooks/useSignals'
import { useAlerts } from '../hooks/useAlerts'
import { useTransactions } from '../hooks/useTransactions'
import { useWatchlist } from '../hooks/useWatchlist'
import StatCard from '../components/ui/StatCard'
import Panel from '../components/ui/Panel'
import Badge from '../components/ui/Badge'
import Sparkline from '../components/charts/Sparkline'
import AllocationPieChart from '../components/charts/AllocationPieChart'
import CandlestickChart from '../components/charts/CandlestickChart'
import LoadingSkeleton, { StatCardSkeleton } from '../components/ui/LoadingSkeleton'
import ErrorBanner from '../components/ui/ErrorBanner'

function formatUSD(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

function formatPct(value: number): string {
  const sign = value >= 0 ? '+' : ''
  return `${sign}${value.toFixed(2)}%`
}

function relativeTime(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export default function Dashboard() {
  const portfolio = usePortfolio()
  const signals = useSignals()
  const alerts = useAlerts()
  const transactions = useTransactions()
  const watchlist = useWatchlist()

  return (
    <div className="space-y-4">
      {/* Row 1: Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {portfolio.isLoading ? (
          <>
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </>
        ) : portfolio.isError ? (
          <div className="col-span-3"><ErrorBanner /></div>
        ) : portfolio.data ? (
          <>
            <StatCard
              label="Total Portfolio Value"
              value={formatUSD(portfolio.data.totalValue)}
              sparklineData={portfolio.data.sparkline}
            />
            <StatCard
              label="24h Change"
              value={formatUSD(portfolio.data.change24h)}
              change={formatPct(portfolio.data.changePct24h)}
              changeType={portfolio.data.change24h >= 0 ? 'positive' : 'negative'}
              sparklineData={portfolio.data.sparkline}
            />
            <StatCard
              label="24h Change %"
              value={formatPct(portfolio.data.changePct24h)}
              changeType={portfolio.data.changePct24h >= 0 ? 'positive' : 'negative'}
              sparklineData={portfolio.data.sparkline}
            />
          </>
        ) : null}
      </div>

      {/* Row 2: Pie Chart + Candlestick */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Panel title="Portfolio Allocation">
          {portfolio.isLoading ? (
            <LoadingSkeleton rows={5} />
          ) : portfolio.isError ? (
            <ErrorBanner />
          ) : portfolio.data ? (
            <AllocationPieChart
              holdings={portfolio.data.holdings}
              totalValue={portfolio.data.totalValue}
            />
          ) : null}
        </Panel>
        <div className="lg:col-span-2">
          <Panel title="Price Chart">
            <CandlestickChart />
          </Panel>
        </div>
      </div>

      {/* Row 3: Signals + Watchlist */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel title="AI Signals">
          {signals.isLoading ? (
            <LoadingSkeleton rows={5} />
          ) : signals.isError ? (
            <ErrorBanner />
          ) : (
            <div className="space-y-3 max-h-72 overflow-y-auto">
              {signals.data?.slice(0, 5).map((signal) => (
                <div key={signal.id} className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono font-semibold text-sm text-text-primary">
                        {signal.asset}
                      </span>
                      <Badge variant={signal.direction.toLowerCase() as 'buy' | 'sell' | 'hold'}>
                        {signal.direction}
                      </Badge>
                    </div>
                    <p className="text-xs text-text-secondary truncate">{signal.reason}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-xs font-mono tabular-nums text-text-primary">
                      {signal.confidence}%
                    </div>
                    <div className="text-xs text-text-muted">{relativeTime(signal.timestamp)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Watchlist">
          {watchlist.isLoading ? (
            <LoadingSkeleton rows={6} />
          ) : watchlist.isError ? (
            <ErrorBanner />
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {watchlist.data?.map((item) => (
                <div
                  key={item.symbol}
                  className="flex items-center justify-between gap-2 py-1 border-b border-bg-border last:border-0 hover:bg-bg-elevated px-1 rounded"
                >
                  <div className="min-w-0">
                    <span className="font-mono font-semibold text-sm text-text-primary">
                      {item.symbol}
                    </span>
                    <p className="text-xs text-text-muted truncate">{item.asset}</p>
                  </div>
                  <div className="w-16 flex-shrink-0">
                    <Sparkline data={item.sparkline} height={32} />
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="font-mono tabular-nums text-sm text-text-primary">
                      {formatUSD(item.currentPrice)}
                    </p>
                    <p
                      className={`font-mono tabular-nums text-xs ${
                        item.changePct24h >= 0 ? 'text-positive' : 'text-negative'
                      }`}
                    >
                      {formatPct(item.changePct24h)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      {/* Row 4: Alerts + Transactions strip */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Panel title="Alerts">
          {alerts.isLoading ? (
            <LoadingSkeleton rows={4} />
          ) : alerts.isError ? (
            <ErrorBanner />
          ) : (
            <div className="space-y-2 max-h-56 overflow-y-auto">
              {alerts.data?.slice(0, 4).map((alert) => (
                <div
                  key={alert.id}
                  className={`p-2 rounded border ${
                    alert.triggered
                      ? 'border-negative/30 bg-[var(--color-negative-bg)] opacity-70'
                      : 'border-bg-border'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono font-semibold text-sm text-text-primary">
                      {alert.asset}
                    </span>
                    <Badge variant={alert.triggered ? 'triggered' : 'active'}>
                      {alert.triggered ? 'Triggered' : 'Active'}
                    </Badge>
                  </div>
                  <p className="text-xs text-text-secondary mt-0.5">
                    Price {alert.condition} {formatUSD(alert.threshold)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <div className="lg:col-span-2">
          <Panel title="Recent Transactions">
            {transactions.isLoading ? (
              <LoadingSkeleton rows={5} />
            ) : transactions.isError ? (
              <ErrorBanner />
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-text-muted border-b border-bg-border">
                        <th className="text-left pb-2 pr-3 font-medium">Date</th>
                        <th className="text-left pb-2 pr-3 font-medium">Asset</th>
                        <th className="text-left pb-2 pr-3 font-medium">Type</th>
                        <th className="text-right pb-2 pr-3 font-medium">Total</th>
                        <th className="text-left pb-2 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {transactions.data?.slice(0, 5).map((tx, idx) => (
                        <tr
                          key={tx.id}
                          className={`border-b border-bg-border last:border-0 ${
                            idx % 2 === 0 ? '' : 'bg-bg-elevated'
                          }`}
                        >
                          <td className="py-1.5 pr-3 text-text-muted font-mono tabular-nums">
                            {tx.date.slice(0, 10)}
                          </td>
                          <td className="py-1.5 pr-3 font-mono font-semibold text-text-primary">
                            {tx.symbol}
                          </td>
                          <td className="py-1.5 pr-3">
                            <Badge variant={tx.type.toLowerCase() as 'buy' | 'sell'}>
                              {tx.type}
                            </Badge>
                          </td>
                          <td className="py-1.5 pr-3 text-right font-mono tabular-nums text-text-primary">
                            {formatUSD(tx.total)}
                          </td>
                          <td className="py-1.5">
                            <Badge
                              variant={tx.status as 'completed' | 'pending' | 'failed'}
                            >
                              {tx.status}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-3 pt-2 border-t border-bg-border">
                  <Link
                    to="/transactions"
                    className="text-xs text-accent hover:text-accent-hover transition-colors"
                  >
                    View all transactions →
                  </Link>
                </div>
              </>
            )}
          </Panel>
        </div>
      </div>
    </div>
  )
}
