import { useState } from 'react';
import { api } from '../api/client';
import Card from '../components/Card';
import StatCard from '../components/StatCard';
import LoadingSpinner from '../components/LoadingSpinner';
import { Chart as ChartJS, LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Legend } from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Legend);

export default function DCA() {
  const [coin, setCoin] = useState('bitcoin');
  const [frequency, setFrequency] = useState('weekly');
  const [amount, setAmount] = useState('100');
  const [period, setPeriod] = useState('365');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const runBacktest = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await api.post('/api/dca/backtest', {
        coin,
        frequency,
        amount: parseFloat(amount),
        period: parseInt(period),
      });
      setResult(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = {
    padding: '0.6rem 1rem',
    background: '#12121f',
    border: '1px solid #2a2a3d',
    borderRadius: 8,
    color: '#e0e0e0',
    fontSize: '0.95rem',
    width: '100%',
    boxSizing: 'border-box',
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

  const chartData = result && (result.chart_data || result.history) ? {
    labels: (result.chart_data || result.history).map((p) => p.date || p.label || ''),
    datasets: [
      {
        label: 'DCA Value',
        data: (result.chart_data || result.history).map((p) => p.dca_value || p.value),
        borderColor: '#646cff',
        backgroundColor: '#646cff22',
        fill: true,
        tension: 0.3,
      },
      {
        label: 'Lump Sum Value',
        data: (result.chart_data || result.history).map((p) => p.lump_sum_value || p.lump_sum),
        borderColor: '#f87171',
        borderDash: [5, 5],
        fill: false,
        tension: 0.3,
      },
    ],
  } : null;

  const chartOpts = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { labels: { color: '#aaa' } } },
    scales: {
      x: { ticks: { color: '#888', maxTicksLimit: 12 }, grid: { color: '#1a1a2e' } },
      y: { ticks: { color: '#888', callback: (v) => `$${v.toLocaleString()}` }, grid: { color: '#1a1a2e' } },
    },
  };

  const roi = result ? ((result.current_value || result.final_value || 0) / (result.total_invested || 1) - 1) * 100 : 0;

  return (
    <div>
      <h2 style={{ color: '#e0e0e0', marginBottom: '1.5rem' }}>DCA Calculator</h2>

      <Card title="Backtest Parameters" style={{ marginBottom: '1.5rem' }}>
        <form onSubmit={runBacktest} style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label style={{ color: '#888', fontSize: '0.8rem', display: 'block', marginBottom: 4 }}>Coin</label>
            <select value={coin} onChange={(e) => setCoin(e.target.value)} style={inputStyle}>
              {['bitcoin', 'ethereum', 'solana', 'cardano', 'polkadot', 'dogecoin'].map((c) => (
                <option key={c} value={c}>{c.replace(/\b\w/g, (l) => l.toUpperCase())}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ color: '#888', fontSize: '0.8rem', display: 'block', marginBottom: 4 }}>Frequency</label>
            <select value={frequency} onChange={(e) => setFrequency(e.target.value)} style={inputStyle}>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>
          <div>
            <label style={{ color: '#888', fontSize: '0.8rem', display: 'block', marginBottom: 4 }}>Amount ($)</label>
            <input type="number" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} style={inputStyle} required />
          </div>
          <div>
            <label style={{ color: '#888', fontSize: '0.8rem', display: 'block', marginBottom: 4 }}>Period (days)</label>
            <input type="number" value={period} onChange={(e) => setPeriod(e.target.value)} style={inputStyle} required />
          </div>
          <button type="submit" disabled={loading} style={btnStyle}>{loading ? 'Running...' : 'Run Backtest'}</button>
        </form>
        {error && <p style={{ color: '#f87171', marginTop: '0.75rem' }}>{error}</p>}
      </Card>

      {loading && <LoadingSpinner text="Running DCA backtest..." />}

      {result && (
        <>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
            <StatCard label="Total Invested" value={`$${Number(result.total_invested || 0).toLocaleString()}`} />
            <StatCard label="Current Value" value={`$${Number(result.current_value || result.final_value || 0).toLocaleString()}`} color="#646cff" />
            <StatCard label="ROI" value={`${roi >= 0 ? '+' : ''}${roi.toFixed(2)}%`} color={roi >= 0 ? '#4ade80' : '#f87171'} />
            <StatCard label="Total Coins" value={result.total_coins || result.total_amount || '--'} />
          </div>

          {chartData && (
            <Card title="DCA vs Lump Sum">
              <div style={{ height: 350 }}>
                <Line data={chartData} options={chartOpts} />
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
