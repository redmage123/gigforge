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
    api.get('/api/trades/')
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
      const res = await api.post('/api/ai-advanced/trade-coach', { trade_id: selectedTrade });
      setPostMortem(res.analysis || 'No analysis returned.');
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
      const res = await api.post('/api/ai-advanced/trading-insights', {});
      setBehavioralAnalysis(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setBaLoading(false);
    }
  };

  const ba = behavioralAnalysis;
  const fmt = (v, suffix = '') => (v == null ? '--' : `${v}${suffix}`);
  const money = (v) => (v == null ? '--' : `${v < 0 ? '-' : ''}$${Math.abs(v).toLocaleString(undefined, { maximumFractionDigits: 2 })}`);
  const statTiles = ba ? [
    { label: 'Total Trades', value: fmt(ba.total_trades) },
    { label: 'Closed Trades', value: fmt(ba.closed_trades) },
    { label: 'Win Rate', value: fmt(ba.win_rate, '%') },
    { label: 'Avg Hold Time', value: ba.avg_hold_days == null ? '--' : `${ba.avg_hold_days} days` },
    { label: 'Realized P&L', value: money(ba.realized_pnl) },
    { label: 'Avg Win', value: money(ba.avg_win) },
    { label: 'Avg Loss', value: money(ba.avg_loss) },
    { label: 'Trades per Week', value: fmt(ba.trades_per_week) },
  ] : [];

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
                const label = `${t.date || ''}: ${(t.side || 'trade').toUpperCase()} ${t.quantity ?? ''} ${t.symbol || t.instrument_id || ''} @ ${t.price ?? ''}`;
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
          <AiInsightPanel title="Trade Post-Mortem" content={postMortem} loading={false} onClose={() => setPostMortem(null)} />
        </div>
      )}

      {/* Behavioral Analysis */}
      {ba && (
        <div style={{ marginTop: '1.5rem' }}>
          {ba.total_trades === 0 ? (
            <Card title="Full Behavioral Analysis">
              <p style={{ color: '#888', margin: 0 }}>No trades in this portfolio yet. Log trades in the Trade Journal to get an analysis.</p>
            </Card>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
                {statTiles.map(({ label, value }) => (
                  <Card key={label}>
                    <div style={{ color: '#888', fontSize: '0.8rem', marginBottom: 4 }}>{label}</div>
                    <div style={{ color: '#e0e0e0', fontWeight: 700, fontSize: '1.2rem' }}>{value}</div>
                  </Card>
                ))}
              </div>
              {ba.closed_trades === 0 && (
                <p style={{ color: '#888', fontSize: '0.85rem' }}>Win rate and hold time need at least one closed (sold or covered) position.</p>
              )}
              {ba.ai_error && <div style={{ color: '#f87171', marginBottom: '1rem' }}>{ba.ai_error}</div>}
              {ba.analysis && (
                <AiInsightPanel
                  title="Full Behavioral Analysis"
                  content={ba.analysis}
                  loading={false}
                  onClose={() => setBehavioralAnalysis(null)}
                />
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
