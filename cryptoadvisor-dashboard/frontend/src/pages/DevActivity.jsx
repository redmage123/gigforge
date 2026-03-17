import { useState } from 'react';
import { api } from '../api/client';
import Card from '../components/Card';
import LoadingSpinner from '../components/LoadingSpinner';

const PRESET_COINS = ['bitcoin', 'ethereum', 'solana', 'cardano', 'polkadot', 'avalanche-2', 'chainlink', 'cosmos', 'near', 'polygon'];

const btnStyle = {
  padding: '0.6rem 1.5rem',
  background: '#646cff',
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  cursor: 'pointer',
  fontWeight: 600,
};

function ScoreGauge({ score, max = 100, label }) {
  const pct = Math.min((score / max) * 100, 100);
  const color = pct > 70 ? '#4ade80' : pct > 40 ? '#f59e0b' : '#f87171';

  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ color: '#888', fontSize: '0.8rem', marginBottom: 4 }}>{label}</div>
      <div style={{ position: 'relative', width: 80, height: 80, margin: '0 auto' }}>
        <svg width="80" height="80" viewBox="0 0 80 80">
          <circle cx="40" cy="40" r="34" fill="none" stroke="#1a1a2e" strokeWidth="6" />
          <circle
            cx="40" cy="40" r="34" fill="none"
            stroke={color} strokeWidth="6"
            strokeDasharray={`${(pct / 100) * 213.6} 213.6`}
            strokeLinecap="round"
            transform="rotate(-90 40 40)"
          />
        </svg>
        <div style={{
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          color, fontSize: '1.1rem', fontWeight: 700,
        }}>
          {Math.round(score)}
        </div>
      </div>
    </div>
  );
}

export default function DevActivity() {
  const [selected, setSelected] = useState({});
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const toggleCoin = (c) => {
    setSelected((prev) => ({ ...prev, [c]: !prev[c] }));
  };

  const compare = async () => {
    const coins = Object.keys(selected).filter((c) => selected[c]);
    if (coins.length === 0) { setError('Select at least one coin'); return; }
    setLoading(true);
    setError('');
    try {
      const res = await api.get(`/api/dev-activity/compare?coins=${coins.join(',')}`);
      setResults(Array.isArray(res) ? res : res.results || res.coins || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Bar chart data
  const maxScore = results.reduce((m, r) => Math.max(m, Number(r.activity_score || r.score || 0)), 1);

  return (
    <div>
      <h2 style={{ color: '#e0e0e0', marginBottom: '1.5rem' }}>Developer Activity Scores</h2>

      {error && <div style={{ color: '#f87171', marginBottom: '1rem' }}>{error}</div>}

      <Card title="Select Coins to Compare">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
          {PRESET_COINS.map((c) => (
            <label key={c} style={{
              display: 'flex', alignItems: 'center', gap: '0.4rem',
              padding: '0.4rem 0.8rem', borderRadius: 6,
              background: selected[c] ? '#646cff22' : '#12121f',
              border: `1px solid ${selected[c] ? '#646cff' : '#2a2a3d'}`,
              color: selected[c] ? '#646cff' : '#888',
              cursor: 'pointer', fontSize: '0.9rem', fontWeight: 600,
            }}>
              <input type="checkbox" checked={!!selected[c]} onChange={() => toggleCoin(c)} style={{ display: 'none' }} />
              {c}
            </label>
          ))}
        </div>
        <button onClick={compare} disabled={loading} style={btnStyle}>
          {loading ? 'Comparing...' : 'Compare'}
        </button>
      </Card>

      {loading && <LoadingSpinner />}

      {/* Score Cards */}
      {results.length > 0 && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '1rem', marginTop: '1.5rem' }}>
            {results.map((r, i) => (
              <Card key={i}>
                <div style={{ color: '#e0e0e0', fontWeight: 700, fontSize: '1rem', marginBottom: '0.75rem', textAlign: 'center' }}>
                  {r.coin || r.name || '--'}
                </div>
                <ScoreGauge score={Number(r.activity_score || r.score || 0)} label="Activity Score" />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginTop: '0.75rem' }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ color: '#888', fontSize: '0.75rem' }}>Commits 30d</div>
                    <div style={{ color: '#e0e0e0', fontWeight: 600 }}>{r.commits_30d || r.commits || '--'}</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ color: '#888', fontSize: '0.75rem' }}>Contributors</div>
                    <div style={{ color: '#e0e0e0', fontWeight: 600 }}>{r.contributors || '--'}</div>
                  </div>
                </div>
                {(r.last_commit || r.lastCommit) && (
                  <div style={{ color: '#888', fontSize: '0.8rem', textAlign: 'center', marginTop: '0.5rem' }}>
                    Last commit: {r.last_commit || r.lastCommit}
                  </div>
                )}
              </Card>
            ))}
          </div>

          {/* Bar Chart */}
          <Card title="Score Comparison" style={{ marginTop: '1.5rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {results.map((r, i) => {
                const score = Number(r.activity_score || r.score || 0);
                const pct = (score / maxScore) * 100;
                const color = score > 70 ? '#4ade80' : score > 40 ? '#f59e0b' : '#f87171';
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span style={{ color: '#e0e0e0', fontWeight: 600, minWidth: 120, fontSize: '0.9rem' }}>{r.coin || r.name}</span>
                    <div style={{ flex: 1, height: 20, borderRadius: 4, background: '#1a1a2e', overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 4, transition: 'width 0.5s' }} />
                    </div>
                    <span style={{ color, fontWeight: 700, minWidth: 40, textAlign: 'right' }}>{Math.round(score)}</span>
                  </div>
                );
              })}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
