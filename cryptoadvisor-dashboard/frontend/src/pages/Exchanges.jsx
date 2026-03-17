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
      if (list.length > 0) {
        const bal = await api.get('/api/exchanges/balances').catch(() => null);
        setBalances(bal);
      }
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
      await api.post('/api/exchanges', { name, label: label || name, api_key: apiKey, secret });
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

  const balArr = balances ? (Array.isArray(balances) ? balances : balances.balances || Object.entries(balances).map(([k, v]) => ({ exchange: k, ...v }))) : [];

  return (
    <div>
      <h2 style={{ color: '#e0e0e0', marginBottom: '1.5rem' }}>Exchange Connections</h2>

      <Card title="Connect Exchange" style={{ marginBottom: '1.5rem' }}>
        <form onSubmit={addExchange} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.75rem', alignItems: 'end' }}>
          <div>
            <label style={{ color: '#888', fontSize: '0.8rem', display: 'block', marginBottom: 4 }}>Exchange</label>
            <select value={name} onChange={(e) => setName(e.target.value)} style={inputStyle}>
              {['binance', 'coinbase', 'kraken', 'kucoin', 'bybit', 'okx', 'gate.io'].map((ex) => (
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
                {exchanges.map((ex, i) => (
                  <div key={ex.id || i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem', background: '#12121f', borderRadius: 8 }}>
                    <div>
                      <div style={{ color: '#e0e0e0', fontWeight: 600 }}>{ex.label || ex.name}</div>
                      <div style={{ color: '#888', fontSize: '0.85rem' }}>{ex.name || ex.exchange}</div>
                    </div>
                    <div style={{
                      color: '#fff', fontSize: '0.8rem', fontWeight: 600,
                      background: ex.status === 'active' || ex.connected ? '#166534' : '#713f12',
                      padding: '2px 8px', borderRadius: 4,
                    }}>
                      {ex.status || (ex.connected ? 'Active' : 'Inactive')}
                    </div>
                  </div>
                ))}
              </div>
            ) : <p style={{ color: '#888' }}>No exchanges connected yet.</p>}
          </Card>

          {balArr.length > 0 && (
            <Card title="Exchange Balances">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.75rem' }}>
                {balArr.map((b, i) => (
                  <div key={i} style={{ padding: '1rem', background: '#12121f', borderRadius: 8 }}>
                    <div style={{ color: '#646cff', fontWeight: 600, marginBottom: '0.5rem' }}>{b.exchange || b.name || b.label}</div>
                    {(b.assets || b.balances || Object.entries(b).filter(([k]) => !['exchange', 'name', 'label'].includes(k))).map((asset, j) => {
                      const sym = Array.isArray(asset) ? asset[0] : (asset.symbol || asset.coin);
                      const amt = Array.isArray(asset) ? asset[1] : (asset.amount || asset.balance || asset.free);
                      return (
                        <div key={j} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.25rem 0' }}>
                          <span style={{ color: '#aaa' }}>{sym}</span>
                          <span style={{ color: '#fff' }}>{amt}</span>
                        </div>
                      );
                    })}
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
