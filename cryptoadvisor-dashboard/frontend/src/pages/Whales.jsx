import { useState, useEffect } from 'react';
import { api } from '../api/client';
import Card from '../components/Card';
import LoadingSpinner from '../components/LoadingSpinner';
import AiAnalysisButton from '../components/AiAnalysisButton';
import AiInsightPanel from '../components/AiInsightPanel';

export default function Whales() {
  const [chain, setChain] = useState('ethereum');
  const [minValue, setMinValue] = useState('100');
  const [txns, setTxns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [aiInsight, setAiInsight] = useState(null);
  const [aiInsightLoading, setAiInsightLoading] = useState(false);

  const fetchWhales = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get(`/api/whales?chain=${chain}&min_value=${minValue}`);
      setTxns(Array.isArray(res) ? res : res.transactions || res.whales || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchWhales(); }, [chain, minValue]);

  const selectStyle = {
    padding: '0.6rem 1rem',
    background: '#12121f',
    border: '1px solid #2a2a3d',
    borderRadius: 8,
    color: '#e0e0e0',
    fontSize: '0.95rem',
  };

  const cellStyle = { padding: '0.75rem', borderBottom: '1px solid #1a1a2e' };
  const headStyle = { ...cellStyle, color: '#888', textAlign: 'left', fontSize: '0.85rem', borderBottom: '1px solid #2a2a3d' };

  const truncate = (s) => s ? `${s.slice(0, 8)}...${s.slice(-6)}` : '--';

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <h2 style={{ color: '#e0e0e0', margin: 0 }}>Whale Tracker</h2>
        <select value={chain} onChange={(e) => setChain(e.target.value)} style={selectStyle}>
          {['ethereum', 'bitcoin', 'solana', 'polygon', 'bsc'].map((c) => (
            <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
          ))}
        </select>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <label style={{ color: '#888', fontSize: '0.85rem' }}>Min Value ($K):</label>
          <input
            type="number"
            value={minValue}
            onChange={(e) => setMinValue(e.target.value)}
            style={{ ...selectStyle, width: 100 }}
          />
        </div>
        <AiAnalysisButton
          endpoint="/api/ai/copilot/whale"
          body={{ chain, min_value: minValue, transactions: txns }}
          label="AI Analysis"
          onResult={(text) => setAiInsight(text)}
        />
      </div>

      <AiInsightPanel
        title="Whale Activity AI Insights"
        content={aiInsight}
        loading={aiInsightLoading}
        onRefresh={() => {
          setAiInsightLoading(true);
          api.post('/api/ai/copilot/whale', { chain, min_value: minValue, transactions: txns })
            .then((res) => setAiInsight(typeof res === 'string' ? res : res.analysis || res.result || res.content || JSON.stringify(res, null, 2)))
            .catch(() => {})
            .finally(() => setAiInsightLoading(false));
        }}
        onClose={() => setAiInsight(null)}
      />

      {error && <div style={{ color: '#f87171', marginBottom: '1rem' }}>{error}</div>}

      <Card title="Large Transactions">
        {loading ? <LoadingSpinner text="Tracking whales..." /> : txns.length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Time', 'From', 'To', 'Token', 'Amount', 'Value (USD)', 'TX Hash'].map((h) => (
                    <th key={h} style={headStyle}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {txns.map((tx, i) => (
                  <tr key={tx.hash || i}>
                    <td style={{ ...cellStyle, color: '#aaa' }}>{tx.timestamp || tx.time || '--'}</td>
                    <td style={{ ...cellStyle, color: '#e0e0e0', fontFamily: 'monospace', fontSize: '0.85rem' }}>{truncate(tx.from || tx.from_address)}</td>
                    <td style={{ ...cellStyle, color: '#e0e0e0', fontFamily: 'monospace', fontSize: '0.85rem' }}>{truncate(tx.to || tx.to_address)}</td>
                    <td style={{ ...cellStyle, color: '#e0e0e0' }}>{tx.token || tx.symbol || tx.coin || '--'}</td>
                    <td style={{ ...cellStyle, color: '#e0e0e0' }}>{Number(tx.amount || 0).toLocaleString()}</td>
                    <td style={{ ...cellStyle, color: '#4ade80', fontWeight: 600 }}>${Number(tx.usd_value || tx.value_usd || 0).toLocaleString()}</td>
                    <td style={{ ...cellStyle, color: '#646cff', fontFamily: 'monospace', fontSize: '0.85rem' }}>
                      {tx.hash ? truncate(tx.hash) : '--'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p style={{ color: '#888' }}>No whale transactions found.</p>}
      </Card>
    </div>
  );
}
