import { useState, useEffect } from 'react';
import { api } from '../api/client';
import { usePortfolios } from '../hooks/usePortfolios';
import Card from '../components/Card';
import LoadingSpinner from '../components/LoadingSpinner';

const shareUrl = (token) => `${window.location.origin}/shared/${token}`;

export default function SharePortfolio() {
  const { label, selected } = usePortfolios();
  const [shares, setShares] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [generating, setGenerating] = useState(false);
  const [busyToken, setBusyToken] = useState(null);
  const [copied, setCopied] = useState(null);
  const [title, setTitle] = useState('');
  const [showValues, setShowValues] = useState(false);
  const [showReturns, setShowReturns] = useState(false);
  const [created, setCreated] = useState(null);

  const fetchShares = async () => {
    try {
      const res = await api.get('/api/share/');
      setShares(Array.isArray(res) ? res : []);
    } catch (err) {
      setError(`Could not load your share links: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchShares(); }, []);

  const ownPortfolio = !selected || selected.role === 'owner';

  const generateLink = async () => {
    setGenerating(true);
    setError('');
    setCreated(null);
    try {
      const res = await api.post('/api/share/', { title: title.trim(), show_values: showValues, show_returns: showReturns });
      setCreated(res.token);
      setTitle('');
      await fetchShares();
    } catch (err) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  };

  // Remove the row only once the server confirms the link is gone
  const revokeShare = async (token) => {
    if (!window.confirm('Revoke this link? Anyone who has it will no longer be able to open it.')) return;
    setBusyToken(token);
    setError('');
    try {
      await api.del(`/api/share/${encodeURIComponent(token)}`);
      setShares((prev) => prev.filter((s) => s.token !== token));
      if (created === token) setCreated(null);
    } catch (err) {
      setError(`Could not revoke the link: ${err.message}`);
    } finally {
      setBusyToken(null);
    }
  };

  const copyLink = (url) => {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(url);
      setTimeout(() => setCopied(null), 2000);
    }).catch(() => setError('Could not copy automatically. Select the link and copy it.'));
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      <h2 style={{ marginBottom: '1.5rem' }}>Share Portfolio</h2>

      <Card title="New Share Link">
        <p className="muted" style={{ marginTop: 0 }}>
          Creates a read-only snapshot of <strong>{label}</strong> (the portfolio selected in the top bar) as it is right now.
          The link does not update later; generate a new one to share fresh numbers.
        </p>
        {!ownPortfolio ? (
          <p className="negative">You can share only your own portfolios. Switch to one of yours in the top bar.</p>
        ) : (
          <>
            <div className="form-group" style={{ maxWidth: 420 }}>
              <label htmlFor="share-title">Title shown to viewers</label>
              <input id="share-title" className="form-input" maxLength={60} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Portfolio" />
            </div>
            <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap', margin: '0.5rem 0 1rem' }}>
              <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input type="checkbox" checked={showValues} onChange={(e) => setShowValues(e.target.checked)} />
                Show dollar values
              </label>
              <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input type="checkbox" checked={showReturns} onChange={(e) => setShowReturns(e.target.checked)} />
                Show returns
              </label>
            </div>
            <button className="btn" onClick={generateLink} disabled={generating}>
              {generating ? 'Generating...' : 'Generate Share Link'}
            </button>
          </>
        )}
        {created && (
          <div className="card" style={{ marginTop: '1rem' }}>
            <div className="muted" style={{ fontSize: '0.85rem', marginBottom: 4 }}>New link created:</div>
            <div style={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>{shareUrl(created)}</div>
            <button className="btn btn-sm" style={{ marginTop: 8 }} onClick={() => copyLink(shareUrl(created))}>
              {copied === shareUrl(created) ? 'Copied!' : 'Copy Link'}
            </button>
          </div>
        )}
      </Card>

      {error && <div className="login-error" style={{ marginTop: '1rem' }}>{error}</div>}

      <Card title="Active Shares" style={{ marginTop: '1.5rem' }}>
        {shares.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {shares.map((s) => {
              const url = shareUrl(s.token);
              const shows = ['Allocation', s.show_values && 'dollar values', s.show_returns && 'returns'].filter(Boolean).join(', ');
              return (
                <div key={s.token} className="card" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <strong>{s.title}</strong>
                    <div style={{ fontFamily: 'monospace', fontSize: '0.85rem', wordBreak: 'break-all' }}>{url}</div>
                    <div className="muted" style={{ fontSize: '0.8rem', marginTop: 4 }}>
                      {s.created_at ? `Created ${new Date(s.created_at).toLocaleString()}. ` : ''}
                      {s.holdings_count} holdings. Shows: {shows}.
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <a className="btn btn-sm btn-secondary" href={url} target="_blank" rel="noreferrer">Open</a>
                    <button className="btn btn-sm" onClick={() => copyLink(url)}>{copied === url ? 'Copied!' : 'Copy Link'}</button>
                    <button className="btn btn-sm btn-danger" onClick={() => revokeShare(s.token)} disabled={busyToken === s.token}>
                      {busyToken === s.token ? 'Revoking...' : 'Revoke'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="muted" style={{ textAlign: 'center' }}>No active share links. Generate one to share your portfolio.</p>
        )}
      </Card>

      <Card title="What Recipients See" style={{ marginTop: '1.5rem' }}>
        <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
          <li>Holdings by symbol and name with their share of the portfolio, and the asset class mix</li>
          <li>Dollar values and the total, only if you tick "Show dollar values"</li>
          <li>Unrealized returns, only if you tick "Show returns"</li>
        </ul>
        <p className="muted" style={{ fontSize: '0.85rem', marginBottom: 0 }}>
          Never shared: your name or email, portfolio names, quantities, cost basis, trades, wallet addresses or API keys.
        </p>
      </Card>
    </div>
  );
}
