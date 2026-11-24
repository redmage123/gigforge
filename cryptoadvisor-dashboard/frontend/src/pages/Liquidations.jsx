import { useState, useEffect } from 'react';
import { api } from '../api/client';
import Card from '../components/Card';
import StatCard from '../components/StatCard';
import LoadingSpinner from '../components/LoadingSpinner';

const cellStyle = { padding: '0.75rem', borderBottom: '1px solid #1a1a2e' };
const headStyle = { ...cellStyle, color: '#888', textAlign: 'left', fontSize: '0.85rem', borderBottom: '1px solid #2a2a3d' };

const usd = (v) => `$${Number(v || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
const fmtTime = (ms) => (ms ? new Date(ms).toLocaleString() : '--');

function windowText(status) {
  if (!status?.collecting_since) {
    return status?.last_error
      ? `Could not connect to the ${status.source} yet (${status.last_error}). Retrying automatically.`
      : `Connecting to the ${status?.source || 'liquidation stream'}. Liquidations appear here as they happen.`;
  }
  const hours = status.covered_hours;
  const span = hours < 1 ? `${Math.max(1, Math.round(hours * 60))} minutes` : `${hours.toFixed(1)} hours`;
  return `Collected live from the ${status.source} since ${new Date(status.window_start * 1000).toLocaleString()} `
    + `(the last ${span}; this page keeps at most ${status.window_hours} hours). No free source offers older history, `
    + 'and the window restarts when the app restarts. Binance publishes at most one liquidation per symbol per second, '
    + 'so totals are a lower bound.'
    + (status.reconnects ? ` The connection dropped ${status.reconnects} time(s); liquidations during those gaps are missing.` : '');
}

export default function Liquidations() {
  const [liquidations, setLiquidations] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchData = async () => {
    try {
      const [liqRes, sumRes] = await Promise.all([
        api.get('/api/liquidations/'),
        api.get('/api/liquidations/summary'),
      ]);
      setLiquidations(Array.isArray(liqRes.liquidations) ? liqRes.liquidations : []);
      setSummary(sumRes);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, 15000);
    return () => clearInterval(id);
  }, []);

  if (loading) return <LoadingSpinner />;

  const status = summary?.status;
  const hasData = (summary?.count || 0) > 0;
  const longPct = summary?.long_pct;

  return (
    <div>
      <h2 style={{ color: '#e0e0e0', marginBottom: '0.5rem' }}>Futures Liquidations</h2>
      <p style={{ color: '#888', fontSize: '0.85rem', marginBottom: '1.5rem', maxWidth: 900 }}>{windowText(status)}</p>

      {error && <div style={{ color: '#f87171', marginBottom: '1rem' }}>{error}</div>}

      {/* Summary Cards: totals only once something has been collected, never placeholder zeros */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        <StatCard value={hasData ? usd(summary.total_long_usd) : '--'} label="Long Liquidations" />
        <StatCard value={hasData ? usd(summary.total_short_usd) : '--'} label="Short Liquidations" />
        <StatCard value={hasData ? usd(summary.largest?.usd_value) : '--'} label={hasData ? `Largest Single (${summary.largest?.symbol})` : 'Largest Single'} />
        <StatCard value={summary?.most_liquidated_symbol || '--'} label="Most Liquidated Symbol" />
        <StatCard value={hasData ? summary.count.toLocaleString() : '--'} label="Events Collected" />
      </div>

      {/* Long vs Short Ratio Bar */}
      <Card title="Long vs Short (USD)">
        {longPct != null ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
            <span style={{ color: '#f87171', fontWeight: 600, fontSize: '0.9rem', minWidth: 70 }}>Longs {longPct.toFixed(1)}%</span>
            <div style={{ flex: 1, height: 24, borderRadius: 12, overflow: 'hidden', background: '#1a1a2e', display: 'flex' }}>
              <div style={{ width: `${longPct}%`, background: 'linear-gradient(90deg, #f87171, #ef4444)', height: '100%', transition: 'width 0.5s' }} />
              <div style={{ flex: 1, background: 'linear-gradient(90deg, #22c55e, #4ade80)', height: '100%' }} />
            </div>
            <span style={{ color: '#4ade80', fontWeight: 600, fontSize: '0.9rem', minWidth: 70, textAlign: 'right' }}>Shorts {(100 - longPct).toFixed(1)}%</span>
          </div>
        ) : <p style={{ color: '#888' }}>No liquidations collected yet.</p>}
      </Card>

      {/* Liquidations Table */}
      <Card title="Recent Liquidations" style={{ marginTop: '1rem' }}>
        {liquidations.length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Symbol', 'Position', 'Quantity', 'Price', 'USD Value', 'Time'].map((h) => (
                    <th key={h} style={headStyle}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {liquidations.map((liq, i) => {
                  const isLong = liq.side === 'long';
                  return (
                    <tr key={`${liq.symbol}-${liq.time_ms}-${i}`}>
                      <td style={{ ...cellStyle, color: '#e0e0e0', fontWeight: 600 }}>{liq.symbol}</td>
                      <td style={cellStyle}>
                        <span style={{
                          color: isLong ? '#f87171' : '#4ade80',
                          fontWeight: 700,
                          background: isLong ? '#3a1e1e' : '#1e3a2e',
                          padding: '2px 8px',
                          borderRadius: 4,
                          fontSize: '0.85rem',
                        }}>
                          {isLong ? 'LONG' : 'SHORT'}
                        </span>
                      </td>
                      <td style={{ ...cellStyle, color: '#e0e0e0', fontFamily: 'monospace' }}>{Number(liq.quantity || 0).toLocaleString()}</td>
                      <td style={{ ...cellStyle, color: '#e0e0e0', fontFamily: 'monospace' }}>${Number(liq.price || 0).toLocaleString(undefined, { maximumFractionDigits: 8 })}</td>
                      <td style={{ ...cellStyle, color: '#f59e0b', fontWeight: 600 }}>{usd(liq.usd_value)}</td>
                      <td style={{ ...cellStyle, color: '#aaa' }}>{fmtTime(liq.time_ms)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p style={{ color: '#888', textAlign: 'center' }}>No liquidations collected yet in this window.</p>
        )}
      </Card>
    </div>
  );
}
