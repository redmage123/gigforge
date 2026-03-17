import { useState, useEffect } from 'react';
import { api } from '../api/client';
import Card from '../components/Card';
import StatCard from '../components/StatCard';
import LoadingSpinner from '../components/LoadingSpinner';

export default function Mempool() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchMempool = async () => {
    try {
      const res = await api.get('/api/mempool');
      setData(res);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMempool();
    const id = setInterval(fetchMempool, 15000);
    return () => clearInterval(id);
  }, []);

  if (loading) return <LoadingSpinner />;

  const eth = data?.ethereum || data?.eth || {};
  const btc = data?.bitcoin || data?.btc || {};

  const feeCardStyle = (priority, color) => ({
    textAlign: 'center',
    padding: '1rem',
    background: '#12121f',
    borderRadius: 8,
    border: `1px solid ${color}33`,
  });

  return (
    <div>
      <h2 style={{ color: '#e0e0e0', marginBottom: '1.5rem' }}>Mempool Monitor</h2>

      {error && <div style={{ color: '#f87171', marginBottom: '1rem' }}>{error}</div>}

      {/* Ethereum Section */}
      <h3 style={{ color: '#627eea', marginBottom: '1rem', fontSize: '1.1rem' }}>Ethereum</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
        <StatCard value={Number(eth.pending_tx_count || eth.pendingTxCount || 0).toLocaleString()} label="Pending Transactions" />
        <StatCard value={`${Number(eth.avg_gas_price || eth.avgGasPrice || 0).toFixed(1)} Gwei`} label="Avg Gas Price" />
        <StatCard value={`${Number(eth.pending_value || eth.pendingValue || 0).toFixed(2)} ETH`} label="Pending Value" />
      </div>

      {/* Bitcoin Section */}
      <h3 style={{ color: '#f7931a', marginBottom: '1rem', fontSize: '1.1rem' }}>Bitcoin</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        <StatCard value={`${Number(btc.mempool_size || btc.mempoolSize || 0).toLocaleString()} vMB`} label="Mempool Size" />
        <StatCard value={Number(btc.pending_tx_count || btc.pendingTxCount || 0).toLocaleString()} label="Pending Transactions" />
      </div>

      {/* Bitcoin Fee Recommendations */}
      <Card title="Bitcoin Fee Recommendations">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
          <div style={feeCardStyle('low', '#4ade80')}>
            <div style={{ color: '#888', fontSize: '0.85rem', marginBottom: 4 }}>Low Priority</div>
            <div style={{ color: '#4ade80', fontSize: '1.5rem', fontWeight: 700 }}>
              {btc.fees?.low || btc.recommended_fees?.low || '--'}
            </div>
            <div style={{ color: '#888', fontSize: '0.8rem' }}>sat/vB</div>
            <div style={{ color: '#666', fontSize: '0.75rem', marginTop: 4 }}>~60 min</div>
          </div>
          <div style={feeCardStyle('medium', '#f59e0b')}>
            <div style={{ color: '#888', fontSize: '0.85rem', marginBottom: 4 }}>Medium Priority</div>
            <div style={{ color: '#f59e0b', fontSize: '1.5rem', fontWeight: 700 }}>
              {btc.fees?.medium || btc.recommended_fees?.medium || '--'}
            </div>
            <div style={{ color: '#888', fontSize: '0.8rem' }}>sat/vB</div>
            <div style={{ color: '#666', fontSize: '0.75rem', marginTop: 4 }}>~30 min</div>
          </div>
          <div style={feeCardStyle('high', '#f87171')}>
            <div style={{ color: '#888', fontSize: '0.85rem', marginBottom: 4 }}>High Priority</div>
            <div style={{ color: '#f87171', fontSize: '1.5rem', fontWeight: 700 }}>
              {btc.fees?.high || btc.recommended_fees?.high || '--'}
            </div>
            <div style={{ color: '#888', fontSize: '0.8rem' }}>sat/vB</div>
            <div style={{ color: '#666', fontSize: '0.75rem', marginTop: 4 }}>~10 min</div>
          </div>
        </div>
      </Card>
    </div>
  );
}
