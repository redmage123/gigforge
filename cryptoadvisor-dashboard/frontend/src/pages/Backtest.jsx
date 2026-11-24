import { lazy, Suspense, useState } from 'react';
import { api } from '../api/client';
import Card from '../components/Card';
import StatCard from '../components/StatCard';
import LoadingSpinner from '../components/LoadingSpinner';
import InstrumentPicker from '../components/InstrumentPicker';
import { pct, tone, usd } from '../components/assetClass';

const Plot = lazy(() => import('react-plotly.js'));

// Backtests are in USD: offer instruments a person can buy and hold
const CLASSES = 'crypto,stock,etf,commodity';
const QUICK = [
  { id: 'crypto:BTC', symbol: 'BTC', name: 'Bitcoin', asset_class: 'crypto' },
  { id: 'crypto:ETH', symbol: 'ETH', name: 'Ethereum', asset_class: 'crypto' },
  { id: 'crypto:SOL', symbol: 'SOL', name: 'Solana', asset_class: 'crypto' },
  { id: 'stock:AAPL', symbol: 'AAPL', name: 'Apple Inc.', asset_class: 'stock' },
  { id: 'etf:SPY', symbol: 'SPY', name: 'SPDR S&P 500 ETF', asset_class: 'etf' },
  { id: 'etf:GLD', symbol: 'GLD', name: 'SPDR Gold Shares', asset_class: 'etf' },
];
const LINE_COLORS = ['#00d4aa', '#7b61ff', '#f59e0b', '#38bdf8', '#f472b6', '#a3e635', '#fb7185', '#facc15', '#60a5fa', '#c084fc'];

function ValueChart({ lines }) {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <Plot
        data={lines.map((l, i) => ({
          x: l.series.map((p) => p.date), y: l.series.map((p) => p.value), type: 'scatter', mode: 'lines', name: l.name,
          line: { color: LINE_COLORS[i % LINE_COLORS.length], width: l.dash ? 1.5 : 2, dash: l.dash ? 'dot' : 'solid' },
        }))}
        layout={{ paper_bgcolor: '#111827', plot_bgcolor: '#111827', font: { color: '#e2e8f0' }, margin: { l: 60, r: 10, t: 10, b: 40 },
          height: 320, legend: { orientation: 'h', y: -0.15 }, xaxis: { gridcolor: '#1f2937' }, yaxis: { gridcolor: '#1f2937', tickprefix: '$' } }}
        config={{ displayModeBar: false, responsive: true }}
        style={{ width: '100%' }}
        useResizeHandler
      />
    </Suspense>
  );
}

