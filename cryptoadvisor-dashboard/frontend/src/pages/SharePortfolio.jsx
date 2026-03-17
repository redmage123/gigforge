import { useState, useEffect } from 'react';
import { api } from '../api/client';
import Card from '../components/Card';
import LoadingSpinner from '../components/LoadingSpinner';

const btnStyle = {
  padding: '0.6rem 1.5rem',
  background: '#646cff',
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  cursor: 'pointer',
  fontWeight: 600,
};

const deleteBtnStyle = {
  padding: '0.3rem 0.6rem',
  background: '#3a1e1e',
  color: '#f87171',
  border: '1px solid #f8717133',
  borderRadius: 6,
  cursor: 'pointer',
  fontWeight: 600,
  fontSize: '0.8rem',
};

const copyBtnStyle = {
  padding: '0.3rem 0.6rem',
  background: '#1e3a2e',
  color: '#4ade80',
  border: '1px solid #4ade8033',
  borderRadius: 6,
  cursor: 'pointer',
  fontWeight: 600,
  fontSize: '0.8rem',
};

export default function SharePortfolio() {
  const [shares, setShares] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(null);

  const fetchShares = async () => {
    try {
      const res = await api.get('/api/share');
      setShares(Array.isArray(res) ? res : res.shares || []);
      setError('');
    } catch (err) {
      // endpoint might not exist yet
      setShares([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchShares(); }, []);

  const generateLink = async () => {
    setGenerating(true);
    setError('');
    try {
      const res = await api.post('/api/share', {});
      await fetchShares();
      if (res.url || res.link) {
        // highlight the new share
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  };

  const revokeShare = async (id) => {
    try {
      await api.del(`/api/share/${id}`);
      setShares((prev) => prev.filter((s) => (s.id || s._id) !== id));
    } catch (err) {
      setError(err.message);
    }
  };

  const copyLink = (url) => {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(url);
      setTimeout(() => setCopied(null), 2000);
    }).catch(() => {});
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <h2 style={{ color: '#e0e0e0', margin: 0 }}>Share Portfolio</h2>
        <button onClick={generateLink} disabled={generating} style={btnStyle}>
          {generating ? 'Generating...' : 'Generate Share Link'}
        </button>
      </div>

      {error && <div style={{ color: '#f87171', marginBottom: '1rem' }}>{error}</div>}

      {/* Active Shares */}
      <Card title="Active Shares">
        {shares.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {shares.map((s, i) => {
              const id = s.id || s._id || i;
              const url = s.url || s.link || `${window.location.origin}/shared/${s.token || s.slug || id}`;
              const created = s.created_at || s.createdAt || s.date;

              return (
                <div key={id} style={{
                  display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem',
                  background: '#12121f', borderRadius: 8, border: '1px solid #1a1a2e', flexWrap: 'wrap',
                }}>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ color: '#646cff', fontFamily: 'monospace', fontSize: '0.85rem', wordBreak: 'break-all' }}>
                      {url}
                    </div>
                    {created && (
                      <div style={{ color: '#888', fontSize: '0.8rem', marginTop: 4 }}>
                        Created: {new Date(created).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button onClick={() => copyLink(url)} style={copyBtnStyle}>
                      {copied === url ? 'Copied!' : 'Copy Link'}
                    </button>
                    <button onClick={() => revokeShare(id)} style={deleteBtnStyle}>Revoke</button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p style={{ color: '#888', textAlign: 'center' }}>No active share links. Generate one to share your portfolio.</p>
        )}
      </Card>

      {/* Preview */}
      <Card title="Shared View Preview" style={{ marginTop: '1.5rem' }}>
        <div style={{
          padding: '2rem', textAlign: 'center',
          background: '#0a0a14', borderRadius: 8, border: '1px dashed #2a2a3d',
        }}>
          <div style={{ color: '#888', fontSize: '0.95rem', marginBottom: '0.5rem' }}>
            Recipients will see a read-only view of your portfolio including:
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '1.5rem', flexWrap: 'wrap', marginTop: '1rem' }}>
            {['Holdings', 'Allocation Chart', 'Total Value', 'Performance'].map((item) => (
              <div key={item} style={{
                background: '#12121f', border: '1px solid #2a2a3d', borderRadius: 8,
                padding: '0.75rem 1rem', color: '#e0e0e0', fontSize: '0.9rem', fontWeight: 600,
              }}>
                {item}
              </div>
            ))}
          </div>
          <div style={{ color: '#666', fontSize: '0.8rem', marginTop: '1rem', fontStyle: 'italic' }}>
            No personal data, wallet addresses, or exchange API keys are shared.
          </div>
        </div>
      </Card>
    </div>
  );
}
