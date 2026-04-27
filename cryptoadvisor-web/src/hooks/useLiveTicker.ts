import { useEffect, useRef, useState } from 'react'
import { subscribeTickers, type TickerUpdate } from '../api/live/binanceWs'
import { LIVE_PRICES_ENABLED } from '../api/live/index'
import type { Asset } from '../types/index'

export type TickerMap = Partial<Record<Asset, TickerUpdate>>

/**
 * Subscribes to Binance trade streams for the given assets.
 * Returns the most recent update per asset. No-op when live mode is off.
 */
export function useLiveTicker(assets: Asset[]): TickerMap {
  const [updates, setUpdates] = useState<TickerMap>({})
  const assetsKey = assets.join(',')
  const updatesRef = useRef(updates)
  updatesRef.current = updates

  useEffect(() => {
    if (!LIVE_PRICES_ENABLED || assets.length === 0) return undefined

    const unsubscribe = subscribeTickers(assets, (update) => {
      setUpdates((prev) => ({ ...prev, [update.asset]: update }))
    })

    return () => {
      unsubscribe()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetsKey])

  return updates
}
