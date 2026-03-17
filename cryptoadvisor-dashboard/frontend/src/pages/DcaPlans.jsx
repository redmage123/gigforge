import { useState, useEffect } from 'react';
import { api } from '../api/client';
import Card from '../components/Card';
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

const deleteBtnStyle = {
  padding: '0.4rem 0.8rem',
  background: '#3a1e1e',
  color: '#f87171',
  border: '1px solid #f8717133',
  borderRadius: 6,
  cursor: 'pointer',
  fontWeight: 600,
  fontSize: '0.85rem',
};

const COINS = ['bitcoin', 'ethereum', 'solana', 'cardano', 'polkadot', 'avalanche-2', 'chainlink'];
const EXCHANGES = ['Binance', 'Coinbase', 'Kraken', 'KuCoin', 'Bybit'];
const FREQUENCIES = ['daily', 'weekly', 'monthly'];

export default function DcaPlans() {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);

  // Form state
  const [coin, setCoin] = useState('bitcoin');
  const [exchange, setExchange] = useState('Binance');
  const [amount, setAmount] = useState('100');
  const [frequency, setFrequency] = useState('weekly');

  const fetchPlans = async () => {
    try {
      const res = await api.get('/api/dca-plans');
      setPlans(Array.isArray(res) ? res : res.plans || []);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchPlans(); }, []);

  const createPlan = async () => {
    setCreating(true);
    setError('');
    try {
      await api.post('/api/dca-plans', {
        coin,
        exchange,
        amount: Number(amount),
        frequency,
      });
      await fetchPlans();
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  const deletePlan = async (id) => {
    try {
      await api.del(`/api/dca-plans/${id}`);
      setPlans((prev) => prev.filter((p) => (p.id || p._id) !== id));
    } catch (err) {
      setError(err.message);
    }
  };

  const statusColors = {
    active: { bg: '#1e3a2e', color: '#4ade80' },
    paused: { bg: '#3b3b1e', color: '#f59e0b' },
    stopped: { bg: '#3a1e1e', color: '#f87171' },
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      <h2 style={{ color: '#e0e0e0', marginBottom: '1.5rem' }}>DCA Automation</h2>

      {error && <div style={{ color: '#f87171', marginBottom: '1rem' }}>{error}</div>}

      {/* Create Plan Form */}
      <Card title="Create DCA Plan">
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label style={{ color: '#888', fontSize: '0.85rem', display: 'block', marginBottom: 4 }}>Coin</label>
            <select value={coin} onChange={(e) => setCoin(e.target.value)} style={inputStyle}>
              {COINS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label style={{ color: '#888', fontSize: '0.85rem', display: 'block', marginBottom: 4 }}>Exchange</label>
            <select value={exchange} onChange={(e) => setExchange(e.target.value)} style={inputStyle}>
              {EXCHANGES.map((e) => <option key={e} value={e}>{e}</option>)}
            </select>
          </div>
          <div>
            <label style={{ color: '#888', fontSize: '0.85rem', display: 'block', marginBottom: 4 }}>Amount ($)</label>
            <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} style={{ ...inputStyle, width: 120 }} />
          </div>
          <div>
            <label style={{ color: '#888', fontSize: '0.85rem', display: 'block', marginBottom: 4 }}>Frequency</label>
            <select value={frequency} onChange={(e) => setFrequency(e.target.value)} style={inputStyle}>
              {FREQUENCIES.map((f) => <option key={f} value={f}>{f.charAt(0).toUpperCase() + f.slice(1)}</option>)}
            </select>
          </div>
          <button onClick={createPlan} disabled={creating} style={btnStyle}>
            {creating ? 'Creating...' : 'Create Plan'}
          </button>
        </div>
        <p style={{ color: '#666', fontSize: '0.8rem', marginTop: '0.75rem', fontStyle: 'italic' }}>
          Note: Requires connected exchange API keys for automatic execution.
        </p>
      </Card>

      {/* Active Plans */}
      <Card title="Active Plans" style={{ marginTop: '1.5rem' }}>
        {plans.length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Coin', 'Amount', 'Frequency', 'Exchange', 'Next Execution', 'Status', ''].map((h) => (
                    <th key={h} style={{ padding: '0.75rem', borderBottom: '1px solid #2a2a3d', color: '#888', textAlign: 'left', fontSize: '0.85rem' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {plans.map((p, i) => {
                  const status = (p.status || 'active').toLowerCase();
                  const sc = statusColors[status] || statusColors.active;
                  const id = p.id || p._id || i;
                  return (
                    <tr key={id}>
                      <td style={{ padding: '0.75rem', borderBottom: '1px solid #1a1a2e', color: '#e0e0e0', fontWeight: 600 }}>{p.coin || '--'}</td>
                      <td style={{ padding: '0.75rem', borderBottom: '1px solid #1a1a2e', color: '#4ade80', fontWeight: 600 }}>${Number(p.amount || 0).toLocaleString()}</td>
                      <td style={{ padding: '0.75rem', borderBottom: '1px solid #1a1a2e', color: '#e0e0e0', textTransform: 'capitalize' }}>{p.frequency || '--'}</td>
                      <td style={{ padding: '0.75rem', borderBottom: '1px solid #1a1a2e', color: '#e0e0e0' }}>{p.exchange || '--'}</td>
                      <td style={{ padding: '0.75rem', borderBottom: '1px solid #1a1a2e', color: '#aaa' }}>{p.next_execution || p.nextExecution || '--'}</td>
                      <td style={{ padding: '0.75rem', borderBottom: '1px solid #1a1a2e' }}>
                        <span style={{ background: sc.bg, color: sc.color, padding: '2px 8px', borderRadius: 4, fontSize: '0.85rem', fontWeight: 600, textTransform: 'capitalize' }}>
                          {status}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem', borderBottom: '1px solid #1a1a2e' }}>
                        <button onClick={() => deletePlan(id)} style={deleteBtnStyle}>Delete</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p style={{ color: '#888', textAlign: 'center' }}>No DCA plans created yet.</p>
        )}
      </Card>
    </div>
  );
}
