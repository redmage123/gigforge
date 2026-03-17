import { useState, useEffect } from 'react';
import { api } from '../api/client';
import Card from '../components/Card';
import LoadingSpinner from '../components/LoadingSpinner';

const stateBadgeColors = {
  active: { bg: '#1e3a2e', color: '#4ade80' },
  closed: { bg: '#3a1e1e', color: '#f87171' },
  pending: { bg: '#3b3b1e', color: '#f59e0b' },
  core: { bg: '#1e2a3a', color: '#60a5fa' },
};

export default function Governance() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/api/governance')
      .then((res) => setData(Array.isArray(res) ? res : res.spaces || res.proposals || []))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;

  // Handle both flat proposal list and grouped-by-space format
  const isGrouped = data.length > 0 && data[0].proposals;

  return (
    <div>
      <h2 style={{ color: '#e0e0e0', marginBottom: '1.5rem' }}>Token Governance</h2>

      {error && <div style={{ color: '#f87171', marginBottom: '1rem' }}>{error}</div>}

      {data.length === 0 && (
        <Card><p style={{ color: '#888', textAlign: 'center' }}>No governance proposals found.</p></Card>
      )}

      {isGrouped ? (
        // Grouped by space/token
        data.map((space, si) => (
          <Card key={si} title={space.name || space.space || space.token || 'Unknown Space'} style={{ marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {(space.proposals || []).map((p, pi) => (
                <ProposalItem key={pi} proposal={p} />
              ))}
            </div>
          </Card>
        ))
      ) : (
        // Flat list
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: '1rem' }}>
          {data.map((p, i) => (
            <Card key={i}>
              <ProposalItem proposal={p} showSpace />
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function ProposalItem({ proposal: p, showSpace }) {
  const state = (p.state || p.status || 'pending').toLowerCase();
  const badge = stateBadgeColors[state] || stateBadgeColors.pending;
  const choices = p.choices || p.options || [];
  const scores = p.scores || p.votes || [];
  const totalScore = scores.reduce((s, v) => s + Number(v || 0), 0) || 1;

  return (
    <div style={{ padding: '0.75rem', background: '#12121f', borderRadius: 8, border: '1px solid #1a1a2e' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '0.5rem' }}>
        <div style={{ flex: 1 }}>
          {showSpace && p.space && (
            <div style={{ color: '#646cff', fontSize: '0.8rem', fontWeight: 600, marginBottom: 4 }}>{p.space}</div>
          )}
          <div style={{ color: '#e0e0e0', fontWeight: 600, fontSize: '0.95rem' }}>{p.title || p.name || 'Untitled'}</div>
        </div>
        <span style={{
          background: badge.bg, color: badge.color,
          padding: '2px 8px', borderRadius: 4, fontSize: '0.8rem', fontWeight: 600,
          textTransform: 'capitalize', flexShrink: 0,
        }}>
          {state}
        </span>
      </div>

      {(p.end || p.vote_end || p.endDate) && (
        <div style={{ color: '#888', fontSize: '0.8rem', marginBottom: '0.5rem' }}>
          Vote ends: {new Date(p.end || p.vote_end || p.endDate).toLocaleDateString()}
        </div>
      )}

      {/* Vote bars */}
      {choices.length > 0 && (
        <div style={{ marginTop: '0.5rem' }}>
          {choices.map((choice, ci) => {
            const score = Number(scores[ci] || 0);
            const pct = ((score / totalScore) * 100).toFixed(1);
            return (
              <div key={ci} style={{ marginBottom: '0.4rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#aaa', fontSize: '0.8rem', marginBottom: 2 }}>
                  <span>{choice}</span>
                  <span>{pct}%</span>
                </div>
                <div style={{ height: 8, borderRadius: 4, background: '#1a1a2e', overflow: 'hidden' }}>
                  <div style={{
                    width: `${pct}%`, height: '100%', borderRadius: 4,
                    background: ci === 0 ? '#4ade80' : ci === 1 ? '#f87171' : '#f59e0b',
                    transition: 'width 0.3s',
                  }} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {(p.link || p.url || p.snapshot_url) && (
        <a
          href={p.link || p.url || p.snapshot_url}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: '#646cff', fontSize: '0.85rem', marginTop: '0.5rem', display: 'inline-block' }}
        >
          Vote on Snapshot
        </a>
      )}
    </div>
  );
}
