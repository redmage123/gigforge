import { useState, useEffect } from 'react';
import { api } from '../api/client';
import Card from '../components/Card';
import LoadingSpinner from '../components/LoadingSpinner';

export default function NFTs() {
  const [wallets, setWallets] = useState([]);
  const [selectedAddr, setSelectedAddr] = useState('');
  const [customAddr, setCustomAddr] = useState('');
  const [nfts, setNfts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/api/wallet/saved').then((res) => {
      const list = Array.isArray(res) ? res : res.wallets || [];
      setWallets(list);
      if (list.length > 0) setSelectedAddr(list[0].address);
    }).catch(() => {});
  }, []);

  const fetchNfts = async (addr) => {
    if (!addr) return;
    setLoading(true);
    setError('');
    try {
      const res = await api.get(`/api/nfts?address=${addr}`);
      setNfts(Array.isArray(res) ? res : res.nfts || res.items || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedAddr) fetchNfts(selectedAddr);
  }, [selectedAddr]);

  const handleCustomLookup = (e) => {
    e.preventDefault();
    if (customAddr.trim()) fetchNfts(customAddr.trim());
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

  return (
    <div>
      <h2 style={{ color: '#e0e0e0', marginBottom: '1.5rem' }}>NFT Gallery</h2>

      <Card style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          {wallets.length > 0 && (
            <div>
              <label style={{ color: '#888', fontSize: '0.8rem', display: 'block', marginBottom: 4 }}>Saved Wallet</label>
              <select value={selectedAddr} onChange={(e) => setSelectedAddr(e.target.value)} style={selectStyle}>
                {wallets.map((w) => (
                  <option key={w.address} value={w.address}>{w.label || w.address.slice(0, 12) + '...'}</option>
                ))}
              </select>
            </div>
          )}
          <form onSubmit={handleCustomLookup} style={{ display: 'flex', gap: '0.75rem', flex: 1, minWidth: 250 }}>
            <input
              value={customAddr}
              onChange={(e) => setCustomAddr(e.target.value)}
              placeholder="Or enter address..."
              style={{ ...selectStyle, flex: 1 }}
            />
            <button type="submit" style={btnStyle}>Lookup</button>
          </form>
        </div>
      </Card>

      {error && <div style={{ color: '#f87171', marginBottom: '1rem' }}>{error}</div>}
      {loading && <LoadingSpinner text="Loading NFTs..." />}

      {!loading && nfts.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '1rem' }}>
          {nfts.map((nft, i) => (
            <Card key={nft.token_id || i} style={{ padding: 0, overflow: 'hidden' }}>
              {(nft.image || nft.image_url || (nft.metadata && nft.metadata.image)) ? (
                <img
                  src={nft.image || nft.image_url || nft.metadata.image}
                  alt={nft.name || `NFT #${nft.token_id || i}`}
                  style={{ width: '100%', height: 240, objectFit: 'cover', display: 'block' }}
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
              ) : (
                <div style={{ width: '100%', height: 240, background: '#12121f', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555' }}>
                  No Image
                </div>
              )}
              <div style={{ padding: '1rem' }}>
                <div style={{ color: '#e0e0e0', fontWeight: 600, marginBottom: 4 }}>
                  {nft.name || nft.title || `#${nft.token_id || i}`}
                </div>
                <div style={{ color: '#888', fontSize: '0.85rem' }}>
                  {nft.collection || nft.contract_name || nft.symbol || ''}
                </div>
                {nft.floor_price != null && (
                  <div style={{ color: '#646cff', fontSize: '0.85rem', marginTop: 4 }}>
                    Floor: {nft.floor_price} ETH
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {!loading && nfts.length === 0 && selectedAddr && !error && (
        <Card><p style={{ color: '#888', textAlign: 'center' }}>No NFTs found for this address.</p></Card>
      )}
    </div>
  );
}
