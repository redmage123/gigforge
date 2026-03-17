import { useState } from 'react';
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

const cellStyle = { padding: '0.75rem', borderBottom: '1px solid #1a1a2e' };
const headStyle = { ...cellStyle, color: '#888', textAlign: 'left', fontSize: '0.85rem', borderBottom: '1px solid #2a2a3d' };

const truncate = (s) => s ? `${s.slice(0, 10)}...${s.slice(-6)}` : '--';

export default function Multisig() {
  const [address, setAddress] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadSafe = async () => {
    if (!address.trim()) return;
    setLoading(true);
    setError('');
    setData(null);
    try {
      const res = await api.get(`/api/multisig/${address.trim()}`);
      setData(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const owners = data?.owners || [];
  const threshold = data?.threshold || '--';
  const totalOwners = owners.length || data?.total_owners || '--';
  const nonce = data?.nonce ?? '--';
  const modules = data?.modules || [];
  const pendingTxns = data?.pending_transactions || data?.pendingTransactions || data?.queue || [];
  const balances = data?.balances || [];

  return (
    <div>
      <h2 style={{ color: '#e0e0e0', marginBottom: '1.5rem' }}>Multi-Sig Management</h2>

      {error && <div style={{ color: '#f87171', marginBottom: '1rem' }}>{error}</div>}

      <Card title="Load Safe">
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Safe address (0x...)"
            style={inputStyle}
          />
          <button onClick={loadSafe} disabled={loading} style={btnStyle}>
            {loading ? 'Loading...' : 'Load'}
          </button>
        </div>
      </Card>

      {loading && <LoadingSpinner />}

      {data && (
        <>
          {/* Info Card */}
          <Card title="Safe Info" style={{ marginTop: '1.5rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <div style={{ color: '#888', fontSize: '0.85rem' }}>Threshold</div>
                <div style={{ color: '#4ade80', fontSize: '1.3rem', fontWeight: 700 }}>{threshold} of {totalOwners}</div>
              </div>
              <div>
                <div style={{ color: '#888', fontSize: '0.85rem' }}>Nonce</div>
                <div style={{ color: '#e0e0e0', fontSize: '1.3rem', fontWeight: 700 }}>{nonce}</div>
              </div>
              {modules.length > 0 && (
                <div>
                  <div style={{ color: '#888', fontSize: '0.85rem' }}>Modules</div>
                  <div style={{ color: '#e0e0e0' }}>{modules.length} active</div>
                </div>
              )}
            </div>

            <div style={{ color: '#888', fontSize: '0.85rem', marginBottom: '0.5rem' }}>Owners</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {owners.map((o, i) => (
                <span key={i} style={{
                  background: '#12121f', border: '1px solid #2a2a3d', borderRadius: 6,
                  padding: '0.4rem 0.75rem', fontFamily: 'monospace', fontSize: '0.85rem',
                  color: '#e0e0e0',
                }}>
                  {truncate(typeof o === 'string' ? o : o.address || '')}
                </span>
              ))}
            </div>
          </Card>

          {/* Pending Transactions */}
          <Card title="Pending Transactions" style={{ marginTop: '1rem' }}>
            {pendingTxns.length > 0 ? (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      {['To', 'Value', 'Data', 'Confirmations'].map((h) => (
                        <th key={h} style={headStyle}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pendingTxns.map((tx, i) => {
                      const confs = tx.confirmations || tx.confirmationsCount || 0;
                      const needed = tx.confirmations_required || threshold;
                      return (
                        <tr key={i}>
                          <td style={{ ...cellStyle, color: '#e0e0e0', fontFamily: 'monospace', fontSize: '0.85rem' }}>{truncate(tx.to || '')}</td>
                          <td style={{ ...cellStyle, color: '#4ade80', fontWeight: 600 }}>
                            {tx.value ? `${Number(tx.value).toLocaleString()} ETH` : '0'}
                          </td>
                          <td style={{ ...cellStyle, color: '#888', fontFamily: 'monospace', fontSize: '0.8rem', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {tx.data ? (tx.data.length > 20 ? `${tx.data.slice(0, 20)}...` : tx.data) : '--'}
                          </td>
                          <td style={cellStyle}>
                            <span style={{
                              color: confs >= needed ? '#4ade80' : '#f59e0b',
                              fontWeight: 600,
                            }}>
                              {confs} / {needed}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p style={{ color: '#888', textAlign: 'center' }}>No pending transactions.</p>
            )}
          </Card>

          {/* Balances */}
          <Card title="Balances" style={{ marginTop: '1rem' }}>
            {balances.length > 0 ? (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      {['Token', 'Amount', 'USD Value'].map((h) => (
                        <th key={h} style={headStyle}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {balances.map((b, i) => (
                      <tr key={i}>
                        <td style={{ ...cellStyle, color: '#e0e0e0', fontWeight: 600 }}>{b.token || b.symbol || '--'}</td>
                        <td style={{ ...cellStyle, color: '#e0e0e0', fontFamily: 'monospace' }}>{Number(b.amount || b.balance || 0).toLocaleString()}</td>
                        <td style={{ ...cellStyle, color: '#4ade80', fontWeight: 600 }}>${Number(b.usd_value || b.value || 0).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p style={{ color: '#888', textAlign: 'center' }}>No balances found.</p>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
