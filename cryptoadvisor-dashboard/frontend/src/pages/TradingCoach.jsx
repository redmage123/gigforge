import { useState, useEffect } from 'react';
import { api } from '../api/client';
import Card from '../components/Card';
import AiInsightPanel from '../components/AiInsightPanel';
import LoadingSpinner from '../components/LoadingSpinner';

const selectStyle = {
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
  background: '#7b61ff',
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  cursor: 'pointer',
  fontWeight: 600,
};

const btnSecondary = {
  padding: '0.6rem 1.5rem',
  background: 'transparent',
  color: '#7b61ff',
  border: '1px solid #7b61ff',
  borderRadius: 8,
  cursor: 'pointer',
  fontWeight: 600,
};

export default function TradingCoach() {
  const [trades, setTrades] = useState([]);
  const [selectedTrade, setSelectedTrade] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [postMortem, setPostMortem] = useState(null);
  const [pmLoading, setPmLoading] = useState(false);

  const [behavioralAnalysis, setBehavioralAnalysis] = useState(null);
  const [baLoading, setBaLoading] = useState(false);

  useEffect(() => {
    api.get('/api/trades')
      .then((res) => {
        const arr = Array.isArray(res) ? res : res.trades || [];
        setTrades(arr);
        if (arr.length > 0) setSelectedTrade(arr[0].id || arr[0]._id || '0');
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const getPostMortem = async () => {
    if (!selectedTrade) return;
    setPmLoading(true);
    setError('');
    setPostMortem(null);
    try {
      const trade = trades.find((t) => (t.id || t._id || '') === selectedTrade) || trades[Number(selectedTrade)];
      const res = await api.post('/api/ai-advanced/trade-coach', { trade });
      setPostMortem(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setPmLoading(false);
    }
  };

  const getBehavioralAnalysis = async () => {
    setBaLoading(true);
    setError('');
    setBehavioralAnalysis(null);
    try {
      const res = await api.post('/api/ai-advanced/trading-insights', { trades });
      const text = typeof res === 'string' ? res : res.analysis || res.insights || res.result || res.content || JSON.stringify(res, null, 2);
      setBehavioralAnalysis(text);
    } catch (err) {
      setError(err.message);
    } finally {
      setBaLoading(false);
    }
  };

  const pm = postMortem || {};
  const pmText = typeof postMortem === 'string' ? postMortem : null;
  const sections = [
    { key: 'what_went_right', label: 'What Went Right', color: '#4ade80' },
    { key: 'what_went_wrong', label: 'What Went Wrong', color: '#f87171' },
    { key: 'timing', label: 'Timing Analysis', color: '#f59e0b' },
    { key: 'lesson', label: 'Key Lesson', color: '#646cff' },
  ];

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      <h2 style={{ color: '#e0e0e0', marginBottom: '1.5rem' }}>AI Trading Coach</h2>

      {error && <div style={{ color: '#f87171', marginBottom: '1rem' }}>{error}</div>}

      <Card title="Trade Post-Mortem">
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <label style={{ color: '#888', fontSize: '0.85rem', display: 'block', marginBottom: 4 }}>Select Trade</label>
            <select value={selectedTrade} onChange={(e) => setSelectedTrade(e.target.value)} style={selectStyle}>
              {trades.length === 0 && <option value="">No trades found</option>}
              {trades.map((t, i) => {
                const id = t.id || t._id || String(i);
                const label = `${t.side || t.type || 'Trade'} ${t.symbol || t.coin || ''} - ${t.date || t.timestamp || ''}`;
                return <option key={id} value={id}>{label}</option>;
              })}
            </select>
          </div>
          <button onClick={getPostMortem} disabled={pmLoading || !selectedTrade} style={btnStyle}>
            {pmLoading ? 'Analyzing...' : 'Get Post-Mortem'}
          </button>
          <button onClick={getBehavioralAnalysis} disabled={baLoading} style={btnSecondary}>
            {baLoading ? 'Analyzing...' : 'Full Behavioral Analysis'}
          </button>
        </div>
      </Card>

      {(pmLoading || baLoading) && <LoadingSpinner />}

      {/* Post-Mortem Display */}
      {postMortem && (
        <div style={{ marginTop: '1.5rem' }}>
          {pmText ? (
            <AiInsightPanel title="Trade Post-Mortem" content={pmText} loading={false} onClose={() => setPostMortem(null)} />
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
              {sections.map(({ key, label, color }) => {
                // Try camelCase and snake_case
                const camelKey = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
                const content = pm[key] || pm[camelKey] || null;
                if (!content) return null;
                return (
                  <Card key={key}>
                    <div style={{ color, fontWeight: 700, marginBottom: '0.5rem', fontSize: '0.95rem' }}>{label}</div>
                    <div style={{ color: '#e0e0e0', fontSize: '0.9rem', lineHeight: 1.6 }}>{content}</div>
                  </Card>
                );
              })}
              {/* Fallback: if none of the expected sections exist, render all keys */}
              {sections.every(({ key }) => !pm[key] && !pm[key.replace(/_([a-z])/g, (_, c) => c.toUpperCase())]) && (
                <AiInsightPanel
                  title="Trade Post-Mortem"
                  content={JSON.stringify(pm, null, 2)}
                  loading={false}
                  onClose={() => setPostMortem(null)}
                />
              )}
            </div>
          )}
        </div>
      )}

      {/* Behavioral Analysis */}
      {behavioralAnalysis && (
        <div style={{ marginTop: '1.5rem' }}>
          <AiInsightPanel
            title="Full Behavioral Analysis"
            content={behavioralAnalysis}
            loading={false}
            onClose={() => setBehavioralAnalysis(null)}
          />
        </div>
      )}
    </div>
  );
}
