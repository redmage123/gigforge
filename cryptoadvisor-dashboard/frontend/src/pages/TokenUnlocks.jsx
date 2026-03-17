import { useState, useEffect, useMemo } from 'react';
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
  width: '100%',
  maxWidth: 300,
};

const typeBadgeColors = {
  team: { bg: '#3b1764', color: '#a78bfa' },
  investor: { bg: '#1e3a5f', color: '#60a5fa' },
  ecosystem: { bg: '#1e3a2e', color: '#4ade80' },
};

export default function TokenUnlocks() {
  const [unlocks, setUnlocks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    api.get('/api/unlocks?days=90')
      .then((res) => setUnlocks(Array.isArray(res) ? res : res.unlocks || []))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return unlocks;
    const q = search.toLowerCase();
    return unlocks.filter((u) =>
      (u.token || u.name || '').toLowerCase().includes(q) ||
      (u.symbol || '').toLowerCase().includes(q)
    );
  }, [unlocks, search]);

  // Group by month
  const grouped = useMemo(() => {
    const groups = {};
    filtered.forEach((u) => {
      const date = new Date(u.date || u.unlock_date);
      const key = isNaN(date.getTime()) ? 'Unknown' : `${date.toLocaleString('default', { month: 'long' })} ${date.getFullYear()}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(u);
    });
    return groups;
  }, [filtered]);

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <h2 style={{ color: '#e0e0e0', margin: 0 }}>Token Unlock Calendar</h2>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search tokens..."
          style={inputStyle}
        />
      </div>

      {error && <div style={{ color: '#f87171', marginBottom: '1rem' }}>{error}</div>}

      {Object.keys(grouped).length === 0 && (
        <Card><p style={{ color: '#888', textAlign: 'center' }}>No upcoming token unlocks found.</p></Card>
      )}

      {Object.entries(grouped).map(([month, items]) => (
        <div key={month} style={{ marginBottom: '1.5rem' }}>
          <h3 style={{ color: '#7b61ff', marginBottom: '0.75rem', fontSize: '1.05rem' }}>{month}</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {items.map((u, i) => {
              const pctSupply = Number(u.pct_of_supply || u.percentOfSupply || 0);
              const highPressure = pctSupply > 5;
              const type = (u.type || u.category || 'ecosystem').toLowerCase();
              const badge = typeBadgeColors[type] || typeBadgeColors.ecosystem;
              const date = new Date(u.date || u.unlock_date);
              const dateStr = isNaN(date.getTime()) ? '--' : date.toLocaleDateString();

              return (
                <Card key={i}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <span style={{ color: '#e0e0e0', fontWeight: 700, fontSize: '1rem' }}>
                        {u.token || u.name || u.symbol || '--'}
                      </span>
                      <span style={{
                        background: badge.bg, color: badge.color,
                        padding: '2px 8px', borderRadius: 4, fontSize: '0.8rem', fontWeight: 600, textTransform: 'capitalize',
                      }}>
                        {type}
                      </span>
                      {highPressure && (
                        <span style={{
                          background: '#3a1e1e', color: '#f87171',
                          padding: '2px 8px', borderRadius: 4, fontSize: '0.75rem', fontWeight: 600,
                        }}>
                          High Sell Pressure
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ color: '#888', fontSize: '0.8rem' }}>Date</div>
                        <div style={{ color: '#e0e0e0', fontWeight: 600 }}>{dateStr}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ color: '#888', fontSize: '0.8rem' }}>Amount</div>
                        <div style={{ color: '#e0e0e0', fontWeight: 600 }}>{Number(u.amount || 0).toLocaleString()}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ color: '#888', fontSize: '0.8rem' }}>% Supply</div>
                        <div style={{ color: highPressure ? '#f87171' : '#4ade80', fontWeight: 700 }}>{pctSupply.toFixed(2)}%</div>
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
