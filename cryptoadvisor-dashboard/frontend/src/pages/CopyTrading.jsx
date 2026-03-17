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
  flex: 1,
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
  padding: '0.3rem 0.6rem',
  background: '#3a1e1e',
  color: '#f87171',
  border: '1px solid #f8717133',
  borderRadius: 6,
  cursor: 'pointer',
  fontWeight: 600,
  fontSize: '0.8rem',
};

export default function CopyTrading() {
  const [wallets, setWallets] = useState([]);
  const [feed, setFeed] = useState([]);
  const [selectedWallet, setSelectedWallet] = useState(null);
  const [walletTrades, setWalletTrades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Add wallet form
  const [address, setAddress] = useState('');
  const [label, setLabel] = useState('');
  const [adding, setAdding] = useState(false);

  const fetchWallets = async () => {
    try {
      const res = await api.get('/api/copy-trading/wallets');
      setWallets(Array.isArray(res) ? res : res.wallets || []);
    } catch (err) {
      // wallets endpoint might not exist yet
    }
  };

  const fetchFeed = async () => {
    try {
      const res = await api.get('/api/copy-trading/feed');
      setFeed(Array.isArray(res) ? res : res.feed || res.items || []);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWallets();
    fetchFeed();
    const id = setInterval(fetchFeed, 60000);
    return () => clearInterval(id);
  }, []);

  const addWallet = async () => {
    if (!address.trim()) return;
    setAdding(true);
    setError('');
    try {
      await api.post('/api/copy-trading/wallets', { address: address.trim(), label: label.trim() || address.trim().slice(0, 8) });
      setAddress('');
      setLabel('');
      await fetchWallets();
    } catch (err) {
      setError(err.message);
    } finally {
      setAdding(false);
    }
  };

  const removeWallet = async (id) => {
    try {
      await api.del(`/api/copy-trading/wallets/${id}`);
      setWallets((prev) => prev.filter((w) => (w.id || w._id || w.address) !== id));
    } catch (err) {
      setError(err.message);
    }
  };

  const viewWalletTrades = async (wallet) => {
    setSelectedWallet(wallet);
    try {
      const res = await api.get(`/api/copy-trading/wallets/${wallet.id || wallet._id || wallet.address}/trades`);
      setWalletTrades(Array.isArray(res) ? res : res.trades || []);
    } catch (err) {
      setWalletTrades([]);
    }
  };

  const truncate = (s) => s ? `${s.slice(0, 10)}...${s.slice(-6)}` : '--';

  const actionColors = {
    bought: '#4ade80',
    buy: '#4ade80',
    sold: '#f87171',
    sell: '#f87171',
    swap: '#f59e0b',
    transfer: '#60a5fa',
  };

  return (
    <div>
      <h2 style={{ color: '#e0e0e0', marginBottom: '1.5rem' }}>Copy Trading / Social Feed</h2>

      {error && <div style={{ color: '#f87171', marginBottom: '1rem' }}>{error}</div>}

      {/* Add Wallet Form */}
      <Card title="Watch a Wallet">
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Wallet address (0x...)"
            style={inputStyle}
          />
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Label (optional)"
            style={{ ...inputStyle, maxWidth: 200 }}
          />
          <button onClick={addWallet} disabled={adding} style={btnStyle}>
            {adding ? 'Adding...' : 'Watch'}
          </button>
        </div>
      </Card>

      {/* Watched Wallets */}
      {wallets.length > 0 && (
        <Card title="Watched Wallets" style={{ marginTop: '1rem' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {wallets.map((w, i) => {
              const id = w.id || w._id || w.address;
              return (
                <div key={id || i} style={{
                  display: 'flex', alignItems: 'center', gap: '0.5rem',
                  background: '#12121f', border: '1px solid #2a2a3d', borderRadius: 8,
                  padding: '0.4rem 0.75rem',
                }}>
                  <span
                    style={{ color: '#646cff', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem' }}
                    onClick={() => viewWalletTrades(w)}
                  >
                    {w.label || truncate(w.address)}
                  </span>
                  <span style={{ color: '#888', fontSize: '0.8rem', fontFamily: 'monospace' }}>{truncate(w.address)}</span>
                  <button onClick={() => removeWallet(id)} style={deleteBtnStyle}>Remove</button>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Wallet Detail Trades */}
      {selectedWallet && (
        <Card title={`Trades: ${selectedWallet.label || truncate(selectedWallet.address)}`} style={{ marginTop: '1rem' }}>
          <button onClick={() => setSelectedWallet(null)} style={{ ...deleteBtnStyle, marginBottom: '0.75rem' }}>Close</button>
          {walletTrades.length > 0 ? (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['Action', 'Token', 'Amount', 'Price', 'Time'].map((h) => (
                      <th key={h} style={{ padding: '0.75rem', borderBottom: '1px solid #2a2a3d', color: '#888', textAlign: 'left', fontSize: '0.85rem' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {walletTrades.map((t, i) => (
                    <tr key={i}>
                      <td style={{ padding: '0.75rem', borderBottom: '1px solid #1a1a2e', color: actionColors[(t.action || '').toLowerCase()] || '#e0e0e0', fontWeight: 600, textTransform: 'capitalize' }}>
                        {t.action || '--'}
                      </td>
                      <td style={{ padding: '0.75rem', borderBottom: '1px solid #1a1a2e', color: '#e0e0e0' }}>{t.token || t.symbol || '--'}</td>
                      <td style={{ padding: '0.75rem', borderBottom: '1px solid #1a1a2e', color: '#e0e0e0', fontFamily: 'monospace' }}>{Number(t.amount || 0).toLocaleString()}</td>
                      <td style={{ padding: '0.75rem', borderBottom: '1px solid #1a1a2e', color: '#e0e0e0' }}>${Number(t.price || 0).toLocaleString()}</td>
                      <td style={{ padding: '0.75rem', borderBottom: '1px solid #1a1a2e', color: '#aaa' }}>{t.time || t.timestamp || '--'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p style={{ color: '#888' }}>No recent trades found.</p>
          )}
        </Card>
      )}

      {/* Social Feed */}
      <Card title="Social Feed" style={{ marginTop: '1.5rem' }}>
        {loading ? <LoadingSpinner /> : feed.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {feed.map((item, i) => {
              const action = (item.action || '').toLowerCase();
              const color = actionColors[action] || '#e0e0e0';
              return (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem',
                  background: '#12121f', borderRadius: 8, border: '1px solid #1a1a2e',
                }}>
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#2a2a3d', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888', fontSize: '0.75rem', fontWeight: 700, flexShrink: 0 }}>
                    {(item.wallet_label || item.walletLabel || 'W')[0].toUpperCase()}
                  </div>
                  <div style={{ flex: 1 }}>
                    <span style={{ color: '#646cff', fontWeight: 600 }}>{item.wallet_label || item.walletLabel || 'Unknown'}</span>
                    {' '}
                    <span style={{ color, fontWeight: 600 }}>{item.action || '--'}</span>
                    {' '}
                    <span style={{ color: '#e0e0e0' }}>{Number(item.amount || 0).toLocaleString()} {item.token || item.symbol || ''}</span>
                  </div>
                  <span style={{ color: '#888', fontSize: '0.8rem', flexShrink: 0 }}>{item.time_ago || item.timeAgo || item.time || '--'}</span>
                </div>
              );
            })}
          </div>
        ) : (
          <p style={{ color: '#888', textAlign: 'center' }}>No feed activity yet. Start watching wallets to see their trades.</p>
        )}
      </Card>
    </div>
  );
}
