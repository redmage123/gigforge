/**
 * LiveBadge: the "LIVE" indicator in page headers.
 *
 * Why: tells viewers the page is updating on its own, and that it has stopped
 * (reads "PAUSED", no pulse) while the presenter has the demo paused.
 * How: reads the shared demo-pause flag; the pulse is CSS on `.live-dot`.
 */
import { useDemoPaused } from '../hooks/useDemoPause'

/**
 * The pulsing "LIVE" page badge; reads "PAUSED" (static) while the demo is paused.
 * @param {{label?: string}} props text shown while live (default 'LIVE')
 */
export default function LiveBadge({ label = 'LIVE' }) {
  const paused = useDemoPaused()
  return (
    <div className={`live-badge ${paused ? 'is-paused' : ''}`}>
      <div className="live-dot" aria-hidden="true" /> {paused ? 'PAUSED' : label}
    </div>
  )
}
