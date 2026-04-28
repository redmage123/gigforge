/**
 * Toggle bar + overlay state for the candlestick chart (STORY-902, 905).
 *
 * Encapsulates SMA 20/50/200 toggles, the Bollinger Bands toggle, and the
 * derived golden-cross / death-cross / Bollinger-squeeze banners.
 */
import { useMemo, useState } from 'react'
import { bollinger, crossAbove, crossBelow, sma } from '../../utils/indicators'
import type { BollingerResult, Series } from '../../utils/indicators'
import type { OHLCVCandle } from '../../types/index'

export interface OverlayToggleState {
  sma20: boolean
  sma50: boolean
  sma200: boolean
  bollinger: boolean
}

const DEFAULT_TOGGLES: OverlayToggleState = {
  sma20: true,
  sma50: true,
  sma200: false,
  bollinger: false,
}

const BOLLINGER_SQUEEZE_THRESHOLD = 0.05

export interface IndicatorBanner {
  kind: 'golden' | 'death' | 'squeeze'
  index: number
  message: string
}

export interface OverlayData {
  sma20: Series | null
  sma50: Series | null
  sma200: Series | null
  bollinger: BollingerResult | null
  banners: IndicatorBanner[]
}

export function useIndicatorOverlays(candles: OHLCVCandle[]) {
  const [toggles, setToggles] = useState<OverlayToggleState>(DEFAULT_TOGGLES)

  const overlays = useMemo<OverlayData>(() => {
    const closes = candles.map((c) => c.close)
    const sma20 = toggles.sma20 ? sma(closes, 20) : null
    const sma50 = toggles.sma50 ? sma(closes, 50) : null
    const sma200 = toggles.sma200 ? sma(closes, 200) : null
    const boll = toggles.bollinger ? bollinger(closes, 20, 2) : null

    // Compute golden / death cross from sma50 vs sma200 over the visible range.
    const sma50Full = sma(closes, 50)
    const sma200Full = sma(closes, 200)
    const goldenIdx = crossAbove(sma50Full, sma200Full)
    const deathIdx = crossBelow(sma50Full, sma200Full)

    const banners: IndicatorBanner[] = []
    if (goldenIdx >= 0 && (deathIdx < 0 || goldenIdx > deathIdx)) {
      banners.push({
        kind: 'golden',
        index: goldenIdx,
        message: `Golden cross at ${new Date(candles[goldenIdx].timestamp).toLocaleDateString()} — SMA50 crossed above SMA200 (bullish trend signal).`,
      })
    } else if (deathIdx >= 0) {
      banners.push({
        kind: 'death',
        index: deathIdx,
        message: `Death cross at ${new Date(candles[deathIdx].timestamp).toLocaleDateString()} — SMA50 crossed below SMA200 (bearish trend signal).`,
      })
    }

    if (boll && candles.length > 0) {
      const lastBw = boll.bandwidth[candles.length - 1]
      if (lastBw !== null && lastBw < BOLLINGER_SQUEEZE_THRESHOLD) {
        banners.push({
          kind: 'squeeze',
          index: candles.length - 1,
          message: `Bollinger squeeze — bandwidth ${(lastBw * 100).toFixed(2)}% (volatility compression often precedes a breakout).`,
        })
      }
    }

    return { sma20, sma50, sma200, bollinger: boll, banners }
  }, [candles, toggles])

  return { toggles, setToggles, overlays }
}

interface OverlayToggleBarProps {
  toggles: OverlayToggleState
  onChange: (next: OverlayToggleState) => void
}

export function OverlayToggleBar({ toggles, onChange }: OverlayToggleBarProps) {
  const update = (key: keyof OverlayToggleState) =>
    onChange({ ...toggles, [key]: !toggles[key] })

  const items: Array<{ key: keyof OverlayToggleState; label: string }> = [
    { key: 'sma20', label: 'SMA 20' },
    { key: 'sma50', label: 'SMA 50' },
    { key: 'sma200', label: 'SMA 200' },
    { key: 'bollinger', label: 'Bollinger' },
  ]

  return (
    <div
      role="group"
      aria-label="Chart overlays"
      className="flex flex-wrap gap-2 text-xs"
    >
      {items.map(({ key, label }) => (
        <label
          key={key}
          className={`inline-flex items-center gap-1.5 px-2 py-1 rounded cursor-pointer transition-colors ${
            toggles[key]
              ? 'bg-accent/20 text-accent'
              : 'bg-bg-elevated text-text-secondary hover:bg-bg-border'
          }`}
        >
          <input
            type="checkbox"
            checked={toggles[key]}
            onChange={() => update(key)}
            className="accent-accent"
          />
          <span>{label}</span>
        </label>
      ))}
    </div>
  )
}

interface IndicatorBannersProps {
  banners: IndicatorBanner[]
}

export function IndicatorBanners({ banners }: IndicatorBannersProps) {
  if (banners.length === 0) return null
  const styles: Record<IndicatorBanner['kind'], string> = {
    golden: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/30',
    death: 'bg-red-500/10 text-red-500 border-red-500/30',
    squeeze: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
  }
  return (
    <div className="space-y-1">
      {banners.map((b, i) => (
        <div
          key={i}
          role="status"
          className={`text-xs px-3 py-1.5 rounded border ${styles[b.kind]}`}
        >
          {b.message}
        </div>
      ))}
    </div>
  )
}
