import { useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';
import Card from '../components/Card';
import LoadingSpinner from '../components/LoadingSpinner';

const COINS = [
  { id: 'bitcoin', label: 'BTC' },
  { id: 'ethereum', label: 'ETH' },
  { id: 'solana', label: 'SOL' },
];

const selectStyle = {
  padding: '0.6rem 1rem',
  background: '#12121f',
  border: '1px solid #2a2a3d',
  borderRadius: 8,
  color: '#e0e0e0',
  fontSize: '0.95rem',
};

const cellStyle = { padding: '0.5rem 0.75rem', borderBottom: '1px solid #1a1a2e' };

export default function Orderbook() {
  const [coin, setCoin] = useState('bitcoin');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchBook = useCallback(async () => {
    try {
      const res = await api.get(`/api/orderbook?coin=${coin}`);
      setData(res);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [coin]);

  useEffect(() => {
    setLoading(true);
    fetchBook();
    const id = setInterval(fetchBook, 5000);
    return () => clearInterval(id);
  }, [fetchBook]);

  const bids = data ? (Array.isArray(data.bids) ? data.bids : []) : [];
  const asks = data ? (Array.isArray(data.asks) ? data.asks : []) : [];

  const maxBidQty = bids.reduce((m, b) => Math.max(m, Number(b.quantity || b.amount || 0)), 1);
  const maxAskQty = asks.reduce((m, a) => Math.max(m, Number(a.quantity || a.amount || 0)), 1);

  const bestBid = bids.length > 0 ? Number(bids[0].price || 0) : 0;
  const bestAsk = asks.length > 0 ? Number(asks[0].price || 0) : 0;
  const spread = bestAsk - bestBid;
  const midPrice = (bestAsk + bestBid) / 2;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <h2 style={{ color: '#e0e0e0', margin: 0 }}>Order Book</h2>
        <select value={coin} onChange={(e) => setCoin(e.target.value)} style={selectStyle}>
          {COINS.map((c) => (
            <option key={c.id} value={c.id}>{c.label}</option>
          ))}
        </select>
      </div>

      {error && <div style={{ color: '#f87171', marginBottom: '1rem' }}>{error}</div>}

      {loading ? (
        <LoadingSpinner />
      ) : (
        <>
          {/* Spread / Mid Price */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: '2rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
            <Card>
              <div style={{ textAlign: 'center' }}>
                <div style={{ color: '#888', fontSize: '0.85rem', marginBottom: 4 }}>Spread</div>
                <div style={{ color: '#f59e0b', fontSize: '1.3rem', fontWeight: 700 }}>
                  ${spread.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>
            </Card>
            <Card>
              <div style={{ textAlign: 'center' }}>
                <div style={{ color: '#888', fontSize: '0.85rem', marginBottom: 4 }}>Mid Price</div>
                <div style={{ color: '#e0e0e0', fontSize: '1.3rem', fontWeight: 700 }}>
                  ${midPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>
            </Card>
          </div>

          {/* Bids and Asks */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            {/* Bids */}
            <Card title="Bids">
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      {['Price', 'Quantity', 'Exchange', 'Depth'].map((h) => (
                        <th key={h} style={{ ...cellStyle, color: '#888', textAlign: 'left', fontSize: '0.85rem', borderBottom: '1px solid #2a2a3d' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {bids.slice(0, 20).map((b, i) => {
                      const qty = Number(b.quantity || b.amount || 0);
                      const pct = (qty / maxBidQty) * 100;
                      return (
                        <tr key={i}>
                          <td style={{ ...cellStyle, color: '#4ade80', fontWeight: 600, fontFamily: 'monospace' }}>
                            ${Number(b.price || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </td>
                          <td style={{ ...cellStyle, color: '#e0e0e0', fontFamily: 'monospace' }}>{qty.toLocaleString()}</td>
                          <td style={cellStyle}>
                            {b.exchange && (
                              <span style={{ background: '#1e3a2e', color: '#4ade80', padding: '2px 8px', borderRadius: 4, fontSize: '0.8rem', fontWeight: 600 }}>
                                {b.exchange}
                              </span>
                            )}
                          </td>
                          <td style={{ ...cellStyle, width: '120px' }}>
                            <div style={{ background: '#1a1a2e', borderRadius: 4, height: 16, overflow: 'hidden' }}>
                              <div style={{ width: `${pct}%`, height: '100%', background: 'rgba(74, 222, 128, 0.4)', borderRadius: 4 }} />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {bids.length === 0 && <p style={{ color: '#888', textAlign: 'center' }}>No bids available.</p>}
              </div>
            </Card>

            {/* Asks */}
            <Card title="Asks">
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      {['Price', 'Quantity', 'Exchange', 'Depth'].map((h) => (
                        <th key={h} style={{ ...cellStyle, color: '#888', textAlign: 'left', fontSize: '0.85rem', borderBottom: '1px solid #2a2a3d' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {asks.slice(0, 20).map((a, i) => {
                      const qty = Number(a.quantity || a.amount || 0);
                      const pct = (qty / maxAskQty) * 100;
                      return (
                        <tr key={i}>
                          <td style={{ ...cellStyle, color: '#f87171', fontWeight: 600, fontFamily: 'monospace' }}>
                            ${Number(a.price || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </td>
                          <td style={{ ...cellStyle, color: '#e0e0e0', fontFamily: 'monospace' }}>{qty.toLocaleString()}</td>
                          <td style={cellStyle}>
                            {a.exchange && (
                              <span style={{ background: '#3a1e1e', color: '#f87171', padding: '2px 8px', borderRadius: 4, fontSize: '0.8rem', fontWeight: 600 }}>
                                {a.exchange}
                              </span>
                            )}
                          </td>
                          <td style={{ ...cellStyle, width: '120px' }}>
                            <div style={{ background: '#1a1a2e', borderRadius: 4, height: 16, overflow: 'hidden' }}>
                              <div style={{ width: `${pct}%`, height: '100%', background: 'rgba(248, 113, 113, 0.4)', borderRadius: 4 }} />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {asks.length === 0 && <p style={{ color: '#888', textAlign: 'center' }}>No asks available.</p>}
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
