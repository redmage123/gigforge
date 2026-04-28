import { useState } from 'react'
import Panel from '../components/ui/Panel'
import CandlestickChart from '../components/charts/CandlestickChart'
import type { Asset, Timeframe } from '../types/index'

const ASSETS: Asset[] = ['BTC', 'ETH', 'SOL', 'ADA']
const TIMEFRAMES: Timeframe[] = ['1D', '1W', '1M']

export default function Charts() {
  const [asset, setAsset] = useState<Asset>('BTC')
  const [timeframe, setTimeframe] = useState<Timeframe>('1W')

  return (
    <div className="space-y-4">
      <Panel title="Price Chart">
        <div className="flex flex-wrap gap-3 items-center mb-4" data-testid="charts-controls">
          <label className="flex items-center gap-2 text-sm">
            <span className="text-text-muted uppercase text-xs tracking-wide">Asset</span>
            <select
              value={asset}
              onChange={(e) => setAsset(e.target.value as Asset)}
              className="px-3 py-1.5 rounded bg-bg-elevated border border-bg-border text-text-primary text-sm font-mono"
              aria-label="Select asset"
            >
              {ASSETS.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </label>

          <div className="flex gap-1" role="group" aria-label="Timeframe">
            {TIMEFRAMES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTimeframe(t)}
                aria-pressed={timeframe === t}
                className={`px-3 py-1.5 rounded text-sm font-semibold transition-colors ${
                  timeframe === t
                    ? 'bg-accent text-white'
                    : 'bg-bg-elevated text-text-secondary hover:bg-bg-border hover:text-text-primary'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <CandlestickChart key={`${asset}-${timeframe}`} defaultAsset={asset} defaultTimeframe={timeframe} />
      </Panel>
    </div>
  )
}
