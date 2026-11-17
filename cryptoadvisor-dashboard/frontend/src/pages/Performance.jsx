import { lazy, Suspense, useEffect, useState } from 'react'
import { api, getPortfolioScope } from '../api/client'
import { useFetch } from '../hooks/useFetch'
import { usePortfolios } from '../hooks/usePortfolios'
import Card from '../components/Card'
import StatCard from '../components/StatCard'
import LoadingSpinner from '../components/LoadingSpinner'
import { pct, tone, usd } from '../components/assetClass'

const Plot = lazy(() => import('react-plotly.js'))
const PERIODS = [['1m', '1M'], ['3m', '3M'], ['ytd', 'YTD'], ['1y', '1Y'], ['all', 'All']]
const CASH_TYPES = [['deposit', 'Deposit'], ['withdrawal', 'Withdrawal'], ['dividend', 'Dividend'], ['interest', 'Interest'], ['fee', 'Fee / charge']]
const today = () => new Date().toISOString().slice(0, 10)

// PDFs need the portfolio header, so fetch as a blob instead of a plain link
async function downloadPdf(path, filename) {
  const res = await fetch(path, { credentials: 'include', headers: { 'X-Portfolio': getPortfolioScope() } })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.detail || body.error || `Download failed (${res.status})`)
  }
  const url = URL.createObjectURL(await res.blob())
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

