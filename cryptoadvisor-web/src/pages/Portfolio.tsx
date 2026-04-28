import { usePortfolio } from '../hooks/usePortfolio'
import AllocationPieChart from '../components/charts/AllocationPieChart'
import Panel from '../components/ui/Panel'
import CsvDownloadButton from '../components/CsvDownloadButton'
import LoadingSkeleton from '../components/ui/LoadingSkeleton'
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

export default function Portfolio() {
  const { data, isLoading, isError } = usePortfolio()

  if (isLoading) {
    return (
      <div className="space-y-4">
        <LoadingSkeleton rows={8} />
      </div>
    )
  }

  if (isError) {
    return <ErrorBanner />
  }

  if (!data) return null

  const totalPnl = data.holdings.reduce((sum, h) => sum + h.pnl, 0)

  return (
    <div className="space-y-4">
      {/* Holdings table */}
      <Panel title="Holdings" action={<CsvDownloadButton rows={data.holdings} filenamePrefix="holdings" headers={["Asset","Symbol","Amount","AvgBuyPrice","CurrentPrice","Value","AllocationPct","PnL","PnLPct"]} rowMapper={(h) => [h.asset,h.symbol,h.amount,h.avgBuyPrice,h.currentPrice,h.value,h.allocationPct,h.pnl,h.pnlPct]} />}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-text-muted text-xs uppercase tracking-wide border-b border-bg-border bg-bg-elevated">
                <th className="text-left px-3 py-2 font-medium">Asset</th>
                <th className="text-left px-3 py-2 font-medium">Symbol</th>
                <th className="text-right px-3 py-2 font-medium">Amount</th>
                <th className="text-right px-3 py-2 font-medium">Avg Buy</th>
                <th className="text-right px-3 py-2 font-medium">Current Price</th>
                <th className="text-right px-3 py-2 font-medium">Value</th>
                <th className="text-right px-3 py-2 font-medium">P&L ($)</th>
                <th className="text-right px-3 py-2 font-medium">P&L (%)</th>
              </tr>
            </thead>
            <tbody>
              {data.holdings.map((h, idx) => (
                <tr
                  key={h.symbol}
                  className={`border-b border-bg-border last:border-0 hover:bg-bg-elevated transition-colors ${
                    idx % 2 === 0 ? '' : 'bg-bg-elevated/50'
                  }`}
                >
                  <td className="px-3 py-2.5 text-text-primary">{h.asset}</td>
                  <td className="px-3 py-2.5 font-mono font-semibold text-text-primary">
                    {h.symbol}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums text-text-primary">
                    {h.amount.toLocaleString('en-US', { maximumFractionDigits: 6 })}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums text-text-secondary">
                    {formatUSD(h.avgBuyPrice)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums text-text-primary">
                    {formatUSD(h.currentPrice)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums text-text-primary">
                    {formatUSD(h.value)}
                  </td>
                  <td
                    className={`px-3 py-2.5 text-right font-mono tabular-nums ${
                      h.pnl >= 0 ? 'text-positive' : 'text-negative'
                    }`}
                  >
                    {h.pnl >= 0 ? '+' : ''}
                    {formatUSD(h.pnl)}
                  </td>
                  <td
                    className={`px-3 py-2.5 text-right font-mono tabular-nums ${
                      h.pnlPct >= 0 ? 'text-positive' : 'text-negative'
                    }`}
                  >
                    {formatPct(h.pnlPct)}
                  </td>
                </tr>
              ))}
              {/* Summary row */}
              <tr className="bg-bg-elevated font-semibold border-t-2 border-bg-border">
                <td colSpan={5} className="px-3 py-2.5 text-text-secondary text-sm">
                  Total
                </td>
                <td className="px-3 py-2.5 text-right font-mono tabular-nums text-text-primary">
                  {formatUSD(data.totalValue)}
                </td>
                <td
                  className={`px-3 py-2.5 text-right font-mono tabular-nums ${
                    totalPnl >= 0 ? 'text-positive' : 'text-negative'
                  }`}
                >
                  {totalPnl >= 0 ? '+' : ''}
                  {formatUSD(totalPnl)}
                </td>
                <td className="px-3 py-2.5" />
              </tr>
            </tbody>
          </table>
        </div>
      </Panel>

      {/* Allocation pie chart */}
      <Panel title="Portfolio Allocation">
        <AllocationPieChart holdings={data.holdings} totalValue={data.totalValue} />
      </Panel>
    </div>
  )
}
