/**
 * Feed settings page (Sprint 12, STORY-1113).
 *
 * Users add their own market-data feeds at runtime. Config is persisted to
 * localStorage; the OrderBook page picks them up on its next subscription
 * cycle. Built-in feeds (Binance/Bybit/OKX/Coinbase/Deribit) can be toggled
 * on/off but not deleted.
 *
 * For custom feeds the user supplies:
 *   - Label (display name)
 *   - WebSocket URL
 *   - Subscribe message template (with `{symbol}` placeholder)
 *   - Dot-notation paths to bids/asks/sequence-id in the incoming JSON
 *
 * The shape is intentionally minimal — nothing fancy like JSONPath or jq.
 * Most public exchange feeds expose orderbook arrays at predictable nested
 * paths (e.g. `data.b`, `result.bids`) and a Bybit-like topic discriminator.
 */
import { useEffect, useState } from 'react'
import {
  addFeed,
  loadFeedConfigs,
  removeFeed,
  resetToDefaults,
  toggleFeed,
  type CustomFeedConfig,
  type FeedConfig,
} from '../config/userFeeds'
import Panel from '../components/ui/Panel'

const KIND_LABEL: Record<FeedConfig['kind'], string> = {
  binance: 'Binance (built-in)',
  bybit: 'Bybit (built-in)',
  okx: 'OKX (built-in)',
  coinbase: 'Coinbase (built-in)',
  deribit: 'Deribit options (built-in)',
  custom: 'Custom WebSocket',
}

function emptyDraft(): Omit<CustomFeedConfig, 'id'> {
  return {
    kind: 'custom',
    enabled: true,
    label: '',
    url: '',
    subscribeMessage: '',
    paths: { bids: 'data.b', asks: 'data.a', sequenceId: 'data.u', type: 'type' },
  }
}

