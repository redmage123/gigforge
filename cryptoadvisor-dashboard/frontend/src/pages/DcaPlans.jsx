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

const toggleBtnStyle = {
  ...deleteBtnStyle,
  background: '#1e2a3b',
  color: '#93c5fd',
  border: '1px solid #93c5fd33',
  marginRight: '0.5rem',
};

const COINS = ['BTC', 'ETH', 'SOL', 'ADA', 'DOT', 'AVAX', 'LINK'];
const EXCHANGES = ['Binance', 'Coinbase', 'Kraken', 'KuCoin', 'Bybit'];
const FREQUENCIES = ['daily', 'weekly', 'monthly'];

export default function DcaPlans() {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);

  // Form state
  const [coin, setCoin] = useState('BTC');
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
      await api.post('/api/dca-plans/', {
        coin,
        exchange,
        amount_usd: Number(amount),
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
      setPlans((prev) => prev.filter((p) => p.plan_id !== id));
    } catch (err) {
      setError(err.message);
    }
  };

  const setStatus = async (id, action) => {
    setError('');
    try {
      const updated = await api.post(`/api/dca-plans/${id}/${action}`, {});
      setPlans((prev) => prev.map((p) => (p.plan_id === id ? updated : p)));
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
          Note: AssetAdvisor does not place orders. Plans are tracked only: when a buy is due, it is logged here as a
          simulated purchase and nothing is sent to the exchange. Place the actual buys yourself. Paused plans log
          nothing; when you resume, buys missed while paused are skipped and the next one is scheduled from that moment.
        </p>
      </Card>

      {/* Active Plans */}
      <Card title="Your Plans" style={{ marginTop: '1.5rem' }}>
        {plans.length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Coin', 'Amount', 'Frequency', 'Exchange', 'Next Simulated Buy', 'Simulated Buys', 'Status', ''].map((h) => (
                    <th key={h} style={{ padding: '0.75rem', borderBottom: '1px solid #2a2a3d', color: '#888', textAlign: 'left', fontSize: '0.85rem' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {plans.map((p, i) => {
                  const status = (p.status || 'active').toLowerCase();
                  const sc = statusColors[status] || statusColors.active;
                  const id = p.plan_id;
                  return (
                    <tr key={id || i}>
                      <td style={{ padding: '0.75rem', borderBottom: '1px solid #1a1a2e', color: '#e0e0e0', fontWeight: 600 }}>{p.coin || '--'}</td>
                      <td style={{ padding: '0.75rem', borderBottom: '1px solid #1a1a2e', color: '#4ade80', fontWeight: 600 }}>${Number(p.amount_usd || 0).toLocaleString()}</td>
                      <td style={{ padding: '0.75rem', borderBottom: '1px solid #1a1a2e', color: '#e0e0e0', textTransform: 'capitalize' }}>{p.frequency || '--'}</td>
                      <td style={{ padding: '0.75rem', borderBottom: '1px solid #1a1a2e', color: '#e0e0e0' }}>{p.exchange || '--'}</td>
                      <td style={{ padding: '0.75rem', borderBottom: '1px solid #1a1a2e', color: '#aaa' }}>
                        {p.next_execution ? new Date(p.next_execution).toLocaleString() : status === 'paused' ? 'Paused' : '--'}
                      </td>
                      <td style={{ padding: '0.75rem', borderBottom: '1px solid #1a1a2e', color: '#aaa' }}>
                        {p.execution_count || 0}{p.execution_count ? ` ($${Number(p.total_invested || 0).toLocaleString()})` : ''}
                      </td>
                      <td style={{ padding: '0.75rem', borderBottom: '1px solid #1a1a2e' }}>
                        <span style={{ background: sc.bg, color: sc.color, padding: '2px 8px', borderRadius: 4, fontSize: '0.85rem', fontWeight: 600, textTransform: 'capitalize' }}>
                          {status}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem', borderBottom: '1px solid #1a1a2e', whiteSpace: 'nowrap' }}>
                        {status === 'active' && (
                          <button onClick={() => setStatus(id, 'pause')} disabled={!id} style={toggleBtnStyle}>Pause</button>
                        )}
                        {status === 'paused' && (
                          <button onClick={() => setStatus(id, 'resume')} disabled={!id} style={toggleBtnStyle} title="Buys missed while paused are skipped">Resume</button>
                        )}
                        <button onClick={() => deletePlan(id)} disabled={!id} style={deleteBtnStyle}>Delete</button>
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
