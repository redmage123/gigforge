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

const CHAINS = ['ethereum', 'bsc', 'polygon', 'arbitrum', 'optimism', 'avalanche', 'solana'];

function HealthGauge({ score }) {
  const pct = Math.min(Math.max(score, 0), 100);
  const color = pct >= 70 ? '#4ade80' : pct >= 40 ? '#f59e0b' : '#f87171';
  const label = pct >= 70 ? 'Healthy' : pct >= 40 ? 'Caution' : 'At Risk';

  return (
    <div style={{ textAlign: 'center', padding: '1rem 0' }}>
      <div style={{ position: 'relative', width: 120, height: 120, margin: '0 auto' }}>
        <svg width="120" height="120" viewBox="0 0 120 120">
          <circle cx="60" cy="60" r="50" fill="none" stroke="#1a1a2e" strokeWidth="8" />
          <circle
            cx="60" cy="60" r="50" fill="none"
            stroke={color} strokeWidth="8"
            strokeDasharray={`${(pct / 100) * 314.16} 314.16`}
            strokeLinecap="round"
            transform="rotate(-90 60 60)"
          />
        </svg>
        <div style={{
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          textAlign: 'center',
        }}>
          <div style={{ color, fontSize: '1.8rem', fontWeight: 700 }}>{Math.round(score)}</div>
          <div style={{ color: '#888', fontSize: '0.75rem' }}>{label}</div>
        </div>
      </div>
    </div>
  );
}

function CheckCard({ check }) {
  const score = Number(check.score || 0);
  const color = score >= 70 ? '#4ade80' : score >= 40 ? '#f59e0b' : '#f87171';
  const icon = score >= 70 ? '\u2713' : score >= 40 ? '\u26A0' : '\u2717';
  const pct = Math.min(score, 100);

  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
        <span style={{
          width: 28, height: 28, borderRadius: '50%', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          background: `${color}22`, color, fontWeight: 700, fontSize: '0.9rem',
        }}>
          {icon}
        </span>
        <span style={{ color: '#e0e0e0', fontWeight: 600, flex: 1 }}>{check.name || check.check || '--'}</span>
        <span style={{ color, fontWeight: 700 }}>{score}/100</span>
      </div>
      <div style={{ height: 6, borderRadius: 3, background: '#1a1a2e', overflow: 'hidden', marginBottom: '0.5rem' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3 }} />
      </div>
      {check.details && (
        <div style={{ color: '#888', fontSize: '0.85rem' }}>{check.details}</div>
      )}
    </Card>
  );
}

export default function WalletHealth() {
  const [address, setAddress] = useState('');
  const [chain, setChain] = useState('ethereum');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const scan = async () => {
    if (!address.trim()) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const res = await api.get(`/api/wallet-health?address=${address.trim()}&chain=${chain}`);
      setResult(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const overallScore = result?.overall_score ?? result?.score ?? result?.health_score ?? 0;
  const checks = result?.checks || result?.details || [];

  return (
    <div>
      <h2 style={{ color: '#e0e0e0', marginBottom: '1.5rem' }}>Wallet Health Scanner</h2>

      {error && <div style={{ color: '#f87171', marginBottom: '1rem' }}>{error}</div>}

      <Card title="Scan Wallet">
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Wallet address..."
            style={inputStyle}
          />
          <select value={chain} onChange={(e) => setChain(e.target.value)} style={selectStyle}>
            {CHAINS.map((c) => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
          </select>
          <button onClick={scan} disabled={loading} style={btnStyle}>
            {loading ? 'Scanning...' : 'Scan'}
          </button>
        </div>
      </Card>

      {loading && <LoadingSpinner />}

      {result && (
        <div style={{ marginTop: '1.5rem' }}>
          <Card title="Overall Health Score">
            <HealthGauge score={overallScore} />
          </Card>

          {checks.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem', marginTop: '1rem' }}>
              {checks.map((check, i) => <CheckCard key={i} check={check} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
