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
  background: '#646cff',
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  cursor: 'pointer',
  fontWeight: 600,
};

const CHAINS = ['ethereum', 'bsc', 'polygon', 'arbitrum', 'avalanche', 'solana'];

const verdictConfig = {
  safe: { bg: '#1e3a2e', color: '#4ade80', border: '#4ade80', label: 'SAFE' },
  caution: { bg: '#3b3b1e', color: '#f59e0b', border: '#f59e0b', label: 'CAUTION' },
  dangerous: { bg: '#3a1e1e', color: '#f87171', border: '#f87171', label: 'DANGEROUS' },
  'likely scam': { bg: '#2d0a0a', color: '#dc2626', border: '#dc2626', label: 'LIKELY SCAM' },
};

const severityColors = {
  low: '#4ade80',
  medium: '#f59e0b',
  high: '#f87171',
  critical: '#dc2626',
};

export default function RugPullDetector() {
  const [tokenAddress, setTokenAddress] = useState('');
  const [chain, setChain] = useState('ethereum');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const analyze = async () => {
    if (!tokenAddress.trim()) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const res = await api.get(`/api/rugpull?token_address=${tokenAddress.trim()}&chain=${chain}`);
      setResult(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const verdict = (result?.verdict || result?.overall || '').toLowerCase();
  const vc = verdictConfig[verdict] || verdictConfig.caution;
  const riskScore = result?.risk_score ?? result?.riskScore ?? 0;
  const checks = result?.checks || result?.details || [];

  return (
    <div>
      <h2 style={{ color: '#e0e0e0', marginBottom: '1.5rem' }}>Rug Pull / Honeypot Detector</h2>

      {error && <div style={{ color: '#f87171', marginBottom: '1rem' }}>{error}</div>}

      <Card title="Analyze Token">
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <input
            value={tokenAddress}
            onChange={(e) => setTokenAddress(e.target.value)}
            placeholder="Token contract address..."
            style={inputStyle}
          />
          <select value={chain} onChange={(e) => setChain(e.target.value)} style={selectStyle}>
            {CHAINS.map((c) => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
          </select>
          <button onClick={analyze} disabled={loading} style={btnStyle}>
            {loading ? 'Analyzing...' : 'Analyze'}
          </button>
        </div>
      </Card>

      {loading && <LoadingSpinner />}

      {result && (
        <div style={{ marginTop: '1.5rem' }}>
          {/* Verdict */}
          <Card>
            <div style={{
              textAlign: 'center', padding: '1.5rem',
              border: `2px solid ${vc.border}`, borderRadius: 12,
              background: vc.bg,
            }}>
              <div style={{ color: vc.color, fontSize: '2rem', fontWeight: 800, letterSpacing: 2, marginBottom: '0.5rem' }}>
                {vc.label}
              </div>
              <div style={{ color: '#888', fontSize: '0.9rem' }}>Overall Verdict</div>
            </div>
          </Card>

          {/* Risk Score Gauge */}
          <Card title="Risk Score" style={{ marginTop: '1rem' }}>
            <div style={{ textAlign: 'center', padding: '1rem 0' }}>
              <div style={{ position: 'relative', width: 100, height: 100, margin: '0 auto' }}>
                <svg width="100" height="100" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="42" fill="none" stroke="#1a1a2e" strokeWidth="7" />
                  <circle
                    cx="50" cy="50" r="42" fill="none"
                    stroke={vc.color} strokeWidth="7"
                    strokeDasharray={`${(riskScore / 100) * 263.9} 263.9`}
                    strokeLinecap="round"
                    transform="rotate(-90 50 50)"
                  />
                </svg>
                <div style={{
                  position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                  color: vc.color, fontSize: '1.5rem', fontWeight: 700,
                }}>
                  {riskScore}
                </div>
              </div>
              <div style={{ color: '#888', fontSize: '0.85rem', marginTop: 4 }}>out of 100</div>
            </div>
          </Card>

          {/* Individual Checks */}
          {checks.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem', marginTop: '1rem' }}>
              {checks.map((check, i) => {
                const passed = check.passed || check.status === 'passed' || check.result === 'passed';
                const severity = (check.severity || 'medium').toLowerCase();
                const sevColor = severityColors[severity] || '#f59e0b';

                return (
                  <Card key={i}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                      <span style={{
                        width: 28, height: 28, borderRadius: '50%', display: 'flex',
                        alignItems: 'center', justifyContent: 'center',
                        background: passed ? '#1e3a2e' : '#3a1e1e',
                        color: passed ? '#4ade80' : '#f87171',
                        fontWeight: 700, fontSize: '0.9rem',
                      }}>
                        {passed ? '\u2713' : '\u2717'}
                      </span>
                      <span style={{ color: '#e0e0e0', fontWeight: 600, flex: 1 }}>{check.name || check.check || '--'}</span>
                      <span style={{
                        background: `${sevColor}22`, color: sevColor,
                        padding: '2px 6px', borderRadius: 4, fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase',
                      }}>
                        {severity}
                      </span>
                    </div>
                    {check.details && (
                      <div style={{ color: '#888', fontSize: '0.85rem', paddingLeft: '2.5rem' }}>{check.details}</div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
