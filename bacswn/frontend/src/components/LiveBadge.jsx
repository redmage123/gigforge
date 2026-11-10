import { useDemoPaused } from '../hooks/useDemoPause'

/** The pulsing "LIVE" page badge; reads "PAUSED" (static) while the demo is paused. */
export default function LiveBadge({ label = 'LIVE' }) {
  const paused = useDemoPaused()
  return (
    <div className={`live-badge ${paused ? 'is-paused' : ''}`}>
      <div className="live-dot" aria-hidden="true" /> {paused ? 'PAUSED' : label}
    </div>
  )
}
