import { useState } from 'react';
import { api } from '../api/client';
import Card from '../components/Card';
import LoadingSpinner from '../components/LoadingSpinner';
import AiAnalysisButton from '../components/AiAnalysisButton';
import AiInsightPanel from '../components/AiInsightPanel';

export default function DeFi() {
  const [address, setAddress] = useState('');
  const [positions, setPositions] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [aiInsight, setAiInsight] = useState(null);
  const [aiInsightLoading, setAiInsightLoading] = useState(false);

  const fetchPositions = async (e) => {
    e.preventDefault();
    if (!address.trim()) return;
    setLoading(true);
    setError('');
    try {
      const res = await api.get(`/api/defi/positions?address=${address.trim()}`);
      setPositions(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = {
    flex: 1,
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

  const protocolColors = {
    lido: '#00a3ff', aave: '#b6509e', compound: '#00d395', uniswap: '#ff007a',
  };

  const posArr = positions ? (Array.isArray(positions) ? positions : positions.positions || []) : [];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
        <h2 style={{ color: '#e0e0e0', margin: 0 }}>DeFi Positions</h2>
        <AiAnalysisButton
          endpoint="/api/ai/copilot/defi"
          body={{ address, positions: positions ? (Array.isArray(positions) ? positions : positions.positions || []) : [] }}
          label="AI Analysis"
          onResult={(text) => setAiInsight(text)}
        />
      </div>

      <AiInsightPanel
        title="DeFi AI Insights"
        content={aiInsight}
        loading={aiInsightLoading}
        onRefresh={() => {
          setAiInsightLoading(true);
          api.post('/api/ai/copilot/defi', { address, positions: positions ? (Array.isArray(positions) ? positions : positions.positions || []) : [] })
            .then((res) => setAiInsight(typeof res === 'string' ? res : res.analysis || res.result || res.content || JSON.stringify(res, null, 2)))
            .catch(() => {})
            .finally(() => setAiInsightLoading(false));
        }}
        onClose={() => setAiInsight(null)}
      />

      <Card title="Lookup Wallet" style={{ marginBottom: '1.5rem' }}>
        <form onSubmit={fetchPositions} style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Enter wallet address (0x...)"
            style={inputStyle}
            required
          />
          <button type="submit" disabled={loading} style={btnStyle}>{loading ? 'Scanning...' : 'Scan Positions'}</button>
        </form>
        {error && <p style={{ color: '#f87171', marginTop: '0.75rem' }}>{error}</p>}
      </Card>

      {loading && <LoadingSpinner text="Scanning DeFi positions..." />}

      {posArr.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
          {posArr.map((p, i) => {
            const protocol = (p.protocol || p.platform || '').toLowerCase();
            const color = protocolColors[protocol] || '#646cff';
            return (
              <Card key={i} style={{ borderLeft: `4px solid ${color}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                  <span style={{ color, fontWeight: 700, fontSize: '1.1rem' }}>
                    {p.protocol || p.platform || 'Unknown'}
                  </span>
                  <span style={{
                    color: '#fff', fontSize: '0.8rem', fontWeight: 600,
                    background: '#2a2a3d', padding: '2px 8px', borderRadius: 4,
                  }}>
                    {p.type || p.position_type || 'Position'}
                  </span>
                </div>
                {(p.token || p.asset) && (
                  <div style={{ color: '#e0e0e0', fontWeight: 600, marginBottom: 4 }}>{p.token || p.asset}</div>
                )}
                {p.amount != null && (
                  <div style={{ color: '#aaa', marginBottom: 4 }}>Amount: <span style={{ color: '#fff' }}>{p.amount}</span></div>
                )}
                {(p.value || p.usd_value) != null && (
                  <div style={{ color: '#aaa' }}>Value: <span style={{ color: '#fff', fontWeight: 600 }}>${Number(p.value || p.usd_value).toLocaleString()}</span></div>
                )}
                {p.apy != null && (
                  <div style={{ color: '#4ade80', marginTop: 4 }}>APY: {p.apy}%</div>
                )}
                {p.health_factor != null && (
                  <div style={{ color: p.health_factor < 1.5 ? '#f87171' : '#4ade80', marginTop: 4 }}>
                    Health Factor: {p.health_factor}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {positions && posArr.length === 0 && (
        <Card><p style={{ color: '#888', textAlign: 'center' }}>No DeFi positions found for this address.</p></Card>
      )}
    </div>
  );
}