function CashLedger({ canWrite, combined, own: books, onChange }) {
  const own = books
  const { data, refetch } = useFetch('/api/portfolios/cash')
  const [f, setF] = useState({ type: 'deposit', amount: '', date: today(), notes: '' })
  const [book, setBook] = useState('')
  const [error, setError] = useState('')
  const rows = Array.isArray(data) ? [...data].reverse() : []
  const defaultBook = (own.find((p) => p.default) || own[0])?.id
  const add = async (e) => {
    e.preventDefault(); setError('')
    try {
      await api.post('/api/portfolios/cash', { ...f, amount: parseFloat(f.amount), ...(combined ? { portfolio_id: book || defaultBook } : {}) })
      setF({ ...f, amount: '', notes: '' })
      refetch(); onChange()
    } catch (err) { setError(err.message) }
  }
  const remove = async (id) => {
    try { await api.del(`/api/portfolios/cash/${id}`); refetch(); onChange() } catch (err) { setError(err.message) }
  }
  return (
    <Card title="Cash movements">
      <p className="muted" style={{ fontSize: '0.85rem', marginTop: 0 }}>
        Record money added and taken out so returns measure the investments, not the deposits. Dividends, interest and fees
        count toward performance.
      </p>
      {canWrite && (
        <form onSubmit={add} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end', marginBottom: '0.75rem' }}>
          {combined && (
            <label className="form-group" style={{ marginBottom: 0 }}>Portfolio
              <select className="input" style={{ minWidth: 0 }} value={book || defaultBook || ''} onChange={(e) => setBook(e.target.value)}>
                {own.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
          )}
          <label className="form-group" style={{ marginBottom: 0 }}>Type
            <select className="input" style={{ minWidth: 0 }} value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
              {CASH_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <label className="form-group" style={{ marginBottom: 0 }}>Amount ($)
            <input className="input" style={{ minWidth: 0, width: 140 }} type="number" min="0" step="0.01" required value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
          </label>
          <label className="form-group" style={{ marginBottom: 0 }}>Date
            <input className="input" style={{ minWidth: 0 }} type="date" required value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
          </label>
          <label className="form-group" style={{ marginBottom: 0, flex: '1 1 160px' }}>Note
            <input className="input" style={{ minWidth: 0 }} maxLength={300} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
          </label>
          <button className="btn">Add</button>
        </form>
      )}
      {error && <p className="negative" role="alert">{error}</p>}
      {rows.length === 0 ? <p className="muted" style={{ marginBottom: 0 }}>No cash movements recorded.</p> : (
        <div style={{ overflowX: 'auto', maxHeight: 320, overflowY: 'auto' }}>
          <table className="data-table">
            <thead><tr>{['Date', 'Type', 'Amount', 'Note', ''].map((h) => <th key={h}>{h}</th>)}</tr></thead>
            <tbody>
              {rows.map((r) => {
                const out = r.type === 'withdrawal' || r.type === 'fee'
                return (
                  <tr key={r.id}>
                    <td className="muted">{r.date}</td>
                    <td>{CASH_TYPES.find(([v]) => v === r.type)?.[1]}</td>
                    <td className={out ? 'negative' : 'positive'}>{usd(out ? -r.amount : r.amount, { sign: true })}</td>
                    <td className="muted">{r.notes}</td>
                    <td>{canWrite && <button type="button" className="btn btn-sm btn-ghost" onClick={() => remove(r.id)} aria-label={`Delete ${r.type} of ${r.amount}`}>Delete</button>}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}

function Statements({ selected }) {
  const { data } = useFetch('/api/portfolios/statements')
  const first = new Date(); first.setDate(1)
  const [range, setRange] = useState({ start: new Date(first.getFullYear(), first.getMonth() - 2, 1).toISOString().slice(0, 10), end: today() })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const name = (selected?.name || 'portfolio').replace(/[^A-Za-z0-9]+/g, '-')
  const get = async (path, file) => {
    setBusy(true); setError('')
    try { await downloadPdf(path, file) } catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  return (
    <Card title="Statements">
      <p className="muted" style={{ fontSize: '0.85rem', marginTop: 0 }}>
        PDF with returns against the benchmark, holdings, allocation and every transaction. A statement for each month is
        created automatically after the month ends{selected?.role === 'owner' ? '; people you share this portfolio with can download them too' : ''}.
      </p>
      <form onSubmit={(e) => { e.preventDefault(); get(`/api/portfolios/statement.pdf?start=${range.start}&end=${range.end}`, `${name}-${range.start}-to-${range.end}.pdf`) }}
        style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <label className="form-group" style={{ marginBottom: 0 }}>From
          <input className="input" style={{ minWidth: 0 }} type="date" required value={range.start} max={range.end} onChange={(e) => setRange({ ...range, start: e.target.value })} />
        </label>
        <label className="form-group" style={{ marginBottom: 0 }}>To
          <input className="input" style={{ minWidth: 0 }} type="date" required value={range.end} max={today()} onChange={(e) => setRange({ ...range, end: e.target.value })} />
        </label>
        <button className="btn" disabled={busy}>{busy ? 'Preparing…' : 'Download statement'}</button>
      </form>
      {error && <p className="negative" role="alert">{error}</p>}
      {(data?.statements || []).length > 0 && (
        <div style={{ marginTop: '0.75rem', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <span className="muted" style={{ fontSize: '0.85rem', alignSelf: 'center' }}>Monthly:</span>
          {data.statements.map((s) => (
            <button key={s.month} type="button" className="btn btn-sm btn-ghost" disabled={busy}
              onClick={() => get(`/api/portfolios/statements/${s.month}.pdf`, `${name}-${s.month}.pdf`)}>{s.month}</button>
          ))}
        </div>
      )}
    </Card>
  )
}

export default function Performance() {
  const { label, combined, own, bookOptions, canWrite, selected, current } = usePortfolios()
  const [period, setPeriod] = useState('all')
  const [p, setP] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let live = true
    setLoading(true); setError('')
    api.get(`/api/portfolios/performance?period=${period}`)
      .then((r) => { if (live) setP(r) })
      .catch((e) => { if (live) setError(e.message) })
      .finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [period, current, tick])

  const s = p?.series || []
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <h1 style={{ margin: 0 }}>Performance <span className="muted" style={{ fontSize: '1rem', fontWeight: 400 }}>· {label}</span></h1>
        <div role="group" aria-label="Period" style={{ display: 'flex', gap: 4 }}>
          {PERIODS.map(([v, l]) => (
            <button key={v} type="button" className={`btn btn-sm ${period === v ? '' : 'btn-ghost'}`} aria-pressed={period === v} onClick={() => setPeriod(v)}>{l}</button>
          ))}
        </div>
      </div>
      {error && <p className="negative" role="alert">{error}</p>}
      {loading && !p ? <LoadingSpinner /> : p?.empty ? (
        <Card><p className="muted" style={{ margin: 0 }}>No trades or cash movements yet. Performance starts with the first one.</p></Card>
      ) : p && (
        <>
          <div className="grid grid-4" style={{ marginBottom: '1rem' }}>
            <StatCard value={usd(p.nav)} label={`Value · cash ${usd(p.cash, { compact: true })}`} />
            <StatCard value={pct(p.twr_pct)} label={`Time-weighted return${p.twr_annualized_pct != null ? ` · ${pct(p.twr_annualized_pct)}/yr` : ''}`} />
            <StatCard value={pct(p.benchmark_pct)} label={`Benchmark: ${p.benchmark_name}`} />
            <StatCard value={pct(p.excess_pct)} label="Versus benchmark" />
          </div>
          <div className="grid grid-4" style={{ marginBottom: '1rem' }}>
            <StatCard value={usd(p.start_nav)} label={`Value on ${p.start}`} />
            <StatCard value={usd(p.net_deposits, { sign: true })} label="Deposits less withdrawals" />
            <StatCard value={usd(p.nav - p.start_nav - p.net_deposits, { sign: true })} label="Investment gain" />
            <StatCard value={pct(p.mwr_annual_pct)} label="Money-weighted (annual)" />
          </div>

          <Card title={`Growth of $100 since ${p.start}`}>
            <Suspense fallback={<LoadingSpinner />}>
              <Plot
                data={[
                  { x: s.map((r) => r.date), y: s.map((r) => r.index), type: 'scatter', mode: 'lines', name: label, line: { color: '#00d4aa', width: 2 } },
                  { x: s.map((r) => r.date), y: s.map((r) => r.benchmark), type: 'scatter', mode: 'lines', name: p.benchmark_name, line: { color: '#7b61ff', width: 1.5, dash: 'dot' } },
                ]}
                layout={{ paper_bgcolor: '#111827', plot_bgcolor: '#111827', font: { color: '#e2e8f0' }, margin: { l: 50, r: 10, t: 10, b: 40 },
                  height: 320, legend: { orientation: 'h', y: -0.15 }, xaxis: { gridcolor: '#1f2937' }, yaxis: { gridcolor: '#1f2937' } }}
                config={{ displayModeBar: false, responsive: true }}
                style={{ width: '100%' }}
                useResizeHandler
              />
            </Suspense>
            {(p.notes || []).map((n) => <p key={n} className="muted" style={{ fontSize: '0.8rem', margin: '0.25rem 0 0' }}>{n}</p>)}
          </Card>

          {p.monthly?.length > 0 && (
            <Card title="Monthly returns" style={{ marginTop: '1rem' }}>
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table">
                  <thead><tr>{['Month', label, p.benchmark_name, 'Difference'].map((h) => <th key={h}>{h}</th>)}</tr></thead>
                  <tbody>
                    {p.monthly.map((m) => (
                      <tr key={m.month}>
                        <td>{m.month}</td>
                        <td className={tone(m.return_pct)}>{pct(m.return_pct)}</td>
                        <td className={tone(m.benchmark_pct)}>{pct(m.benchmark_pct)}</td>
                        <td className={tone(m.benchmark_pct == null ? null : m.return_pct - m.benchmark_pct)}>
                          {m.benchmark_pct == null ? '--' : pct(m.return_pct - m.benchmark_pct)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}
      <div style={{ marginTop: '1rem', display: 'grid', gap: '1rem' }}>
        <CashLedger canWrite={canWrite} combined={combined} own={bookOptions} onChange={() => setTick((t) => t + 1)} />
        {combined ? (
          <Card title="Statements"><p className="muted" style={{ margin: 0 }}>Pick one portfolio in the switcher to download its statements.</p></Card>
        ) : <Statements selected={selected || own[0]} />}
      </div>
    </div>
  )
}
