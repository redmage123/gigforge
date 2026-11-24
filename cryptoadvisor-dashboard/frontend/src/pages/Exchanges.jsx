import { useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';
import Card from '../components/Card';
import LoadingSpinner from '../components/LoadingSpinner';

export default function Exchanges() {
  const [exchanges, setExchanges] = useState([]);
  const [balances, setBalances] = useState(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('binance');
  const [label, setLabel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [secret, setSecret] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/exchanges');
      const list = Array.isArray(res) ? res : res.exchanges || [];
      setExchanges(list);
      // The balance check doubles as the connection test: each result carries a status per exchange
      const bal = list.length > 0 ? await api.get('/api/exchanges/balances').catch(() => null) : null;
      setBalances(bal);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const addExchange = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.post('/api/exchanges/', { name, label: label || name, api_key: apiKey, api_secret: secret });
      setLabel('');
      setApiKey('');
      setSecret('');
      await fetchData();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const removeExchange = async (ex) => {
    if (!window.confirm(`Remove ${ex.label || ex.name}? Its stored API key and secret are deleted.`)) return;
    setError('');
    try {
      await api.del(`/api/exchanges/${ex.id}`);
      await fetchData();
    } catch (err) {
      setError(err.message);
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

  const balArr = Array.isArray(balances) ? balances : [];
  const statusOf = (ex) => {
    const b = balArr.find((r) => r.id === ex.id);
    if (!b) return { text: 'Check failed', bg: '#3f3f46', title: 'Could not run the balance check' };
    if (b.status === 'connected') return { text: 'Connected', bg: '#166534', title: 'API key accepted by the exchange' };
    return { text: b.status === 'unsupported' ? 'Unsupported' : 'Error', bg: '#7f1d1d', title: b.error || '' };
  };

  return (
    <div>
      <h2 style={{ color: '#e0e0e0', marginBottom: '1.5rem' }}>Exchange Connections</h2>

      <Card title="Connect Exchange" style={{ marginBottom: '1.5rem' }}>
        <form onSubmit={addExchange} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.75rem', alignItems: 'end' }}>
          <div>
            <label style={{ color: '#888', fontSize: '0.8rem', display: 'block', marginBottom: 4 }}>Exchange</label>
            <select value={name} onChange={(e) => setName(e.target.value)} style={inputStyle}>
              {['binance', 'coinbase'].map((ex) => (
                <option key={ex} value={ex}>{ex.charAt(0).toUpperCase() + ex.slice(1)}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ color: '#888', fontSize: '0.8rem', display: 'block', marginBottom: 4 }}>Label</label>
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="My Binance" style={inputStyle} />
          </div>
          <div>
            <label style={{ color: '#888', fontSize: '0.8rem', display: 'block', marginBottom: 4 }}>API Key</label>
            <input value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="API Key" style={inputStyle} required />
          </div>
          <div>
            <label style={{ color: '#888', fontSize: '0.8rem', display: 'block', marginBottom: 4 }}>Secret</label>
            <input type="password" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="Secret" style={inputStyle} required />
          </div>
          <button type="submit" disabled={saving} style={btnStyle}>{saving ? 'Connecting...' : 'Connect'}</button>
        </form>
        {error && <p style={{ color: '#f87171', marginTop: '0.75rem' }}>{error}</p>}
      </Card>

      {loading ? <LoadingSpinner text="Loading exchanges..." /> : (
        <>
          <Card title="Connected Exchanges" style={{ marginBottom: '1.5rem' }}>
            {exchanges.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {exchanges.map((ex) => {
                  const st = statusOf(ex);
                  const err = balArr.find((r) => r.id === ex.id)?.error;
                  return (
                    <div key={ex.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', padding: '0.75rem', background: '#12121f', borderRadius: 8 }}>
                      <div>
                        <div style={{ color: '#e0e0e0', fontWeight: 600 }}>{ex.label || ex.name}</div>
                        <div style={{ color: '#888', fontSize: '0.85rem' }}>{ex.name}</div>
                        {err && <div style={{ color: '#f87171', fontSize: '0.8rem' }}>{err}</div>}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <div title={st.title} style={{ color: '#fff', fontSize: '0.8rem', fontWeight: 600, background: st.bg, padding: '2px 8px', borderRadius: 4 }}>
                          {st.text}
                        </div>
                        <button type="button" onClick={() => removeExchange(ex)} aria-label={`Remove ${ex.label || ex.name}`}
                          style={{ padding: '0.3rem 0.7rem', background: '#3a1e1e', color: '#f87171', border: '1px solid #f8717133', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem' }}>
                          Remove
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : <p style={{ color: '#888' }}>No exchanges connected yet.</p>}
          </Card>

          {balArr.some((b) => b.balances?.length) && (
            <Card title="Exchange Balances">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.75rem' }}>
                {balArr.filter((b) => b.balances?.length).map((b) => (
                  <div key={b.id} style={{ padding: '1rem', background: '#12121f', borderRadius: 8 }}>
                    <div style={{ color: '#646cff', fontWeight: 600, marginBottom: '0.5rem' }}>{b.label || b.exchange}</div>
                    {b.balances.map((asset) => (
                      <div key={asset.asset} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.25rem 0' }}>
                        <span style={{ color: '#aaa' }}>{asset.asset}</span>
                        <span style={{ color: '#fff' }}>{Number(asset.total).toLocaleString(undefined, { maximumFractionDigits: 8 })}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
