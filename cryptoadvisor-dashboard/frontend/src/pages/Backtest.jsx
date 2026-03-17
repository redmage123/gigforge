import { useState } from 'react';
import { api } from '../api/client';
import Card from '../components/Card';
import StatCard from '../components/StatCard';
import LoadingSpinner from '../components/LoadingSpinner';

const inputStyle = {
  padding: '0.6rem 1rem',
  background: '#12121f',
  border: '1px solid #2a2a3d',
  borderRadius: 8,
  color: '#e0e0e0',
  fontSize: '0.95rem',
};

const btnStyle = {
  padding: '0.6rem 1.5rem',
  background: '#646cff',
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  cursor: 'pointer',
  fontWeight: 600,
};

const COINS = ['bitcoin', 'ethereum', 'solana', 'cardano', 'polkadot', 'avalanche-2', 'chainlink', 'polygon'];

export default function Backtest() {
  const [original, setOriginal] = useState('bitcoin');
  const [alternative, setAlternative] = useState('ethereum');
  const [startDate, setStartDate] = useState('2024-01-01');
  const [amount, setAmount] = useState('10000');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Multi-compare
  const [compareCoins, setCompareCoins] = useState({});
  const [compareResult, setCompareResult] = useState(null);
  const [compareLoading, setCompareLoading] = useState(false);

  const runBacktest = async () => {
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const res = await api.post('/api/backtest/portfolio', {
        original_coin: original,
        alternative_coin: alternative,
        start_date: startDate,
        amount: Number(amount),
      });
      setResult(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleCoin = (c) => {
    setCompareCoins((prev) => ({ ...prev, [c]: !prev[c] }));
  };

  const runCompare = async () => {
    const selected = Object.keys(compareCoins).filter((c) => compareCoins[c]);
    if (selected.length < 2) { setError('Select at least 2 coins to compare'); return; }
    setCompareLoading(true);
    setError('');
    setCompareResult(null);
    try {
      const res = await api.post('/api/backtest/portfolio', {
        coins: selected,
        start_date: startDate,
        amount: Number(amount),
      });
      setCompareResult(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setCompareLoading(false);
    }
  };

  const origVal = result?.original_value ?? result?.originalValue ?? 0;
  const altVal = result?.alternative_value ?? result?.alternativeValue ?? 0;
  const diff = altVal - origVal;
  const origReturn = origVal > 0 ? (((origVal - Number(amount)) / Number(amount)) * 100).toFixed(2) : 0;
  const altReturn = altVal > 0 ? (((altVal - Number(amount)) / Number(amount)) * 100).toFixed(2) : 0;

  return (
    <div>
      <h2 style={{ color: '#e0e0e0', marginBottom: '1.5rem' }}>Portfolio Backtester</h2>

      {error && <div style={{ color: '#f87171', marginBottom: '1rem' }}>{error}</div>}

      {/* What If Form */}
      <Card title="What If...">
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label style={{ color: '#888', fontSize: '0.85rem', display: 'block', marginBottom: 4 }}>Original Coin</label>
            <select value={original} onChange={(e) => setOriginal(e.target.value)} style={inputStyle}>
              {COINS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label style={{ color: '#888', fontSize: '0.85rem', display: 'block', marginBottom: 4 }}>Alternative Coin</label>
            <select value={alternative} onChange={(e) => setAlternative(e.target.value)} style={inputStyle}>
              {COINS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label style={{ color: '#888', fontSize: '0.85rem', display: 'block', marginBottom: 4 }}>Start Date</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={{ color: '#888', fontSize: '0.85rem', display: 'block', marginBottom: 4 }}>USD Amount</label>
            <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} style={{ ...inputStyle, width: 120 }} />
          </div>
          <button onClick={runBacktest} disabled={loading} style={btnStyle}>
            {loading ? 'Running...' : 'Run Backtest'}
          </button>
        </div>
      </Card>

      {loading && <LoadingSpinner />}

      {/* Results */}
      {result && (
        <div style={{ marginTop: '1.5rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
            <StatCard value={`$${Number(origVal).toLocaleString()}`} label={`${original} Value`} change={Number(origReturn)} />
            <StatCard value={`$${Number(altVal).toLocaleString()}`} label={`${alternative} Value`} change={Number(altReturn)} />
            <StatCard
              value={`${diff >= 0 ? '+' : ''}$${Number(Math.abs(diff)).toLocaleString()}`}
              label="Difference"
            />
          </div>

          {/* Chart placeholder */}
          {(result.original_history || result.alternative_history || result.chart) && (
            <Card title="Value Over Time">
              <p style={{ color: '#888', textAlign: 'center', padding: '2rem' }}>
                Chart visualization available when Chart.js is loaded. Data points: {
                  (result.original_history || result.chart?.original || []).length
                } records.
              </p>
            </Card>
          )}
        </div>
      )}

      {/* Multi-Compare Section */}
      <Card title="Multi-Coin Compare" style={{ marginTop: '1.5rem' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
          {COINS.map((c) => (
            <label key={c} style={{
              display: 'flex', alignItems: 'center', gap: '0.4rem',
              padding: '0.4rem 0.8rem', borderRadius: 6,
              background: compareCoins[c] ? '#646cff22' : '#12121f',
              border: `1px solid ${compareCoins[c] ? '#646cff' : '#2a2a3d'}`,
              color: compareCoins[c] ? '#646cff' : '#888',
              cursor: 'pointer', fontSize: '0.9rem', fontWeight: 600,
            }}>
              <input
                type="checkbox"
                checked={!!compareCoins[c]}
                onChange={() => toggleCoin(c)}
                style={{ display: 'none' }}
              />
              {c}
            </label>
          ))}
        </div>
        <button onClick={runCompare} disabled={compareLoading} style={btnStyle}>
          {compareLoading ? 'Comparing...' : 'Compare'}
        </button>

        {compareResult && (
          <div style={{ marginTop: '1rem' }}>
            {Array.isArray(compareResult.results || compareResult) ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.75rem' }}>
                {(compareResult.results || compareResult).map((r, i) => (
                  <Card key={i}>
                    <div style={{ color: '#e0e0e0', fontWeight: 700, marginBottom: 4 }}>{r.coin || r.name}</div>
                    <div style={{ color: '#4ade80', fontSize: '1.2rem', fontWeight: 700 }}>${Number(r.value || r.final_value || 0).toLocaleString()}</div>
                    <div style={{ color: '#888', fontSize: '0.85rem' }}>Return: {r.return_pct || r.returnPct || '--'}%</div>
                  </Card>
                ))}
              </div>
            ) : (
              <p style={{ color: '#888' }}>Comparison complete. Check the data above.</p>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