export default function FeedSettings() {
  const [feeds, setFeeds] = useState<FeedConfig[]>([])
  const [draft, setDraft] = useState(emptyDraft())
  const [error, setError] = useState<string | null>(null)
  const [savedFlash, setSavedFlash] = useState<string | null>(null)

  useEffect(() => setFeeds(loadFeedConfigs()), [])

  function flash(msg: string) {
    setSavedFlash(msg)
    setTimeout(() => setSavedFlash(null), 2000)
  }

  function handleAdd() {
    setError(null)
    if (!draft.label.trim()) return setError('Label is required.')
    if (!draft.url.trim()) return setError('WebSocket URL is required.')
    if (!draft.url.startsWith('wss://') && !draft.url.startsWith('ws://')) {
      return setError('URL must start with ws:// or wss://')
    }
    if (!draft.paths.bids || !draft.paths.asks) {
      return setError('Paths to bids and asks are both required.')
    }
    const id = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const next = addFeed({ id, ...draft })
    setFeeds(next)
    setDraft(emptyDraft())
    flash('Feed added.')
  }

  function handleToggle(id: string, enabled: boolean) {
    setFeeds(toggleFeed(id, enabled))
    flash(enabled ? 'Enabled.' : 'Disabled.')
  }

  function handleRemove(id: string) {
    if (!confirm('Remove this custom feed? Built-ins cannot be deleted, only disabled.')) return
    setFeeds(removeFeed(id))
    flash('Removed.')
  }

  function handleReset() {
    if (!confirm('Reset to default built-in feeds? All custom feeds will be deleted.')) return
    setFeeds(resetToDefaults())
    flash('Reset.')
  }

  return (
    <div className="space-y-4">
      <Panel title="Data Feeds">
        <p className="text-xs text-text-secondary mb-4">
          Built-in exchange feeds are read-only public WebSockets and require no API key.
          You can disable any of them, or add your own custom WebSocket feed below.
          All settings are stored in your browser&rsquo;s localStorage; nothing leaves your machine.
        </p>

        {savedFlash && (
          <div role="status" className="text-xs text-emerald-400 mb-3">
            {savedFlash}
          </div>
        )}

        <table className="w-full text-sm">
          <thead className="text-xs text-text-secondary">
            <tr>
              <th className="text-left py-1">Feed</th>
              <th className="text-left py-1">Kind</th>
              <th className="text-left py-1">URL</th>
              <th className="text-center py-1">Enabled</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {feeds.map((f) => (
              <tr key={f.id} className="border-t border-bg-border">
                <td className="py-1 text-text-primary">
                  {f.kind === 'custom' ? f.label : KIND_LABEL[f.kind]}
                </td>
                <td className="py-1 text-text-secondary">{f.kind}</td>
                <td className="py-1 text-text-muted text-xs font-mono truncate max-w-[300px]">
                  {f.kind === 'custom' ? f.url : '—'}
                </td>
                <td className="py-1 text-center">
                  <input
                    type="checkbox"
                    checked={f.enabled}
                    onChange={(e) => handleToggle(f.id, e.target.checked)}
                    aria-label={`Enable ${f.id}`}
                  />
                </td>
                <td className="py-1 text-right">
                  {f.kind === 'custom' && (
                    <button
                      type="button"
                      onClick={() => handleRemove(f.id)}
                      className="text-xs text-rose-400 hover:underline"
                    >
                      Remove
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <button
          type="button"
          onClick={handleReset}
          className="mt-3 text-xs text-text-muted hover:text-text-primary"
        >
          Reset to defaults
        </button>
      </Panel>

      <Panel title="Add Custom WebSocket Feed">
        <div className="space-y-3 text-sm">
          <div>
            <label className="block text-xs text-text-secondary mb-1">Label</label>
            <input
              type="text"
              value={draft.label}
              onChange={(e) => setDraft({ ...draft, label: e.target.value })}
              placeholder="My exchange"
              className="w-full bg-bg-elevated border border-bg-border rounded px-3 py-1.5 text-text-primary"
            />
          </div>
          <div>
            <label className="block text-xs text-text-secondary mb-1">WebSocket URL</label>
            <input
              type="text"
              value={draft.url}
              onChange={(e) => setDraft({ ...draft, url: e.target.value })}
              placeholder="wss://exchange.example.com/ws"
              className="w-full bg-bg-elevated border border-bg-border rounded px-3 py-1.5 text-text-primary font-mono text-xs"
            />
          </div>
          <div>
            <label className="block text-xs text-text-secondary mb-1">
              Subscribe message (sent on open; <code>{'{symbol}'}</code> is interpolated)
            </label>
            <textarea
              value={draft.subscribeMessage ?? ''}
              onChange={(e) => setDraft({ ...draft, subscribeMessage: e.target.value })}
              placeholder='{"op":"subscribe","args":["orderbook.50.{symbol}"]}'
              rows={2}
              className="w-full bg-bg-elevated border border-bg-border rounded px-3 py-1.5 text-text-primary font-mono text-xs"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <PathInput
              label="Path to bids array"
              value={draft.paths.bids}
              onChange={(v) => setDraft({ ...draft, paths: { ...draft.paths, bids: v } })}
              placeholder="data.b"
            />
            <PathInput
              label="Path to asks array"
              value={draft.paths.asks}
              onChange={(v) => setDraft({ ...draft, paths: { ...draft.paths, asks: v } })}
              placeholder="data.a"
            />
            <PathInput
              label="Path to sequence id (optional)"
              value={draft.paths.sequenceId ?? ''}
              onChange={(v) => setDraft({ ...draft, paths: { ...draft.paths, sequenceId: v } })}
              placeholder="data.u"
            />
            <PathInput
              label="Path to type field (optional)"
              value={draft.paths.type ?? ''}
              onChange={(v) => setDraft({ ...draft, paths: { ...draft.paths, type: v } })}
              placeholder="type"
            />
          </div>
          {error && (
            <p role="alert" className="text-xs text-rose-400">
              {error}
            </p>
          )}
          <button
            type="button"
            onClick={handleAdd}
            className="bg-accent text-white px-4 py-1.5 rounded text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-accent"
          >
            Add Feed
          </button>
        </div>
      </Panel>
    </div>
  )
}

interface PathInputProps {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
}

function PathInput({ label, value, onChange, placeholder }: PathInputProps) {
  return (
    <div>
      <label className="block text-xs text-text-secondary mb-1">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-bg-elevated border border-bg-border rounded px-3 py-1.5 text-text-primary font-mono text-xs"
      />
    </div>
  )
}