function StatsTable({ rows, best }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="data-table">
        <thead>
          <tr>{['Instrument', 'Final value', 'Total return', 'Annualized', 'Max drawdown', 'Volatility'].map((h) => <th key={h}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.instrument_id || r.symbol}>
              <td><strong>{r.symbol}</strong> {r.instrument_id && r.instrument_id === best ? <span className="badge badge-green">Best</span> : null}</td>
              <td>{usd(r.final_value)}</td>
              <td className={tone(r.total_return_pct)}>{pct(r.total_return_pct)}</td>
              <td className={tone(r.cagr_pct)}>{pct(r.cagr_pct)}</td>
              <td className={r.max_drawdown_pct ? 'negative' : ''}>{r.max_drawdown_pct ? `-${Number(r.max_drawdown_pct).toFixed(2)}%` : '0.00%'}</td>
              <td>{r.volatility_pct == null ? '--' : `${Number(r.volatility_pct).toFixed(2)}%`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Notes({ notes }) {
  return (notes || []).map((n) => <p key={n} className="muted" style={{ fontSize: '0.8rem', margin: '0.5rem 0 0' }}>{n}</p>);
}

export default function Backtest() {
  const [original, setOriginal] = useState(QUICK[0]);
  const [alternative, setAlternative] = useState(QUICK[1]);
  const [startDate, setStartDate] = useState('2024-01-01');
  const [amount, setAmount] = useState('10000');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Multi-compare
  const [compareList, setCompareList] = useState([QUICK[0], QUICK[1], QUICK[3]]);
  const [compareResult, setCompareResult] = useState(null);
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareError, setCompareError] = useState('');

  const amountNum = Number(amount);
  const amountOk = Number.isFinite(amountNum) && amountNum > 0;

  const runBacktest = async () => {
    if (!original || !alternative) { setError('Pick both instruments'); return; }
    if (!amountOk) { setError('Enter an amount greater than zero'); return; }
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const res = await api.post('/api/backtest/portfolio', {
        original_coin: original.id,
        alternative_coin: alternative.id,
        start_date: startDate,
        amount_usd: amountNum,
      });
      setResult(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const addCompare = (inst) => {
    if (!inst) return;
    setCompareList((prev) => (prev.some((p) => p.id === inst.id) || prev.length >= 10 ? prev : [...prev, inst]));
  };
  const removeCompare = (id) => setCompareList((prev) => prev.filter((p) => p.id !== id));

  const runCompare = async () => {
    if (compareList.length < 2) { setCompareError('Select at least 2 instruments to compare'); return; }
    if (!amountOk) { setCompareError('Enter an amount greater than zero'); return; }
    setCompareLoading(true);
    setCompareError('');
    setCompareResult(null);
    try {
      const res = await api.post('/api/backtest/compare', {
        coins: compareList.map((c) => c.id),
        start_date: startDate,
        amount_usd: amountNum,
      });
      setCompareResult(res);
    } catch (err) {
      setCompareError(err.message);
    } finally {
      setCompareLoading(false);
    }
  };

  const o = result?.original;
  const a = result?.alternative;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div>
      <h2 style={{ marginBottom: '1.5rem' }}>Portfolio Backtester</h2>

      <Card title="What If...">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem', alignItems: 'end' }}>
          <div className="form-group">
            <label htmlFor="bt-original">What I bought</label>
            <InstrumentPicker id="bt-original" value={original} onChange={setOriginal} classes={CLASSES} />
          </div>
          <div className="form-group">
            <label htmlFor="bt-alternative">What I could have bought</label>
            <InstrumentPicker id="bt-alternative" value={alternative} onChange={setAlternative} classes={CLASSES} />
          </div>
          <div className="form-group">
            <label htmlFor="bt-start">Start date</label>
            <input id="bt-start" className="form-input" type="date" max={today} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div className="form-group">
            <label htmlFor="bt-amount">Amount (USD)</label>
            <input id="bt-amount" className="form-input" type="number" min="1" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
        </div>
        <button className="btn" onClick={runBacktest} disabled={loading} style={{ marginTop: '0.75rem' }}>
          {loading ? 'Running...' : 'Run Backtest'}
        </button>
        {error && <div className="login-error" style={{ marginTop: '0.75rem' }}>{error}</div>}
      </Card>

      {loading && <LoadingSpinner />}

      {o && a && (
        <div style={{ marginTop: '1.5rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
            <StatCard value={usd(o.final_value)} label={`${o.symbol} value now`} change={o.total_return_pct} />
            <StatCard value={usd(a.final_value)} label={`${a.symbol} value now`} change={a.total_return_pct} />
            <StatCard value={usd(result.difference_usd, { sign: true })} label={`${a.symbol} vs ${o.symbol}`} />
          </div>
          <Card title={`Value of ${usd(result.amount_usd)} since ${result.effective_start}`}>
            <ValueChart lines={[{ name: o.symbol, series: o.series }, { name: a.symbol, series: a.series }]} />
            <StatsTable rows={[o, a]} best={result.winner} />
            <Notes notes={result.notes} />
          </Card>
        </div>
      )}

      <Card title="Multi-Instrument Compare" style={{ marginTop: '1.5rem' }}>
        <p className="muted" style={{ marginTop: 0 }}>Uses the start date and amount above. Pick 2 to 10 instruments.</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
          {compareList.map((c) => (
            <span key={c.id} className="badge badge-blue" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0.35rem 0.6rem' }}>
              {c.symbol}
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => removeCompare(c.id)} aria-label={`Remove ${c.symbol}`} style={{ padding: '0 0.3rem' }}>x</button>
            </span>
          ))}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center', marginBottom: '0.75rem' }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <InstrumentPicker id="bt-compare-add" value={null} onChange={addCompare} classes={CLASSES} placeholder="Add an instrument: AAPL, bitcoin, gold..." />
          </div>
          {QUICK.filter((q) => !compareList.some((c) => c.id === q.id)).map((q) => (
            <button key={q.id} type="button" className="btn btn-sm btn-secondary" onClick={() => addCompare(q)}>+ {q.symbol}</button>
          ))}
        </div>
        <button className="btn" onClick={runCompare} disabled={compareLoading}>
          {compareLoading ? 'Comparing...' : 'Compare'}
        </button>
        {compareError && <div className="login-error" style={{ marginTop: '0.75rem' }}>{compareError}</div>}

        {compareResult && (
          <div style={{ marginTop: '1rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
              {compareResult.results.map((r) => (
                <StatCard key={r.instrument_id} value={usd(r.final_value)} label={r.symbol} change={r.total_return_pct} />
              ))}
              <StatCard value={usd(compareResult.portfolio.final_value)} label="Equal-weight basket" change={compareResult.portfolio.total_return_pct} />
            </div>
            <ValueChart lines={[
              ...compareResult.results.map((r) => ({ name: r.symbol, series: r.series })),
              { name: 'Equal weight', series: compareResult.portfolio.series, dash: true },
            ]} />
            <StatsTable rows={[...compareResult.results, compareResult.portfolio]} best={compareResult.best_performer} />
            <Notes notes={compareResult.notes} />
          </div>
        )}
      </Card>
    </div>
  );
}
