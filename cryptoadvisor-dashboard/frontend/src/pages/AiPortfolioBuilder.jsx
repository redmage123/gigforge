import { useState } from 'react';
import { api } from '../api/client';
import Card from '../components/Card';
import AiInsightPanel from '../components/AiInsightPanel';
import LoadingSpinner from '../components/LoadingSpinner';

const inputStyle = {
  padding: '0.6rem 1rem',
  background: '#12121f',
  border: '1px solid #2a2a3d',
  borderRadius: 8,
  color: '#e0e0e0',
  fontSize: '0.95rem',
  width: '100%',
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

const EXAMPLES = [
  '60% large cap, 30% DeFi, 10% meme coins',
  'Conservative portfolio for retirement',
  'Maximum yield with moderate risk',
];

export default function AiPortfolioBuilder() {
  const [description, setDescription] = useState('');
  const [budget, setBudget] = useState('10000');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Optimize section
  const [optimizeGoal, setOptimizeGoal] = useState('');
  const [optimizeResult, setOptimizeResult] = useState(null);
  const [optimizeLoading, setOptimizeLoading] = useState(false);

  const buildPortfolio = async () => {
    if (!description.trim()) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const res = await api.post('/api/ai-advanced/portfolio-builder', {
        description: description.trim(),
        budget: Number(budget),
      });
      const text = typeof res === 'string' ? res : res.analysis || res.result || res.content || res.portfolio || JSON.stringify(res, null, 2);
      setResult(text);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const optimizePortfolio = async () => {
    setOptimizeLoading(true);
    setError('');
    setOptimizeResult(null);
    try {
      const res = await api.post('/api/ai-advanced/portfolio-optimize', {
        goal: optimizeGoal.trim() || 'maximize risk-adjusted returns',
        budget: Number(budget),
      });
      const text = typeof res === 'string' ? res : res.analysis || res.result || res.content || JSON.stringify(res, null, 2);
      setOptimizeResult(text);
    } catch (err) {
      setError(err.message);
    } finally {
      setOptimizeLoading(false);
    }
  };

  return (
    <div>
      <h2 style={{ color: '#e0e0e0', marginBottom: '1.5rem' }}>AI Portfolio Builder</h2>

      {error && <div style={{ color: '#f87171', marginBottom: '1rem' }}>{error}</div>}

      <Card title="Describe Your Ideal Portfolio">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe your ideal portfolio..."
          rows={4}
          style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
        />

        <div style={{ marginTop: '0.75rem', marginBottom: '0.75rem' }}>
          <div style={{ color: '#888', fontSize: '0.85rem', marginBottom: '0.5rem' }}>Examples:</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                onClick={() => setDescription(ex)}
                style={{
                  background: '#12121f', border: '1px solid #2a2a3d', borderRadius: 6,
                  color: '#888', padding: '0.3rem 0.6rem', cursor: 'pointer',
                  fontSize: '0.8rem',
                }}
              >
                {ex}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div>
            <label style={{ color: '#888', fontSize: '0.85rem', display: 'block', marginBottom: 4 }}>Budget ($)</label>
            <input
              type="number"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              style={{ ...inputStyle, width: 150 }}
            />
          </div>
          <button onClick={buildPortfolio} disabled={loading} style={btnStyle}>
            {loading ? 'Building...' : 'Build Portfolio'}
          </button>
        </div>
      </Card>

      {loading && <LoadingSpinner />}

      {result && (
        <div style={{ marginTop: '1.5rem' }}>
          <AiInsightPanel
            title="AI Portfolio Recommendation"
            content={result}
            loading={false}
          />
        </div>
      )}

      {/* Optimize Section */}
      <Card title="Optimize My Current Portfolio" style={{ marginTop: '1.5rem' }}>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <label style={{ color: '#888', fontSize: '0.85rem', display: 'block', marginBottom: 4 }}>Optimization Goal</label>
            <input
              value={optimizeGoal}
              onChange={(e) => setOptimizeGoal(e.target.value)}
              placeholder="e.g., maximize yield, reduce risk, increase diversification..."
              style={inputStyle}
            />
          </div>
          <button onClick={optimizePortfolio} disabled={optimizeLoading} style={btnSecondary}>
            {optimizeLoading ? 'Optimizing...' : 'Optimize My Current'}
          </button>
        </div>
      </Card>

      {optimizeLoading && <LoadingSpinner />}

      {optimizeResult && (
        <div style={{ marginTop: '1rem' }}>
          <AiInsightPanel
            title="Portfolio Optimization"
            content={optimizeResult}
            loading={false}
          />
        </div>
      )}
    </div>
  );
}
