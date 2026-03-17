import { useState, useEffect } from 'react';
import { api } from '../api/client';
import Card from '../components/Card';
import StatCard from '../components/StatCard';
import LoadingSpinner from '../components/LoadingSpinner';

const cellStyle = { padding: '0.75rem', borderBottom: '1px solid #1a1a2e' };
const headStyle = { ...cellStyle, color: '#888', textAlign: 'left', fontSize: '0.85rem', borderBottom: '1px solid #2a2a3d' };

export default function Liquidations() {
  const [liquidations, setLiquidations] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchData = async () => {
    try {
      const [liqRes, sumRes] = await Promise.all([
        api.get('/api/liquidations'),
        api.get('/api/liquidations/summary'),
      ]);
      setLiquidations(Array.isArray(liqRes) ? liqRes : liqRes.liquidations || []);
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
    const id = setInterval(fetchData, 30000);
    return () => clearInterval(id);
  }, []);

  const totalLongs = summary?.total_long_liquidations || summary?.totalLongs || 0;
  const totalShorts = summary?.total_short_liquidations || summary?.totalShorts || 0;
  const largest = summary?.largest_single || summary?.largestSingle || 0;
  const mostLiquidated = summary?.most_liquidated_coin || summary?.mostLiquidatedCoin || '--';
  const longPct = totalLongs + totalShorts > 0 ? (totalLongs / (totalLongs + totalShorts)) * 100 : 50;

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      <h2 style={{ color: '#e0e0e0', marginBottom: '1.5rem' }}>Liquidation Heatmap</h2>

      {error && <div style={{ color: '#f87171', marginBottom: '1rem' }}>{error}</div>}

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        <StatCard value={`$${Number(totalLongs).toLocaleString()}`} label="Total Long Liquidations" />
        <StatCard value={`$${Number(totalShorts).toLocaleString()}`} label="Total Short Liquidations" />
        <StatCard value={`$${Number(largest).toLocaleString()}`} label="Largest Single" />
        <StatCard value={mostLiquidated} label="Most Liquidated Coin" />
      </div>

      {/* Long vs Short Ratio Bar */}
      <Card title="Long vs Short Ratio">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
          <span style={{ color: '#f87171', fontWeight: 600, fontSize: '0.9rem', minWidth: 70 }}>Longs {longPct.toFixed(1)}%</span>
          <div style={{ flex: 1, height: 24, borderRadius: 12, overflow: 'hidden', background: '#1a1a2e', display: 'flex' }}>
            <div style={{ width: `${longPct}%`, background: 'linear-gradient(90deg, #f87171, #ef4444)', height: '100%', transition: 'width 0.5s' }} />
            <div style={{ flex: 1, background: 'linear-gradient(90deg, #22c55e, #4ade80)', height: '100%' }} />
          </div>
          <span style={{ color: '#4ade80', fontWeight: 600, fontSize: '0.9rem', minWidth: 70, textAlign: 'right' }}>Shorts {(100 - longPct).toFixed(1)}%</span>
        </div>
      </Card>

      {/* Liquidations Table */}
      <Card title="Recent Liquidations" style={{ marginTop: '1rem' }}>
        {liquidations.length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Symbol', 'Side', 'Quantity', 'Price', 'USD Value', 'Time'].map((h) => (
                    <th key={h} style={headStyle}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {liquidations.map((liq, i) => {
                  const side = (liq.side || '').toLowerCase();
                  const isLong = side === 'long' || side === 'buy';
                  return (
                    <tr key={i}>
                      <td style={{ ...cellStyle, color: '#e0e0e0', fontWeight: 600 }}>{liq.symbol || liq.coin || '--'}</td>
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
                      <td style={{ ...cellStyle, color: '#e0e0e0', fontFamily: 'monospace' }}>{Number(liq.quantity || liq.amount || 0).toLocaleString()}</td>
                      <td style={{ ...cellStyle, color: '#e0e0e0', fontFamily: 'monospace' }}>${Number(liq.price || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                      <td style={{ ...cellStyle, color: '#f59e0b', fontWeight: 600 }}>${Number(liq.usd_value || liq.value || 0).toLocaleString()}</td>
                      <td style={{ ...cellStyle, color: '#aaa' }}>{liq.time || liq.timestamp || '--'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p style={{ color: '#888', textAlign: 'center' }}>No recent liquidations found.</p>
        )}
      </Card>
    </div>
  );
}
