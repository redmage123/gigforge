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
  maxWidth: 300,
};

const selectStyle = {
  padding: '0.6rem 1rem',
  background: '#12121f',
  border: '1px solid #2a2a3d',
  borderRadius: 8,
  color: '#e0e0e0',
  fontSize: '0.95rem',
};

const chainColors = {
  ethereum: '#627eea',
  bsc: '#f3ba2f',
  polygon: '#8247e5',
  arbitrum: '#2d374b',
  avalanche: '#e84142',
  solana: '#14f195',
  optimism: '#ff0420',
};

function YieldCard({ item }) {
  const chain = (item.chain || '').toLowerCase();
  const chainColor = chainColors[chain] || '#646cff';

  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%', background: '#2a2a3d',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#888', fontSize: '0.75rem', fontWeight: 700,
          }}>
            {(item.protocol || 'P')[0].toUpperCase()}
          </div>
          <div>
            <div style={{ color: '#e0e0e0', fontWeight: 700 }}>{item.protocol || '--'}</div>
            <div style={{ color: '#888', fontSize: '0.8rem' }}>{item.token || item.symbol || '--'}</div>
          </div>
        </div>
        <span style={{
          background: `${chainColor}22`, color: chainColor,
          padding: '2px 8px', borderRadius: 4, fontSize: '0.75rem', fontWeight: 600,
        }}>
          {item.chain || '--'}
        </span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: '0.75rem' }}>
        <div>
          <div style={{ color: '#888', fontSize: '0.8rem' }}>APY</div>
          <div style={{ color: '#4ade80', fontSize: '1.4rem', fontWeight: 700 }}>
            {Number(item.apy || 0).toFixed(2)}%
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ color: '#888', fontSize: '0.8rem' }}>TVL</div>
          <div style={{ color: '#e0e0e0', fontWeight: 600 }}>
            ${Number(item.tvl || 0).toLocaleString()}
          </div>
        </div>
      </div>
    </Card>
  );
}

export default function Yields() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('apy');

  useEffect(() => {
    api.get('/api/yields/summary')
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const sortAndFilter = (items) => {
    if (!Array.isArray(items)) return [];
    let filtered = items;
    if (search.trim()) {
      const q = search.toLowerCase();
      filtered = items.filter((i) =>
        (i.protocol || '').toLowerCase().includes(q) ||
        (i.token || i.symbol || '').toLowerCase().includes(q)
      );
    }
    return [...filtered].sort((a, b) => {
      if (sortBy === 'apy') return Number(b.apy || 0) - Number(a.apy || 0);
      return Number(b.tvl || 0) - Number(a.tvl || 0);
    });
  };

  const stablecoins = useMemo(() => sortAndFilter(data?.stablecoins || data?.stablecoin || []), [data, search, sortBy]);
  const blueChip = useMemo(() => sortAndFilter(data?.blue_chip || data?.blueChip || []), [data, search, sortBy]);
  const highRisk = useMemo(() => sortAndFilter(data?.high_risk || data?.highRisk || []), [data, search, sortBy]);

  if (loading) return <LoadingSpinner />;

  const renderSection = (title, items, titleColor) => (
    <div style={{ marginBottom: '2rem' }}>
      <h3 style={{ color: titleColor, marginBottom: '0.75rem', fontSize: '1.05rem' }}>{title}</h3>
      {items.length > 0 ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
          {items.map((item, i) => <YieldCard key={i} item={item} />)}
        </div>
      ) : (
        <p style={{ color: '#888' }}>No yields found in this category.</p>
      )}
    </div>
  );

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <h2 style={{ color: '#e0e0e0', margin: 0 }}>DeFi Yield Aggregator</h2>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search protocols or tokens..."
          style={inputStyle}
        />
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} style={selectStyle}>
          <option value="apy">Sort by APY</option>
          <option value="tvl">Sort by TVL</option>
        </select>
      </div>

      {error && <div style={{ color: '#f87171', marginBottom: '1rem' }}>{error}</div>}

      {renderSection('Stablecoins', stablecoins, '#4ade80')}
      {renderSection('Blue-chip', blueChip, '#60a5fa')}
      {renderSection('High-risk', highRisk, '#f87171')}
    </div>
  );
}
