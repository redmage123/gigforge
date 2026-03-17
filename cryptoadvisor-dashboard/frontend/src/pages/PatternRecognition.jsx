import { useState } from 'react';
import { api } from '../api/client';
import Card from '../components/Card';
import LoadingSpinner from '../components/LoadingSpinner';

const selectStyle = {
  padding: '0.6rem 1rem',
  background: '#12121f',
  border: '1px solid #2a2a3d',
  borderRadius: 8,
  color: '#e0e0e0',
  fontSize: '0.95rem',
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

const COINS = ['bitcoin', 'ethereum', 'solana', 'cardano', 'polkadot'];

const confidenceColors = {
  high: { bg: '#1e3a2e', color: '#4ade80' },
  medium: { bg: '#3b3b1e', color: '#f59e0b' },
  low: { bg: '#3a1e1e', color: '#f87171' },
};

export default function PatternRecognition() {
  const [coin, setCoin] = useState('bitcoin');
  const [patterns, setPatterns] = useState([]);
  const [loading, setLoading] = useState(false);
  const [scanAllLoading, setScanAllLoading] = useState(false);
  const [scanAllResults, setScanAllResults] = useState(null);
  const [error, setError] = useState('');

  const scanPatterns = async () => {
    setLoading(true);
    setError('');
    setPatterns([]);
    try {
      const res = await api.post('/api/ai-advanced/pattern-detect', { coin });
      setPatterns(Array.isArray(res) ? res : res.patterns || res.results || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const scanAllCoins = async () => {
    setScanAllLoading(true);
    setError('');
    setScanAllResults(null);
    try {
      const results = {};
      for (const c of COINS) {
        const res = await api.post('/api/ai-advanced/pattern-detect', { coin: c });
        results[c] = Array.isArray(res) ? res : res.patterns || res.results || [];
      }
      setScanAllResults(results);
    } catch (err) {
      setError(err.message);
    } finally {
      setScanAllLoading(false);
    }
  };

  const getConfidence = (level) => {
    const l = (level || 'medium').toLowerCase();
    return confidenceColors[l] || confidenceColors.medium;
  };

  return (
    <div>
      <h2 style={{ color: '#e0e0e0', marginBottom: '1.5rem' }}>AI Chart Pattern Detection</h2>

      {error && <div style={{ color: '#f87171', marginBottom: '1rem' }}>{error}</div>}

      <Card title="Scan for Patterns">
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label style={{ color: '#888', fontSize: '0.85rem', display: 'block', marginBottom: 4 }}>Coin</label>
            <select value={coin} onChange={(e) => setCoin(e.target.value)} style={selectStyle}>
              {COINS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <button onClick={scanPatterns} disabled={loading} style={btnStyle}>
            {loading ? 'Scanning...' : 'Scan for Patterns'}
          </button>
          <button onClick={scanAllCoins} disabled={scanAllLoading} style={btnSecondary}>
            {scanAllLoading ? 'Scanning All...' : 'Scan All Top Coins'}
          </button>
        </div>
      </Card>

      {(loading || scanAllLoading) && <LoadingSpinner />}

      {/* Single Coin Results */}
      {patterns.length > 0 && (
        <div style={{ marginTop: '1.5rem' }}>
          <h3 style={{ color: '#e0e0e0', marginBottom: '0.75rem' }}>Detected Patterns - {coin}</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {patterns.map((p, i) => {
              const conf = getConfidence(p.confidence);
              const isBullish = (p.implication || '').toLowerCase().includes('bullish');
              const isBearish = (p.implication || '').toLowerCase().includes('bearish');
              return (
                <Card key={i}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <span style={{ color: '#e0e0e0', fontWeight: 700, fontSize: '1rem' }}>
                        {p.name || p.pattern || 'Unknown Pattern'}
                      </span>
                      <span style={{
                        background: conf.bg, color: conf.color,
                        padding: '2px 8px', borderRadius: 4, fontSize: '0.8rem', fontWeight: 600,
                      }}>
                        {(p.confidence || 'Medium')}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      <span style={{
                        color: isBullish ? '#4ade80' : isBearish ? '#f87171' : '#f59e0b',
                        fontWeight: 700, fontSize: '1.1rem',
                      }}>
                        {isBullish ? '\u2191' : isBearish ? '\u2193' : '\u2194'} {p.implication || '--'}
                      </span>
                      {(p.target_price || p.targetPrice) && (
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ color: '#888', fontSize: '0.75rem' }}>Target</div>
                          <div style={{ color: '#e0e0e0', fontWeight: 600 }}>${Number(p.target_price || p.targetPrice).toLocaleString()}</div>
                        </div>
                      )}
                    </div>
                  </div>
                  {p.description && (
                    <div style={{ color: '#888', fontSize: '0.85rem', marginTop: '0.5rem' }}>{p.description}</div>
                  )}
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Scan All Results */}
      {scanAllResults && (
        <div style={{ marginTop: '1.5rem' }}>
          <h3 style={{ color: '#e0e0e0', marginBottom: '0.75rem' }}>All Coin Pattern Scan</h3>
          {Object.entries(scanAllResults).map(([coinName, coinPatterns]) => (
            <div key={coinName} style={{ marginBottom: '1rem' }}>
              <h4 style={{ color: '#646cff', marginBottom: '0.5rem', textTransform: 'capitalize' }}>{coinName}</h4>
              {coinPatterns.length > 0 ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  {coinPatterns.map((p, i) => {
                    const isBullish = (p.implication || '').toLowerCase().includes('bullish');
                    const isBearish = (p.implication || '').toLowerCase().includes('bearish');
                    return (
                      <div key={i} style={{
                        background: '#12121f', border: '1px solid #2a2a3d', borderRadius: 8,
                        padding: '0.5rem 0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
                      }}>
                        <span style={{ color: '#e0e0e0', fontWeight: 600, fontSize: '0.9rem' }}>{p.name || p.pattern}</span>
                        <span style={{ color: isBullish ? '#4ade80' : isBearish ? '#f87171' : '#f59e0b', fontWeight: 700 }}>
                          {isBullish ? '\u2191' : isBearish ? '\u2193' : '\u2194'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p style={{ color: '#888', fontSize: '0.85rem' }}>No patterns detected.</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
