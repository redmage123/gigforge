import { useEffect, useState } from 'react'
import { api } from '../api/client'
import Card from './Card'

const LABELS = {
  date: 'Date / time', symbol: 'Symbol / contract', side: 'Side or direction', action: 'Open / close (futures)',
  quantity: 'Quantity (filled)', price: 'Price (fill / average)', fee: 'Fee',
}
const CLASSES = [['crypto', 'Crypto'], ['stock', 'Stocks'], ['etf', 'ETFs'], ['commodity', 'Commodity futures'],
  ['fx', 'Forex'], ['auto', 'Mixed: work it out per symbol']]
const field = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.8rem', color: 'var(--muted)', minWidth: 180 }
const cell = { padding: '0.45rem 0.6rem', borderBottom: '1px solid #1a1a2e', fontSize: '0.82rem', whiteSpace: 'nowrap' }

// Import any exchange's trade history by saying which column is which; preview before saving
export default function MappedImport({ file, source, label }) {
  const [info, setInfo] = useState(null)
  const [mapping, setMapping] = useState({})
  const [preview, setPreview] = useState(null)
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setInfo(null); setPreview(null); setResult(null); setError('')
    if (!file) return
    const fd = new FormData()
    fd.append('file', file)
    api.upload('/api/csv-import/inspect', fd)
      .then((r) => { setInfo(r); setMapping({ asset_class: 'crypto', quantity_multiplier: 1, ...r.mapping }) })
      .catch((e) => setError(e.message))
  }, [file])

  const send = async (commit) => {
    setBusy(true); setError('')
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('mapping', JSON.stringify(mapping))
      fd.append('commit', commit ? 'true' : 'false')
      fd.append('source', source)
      const r = await api.upload('/api/csv-import/mapped', fd)
      if (commit) {
        setResult(r); setPreview(null)
        window.dispatchEvent(new CustomEvent('assetadvisor:data-changed'))
      } else setPreview(r)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const set = (k, v) => { setMapping({ ...mapping, [k]: v }); setPreview(null) }
  if (!file) return null
  const missing = (info?.required || []).filter((f) => !mapping[f])

  return (
    <>
      {error && <div className="negative" role="alert" style={{ margin: '1rem 0', padding: '0.75rem', background: '#3a1e1e', borderRadius: 8 }}>{error}</div>}
      {info && !result && (
        <Card title={`Match the columns (${info.rows} rows found)`} style={{ marginTop: '1rem' }}>
          <p className="muted" style={{ fontSize: '0.85rem', marginTop: 0 }}>
            {info.saved ? `Using the column choices from your last import of this ${label} file. ` : 'We guessed which column is which from the headers. '}
            Check each one, then preview. Nothing is saved until you press Import.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
            {info.fields.map((f) => (
              <label key={f} style={field}>
                {LABELS[f]}{info.required.includes(f) ? ' *' : ' (optional)'}
                <select className="input" value={mapping[f] || ''} onChange={(e) => set(f, e.target.value || undefined)}>
                  <option value="">{info.required.includes(f) ? 'Choose a column…' : 'None'}</option>
                  {info.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
              </label>
            ))}
            <label style={field}>
              Market
              <select className="input" value={mapping.asset_class || 'crypto'} onChange={(e) => set('asset_class', e.target.value)}>
                {CLASSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
            <label style={field}>
              Quantity multiplier
              <input className="input" type="number" min="0" step="any" value={mapping.quantity_multiplier ?? 1}
                onChange={(e) => set('quantity_multiplier', e.target.value)} />
              <span style={{ fontSize: '0.72rem' }}>If quantities are lots or contracts, the size of one (e.g. 0.001 BTC).</span>
            </label>
            <label style={field}>
              Date order
              <select className="input" value={mapping.day_first === undefined ? 'auto' : String(mapping.day_first)}
                onChange={(e) => set('day_first', e.target.value === 'auto' ? undefined : e.target.value === 'true')}>
                <option value="auto">Detect</option>
                <option value="true">Day first (16/11/2026)</option>
                <option value="false">Month first (11/16/2026)</option>
              </select>
            </label>
          </div>
          <div style={{ marginTop: '1rem', overflowX: 'auto' }}>
            <div className="muted" style={{ fontSize: '0.8rem', marginBottom: 4 }}>First rows of your file</div>
            <table style={{ borderCollapse: 'collapse' }}>
              <thead><tr>{info.headers.map((h) => <th key={h} style={{ ...cell, textAlign: 'left', color: '#888' }}>{h}</th>)}</tr></thead>
              <tbody>{info.sample.slice(0, 5).map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} style={cell}>{c}</td>)}</tr>)}</tbody>
            </table>
          </div>
          <div style={{ marginTop: '1rem', display: 'flex', gap: 8, alignItems: 'center' }}>
            <button className="btn" disabled={busy || missing.length > 0} onClick={() => send(false)}>{busy && !preview ? 'Reading…' : 'Preview trades'}</button>
            {missing.length > 0 && <span className="muted" style={{ fontSize: '0.8rem' }}>Choose columns for: {missing.map((f) => LABELS[f]).join(', ')}</span>}
          </div>
        </Card>
      )}

      {preview && (
        <Card title={`Preview: ${preview.count} of ${preview.rows} rows read as trades`} style={{ marginTop: '1rem' }}>
          <p className="muted" style={{ fontSize: '0.85rem', marginTop: 0 }}>
            Check the sides, quantities and prices. If notional values look 1,000× off, set the quantity multiplier.
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead><tr>{['Date', 'Instrument', 'Side', 'Quantity', 'Price', 'Notional', 'Fee'].map((h) => <th key={h} style={{ ...cell, textAlign: 'left', color: '#888' }}>{h}</th>)}</tr></thead>
              <tbody>
                {preview.preview.map((t, i) => (
                  <tr key={i}>
                    <td style={cell}>{t.date}</td><td style={cell}>{t.instrument_id}</td>
                    <td style={cell} className={t.side === 'buy' ? 'positive' : 'negative'}>{t.side.toUpperCase()}</td>
                    <td style={cell}>{t.quantity.toLocaleString(undefined, { maximumFractionDigits: 8 })}</td>
                    <td style={cell}>{t.price.toLocaleString(undefined, { maximumFractionDigits: 8 })}</td>
                    <td style={cell}>{t.notional.toLocaleString()}</td><td style={cell}>{t.fee}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.count > preview.preview.length && <div className="muted" style={{ fontSize: '0.8rem', marginTop: 6 }}>…and {preview.count - preview.preview.length} more.</div>}
          {preview.instruments.length > 0 && (
            <div className="muted" style={{ fontSize: '0.8rem', marginTop: 8 }}>
              Net position change: {preview.instruments.map((b) => `${b.instrument_id} ${b.net_quantity > 0 ? '+' : ''}${+b.net_quantity.toFixed(8)}`).join(' · ')}
            </div>
          )}
          {preview.warning_count > 0 && (
            <details style={{ marginTop: 8 }}>
              <summary className="negative" style={{ cursor: 'pointer', fontSize: '0.85rem' }}>{preview.warning_count} {preview.warning_count === 1 ? 'row' : 'rows'} will be skipped</summary>
              <div style={{ maxHeight: 180, overflowY: 'auto', fontSize: '0.8rem' }}>{preview.warnings.map((w, i) => <div key={i}>{w}</div>)}</div>
            </details>
          )}
          <div style={{ marginTop: '1rem' }}>
            <button className="btn" disabled={busy || preview.count === 0} onClick={() => send(true)}>{busy ? 'Importing…' : `Import ${preview.count} trades`}</button>
          </div>
        </Card>
      )}

      {result && (
        <Card title="Import complete" style={{ marginTop: '1rem' }}>
          <p style={{ margin: 0 }}>
            <strong className="positive">{result.imported}</strong> trades imported
            {result.duplicates_skipped ? `, ${result.duplicates_skipped} already in your journal` : ''}
            {result.errors?.length ? `, ${result.errors.length} ${result.errors.length === 1 ? 'row' : 'rows'} skipped` : ''}. Your column choices are saved for next time.
          </p>
        </Card>
      )}
    </>
  )
}
