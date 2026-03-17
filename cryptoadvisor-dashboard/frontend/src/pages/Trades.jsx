import { useState } from 'react';
import { useFetch } from '../hooks/useFetch';
import { api } from '../api/client';
import Card from '../components/Card';
import StatCard from '../components/StatCard';
import LoadingSpinner from '../components/LoadingSpinner';
import AiAnalysisButton from '../components/AiAnalysisButton';
import AiInsightPanel from '../components/AiInsightPanel';

export default function Trades() {
  const { data, loading, refetch } = useFetch('/api/trades');
  const [coin, setCoin] = useState('bitcoin');
  const [type, setType] = useState('buy');
  const [amount, setAmount] = useState('');
  const [price, setPrice] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [aiInsight, setAiInsight] = useState(null);
  const [aiInsightLoading, setAiInsightLoading] = useState(false);

  const trades = data ? (Array.isArray(data) ? data : data.trades || []) : [];
  const totalPnl = trades.reduce((sum, t) => sum + (t.pnl || t.profit_loss || 0), 0);
  const totalBuys = trades.filter((t) => t.type === 'buy').length;
  const totalSells = trades.filter((t) => t.type === 'sell').length;

  const addTrade = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.post('/api/trades', { coin, type, amount: parseFloat(amount), price: parseFloat(price), date });
      setAmount('');
      setPrice('');
      refetch();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = {
    padding: '0.6rem 1rem',
    background: '#12121f',
    border: '1px solid #2a2a3d',
    borderRadius: 8,
    color: '#e0e0e0',
    fontSize: '0.95rem',
    width: '100%',
    boxSizing: 'border-box',
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

  const cellStyle = { padding: '0.75rem', borderBottom: '1px solid #1a1a2e' };
  const headStyle = { ...cellStyle, color: '#888', textAlign: 'left', fontSize: '0.85rem', borderBottom: '1px solid #2a2a3d' };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <h2 style={{ color: '#e0e0e0', margin: 0 }}>Trade Journal</h2>
        <AiAnalysisButton
          endpoint="/api/ai/trades/analyze"
          body={{}}
          label="Analyze My Trades"
          onResult={(text) => setAiInsight(text)}
        />
        <AiAnalysisButton
          endpoint="/api/ai/trades/suggest"
          body={{}}
          label="Get Trade Suggestions"
          onResult={(text) => setAiInsight(text)}
        />
      </div>

      <AiInsightPanel
        title="Trade AI Insights"
        content={aiInsight}
        loading={aiInsightLoading}
        onRefresh={() => {
          setAiInsightLoading(true);
          api.post('/api/ai/trades/analyze', {})
            .then((res) => setAiInsight(typeof res === 'string' ? res : res.analysis || res.result || res.content || JSON.stringify(res, null, 2)))
            .catch(() => {})
            .finally(() => setAiInsightLoading(false));
        }}
        onClose={() => setAiInsight(null)}
      />

      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
        <StatCard label="Total P&L" value={`${totalPnl >= 0 ? '+' : ''}$${totalPnl.toLocaleString()}`} color={totalPnl >= 0 ? '#4ade80' : '#f87171'} />
        <StatCard label="Buy Trades" value={totalBuys} />
        <StatCard label="Sell Trades" value={totalSells} />
        <StatCard label="Total Trades" value={trades.length} />
      </div>

      <Card title="Add Trade" style={{ marginBottom: '1.5rem' }}>
        <form onSubmit={addTrade} style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label style={{ color: '#888', fontSize: '0.8rem', display: 'block', marginBottom: 4 }}>Coin</label>
            <select value={coin} onChange={(e) => setCoin(e.target.value)} style={inputStyle}>
              {['bitcoin', 'ethereum', 'solana', 'cardano', 'polkadot', 'dogecoin'].map((c) => (
                <option key={c} value={c}>{c.replace(/\b\w/g, (l) => l.toUpperCase())}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ color: '#888', fontSize: '0.8rem', display: 'block', marginBottom: 4 }}>Type</label>
            <select value={type} onChange={(e) => setType(e.target.value)} style={inputStyle}>
              <option value="buy">Buy</option>
              <option value="sell">Sell</option>
            </select>
          </div>
          <div>
            <label style={{ color: '#888', fontSize: '0.8rem', display: 'block', marginBottom: 4 }}>Amount</label>
            <input type="number" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.5" style={inputStyle} required />
          </div>
          <div>
            <label style={{ color: '#888', fontSize: '0.8rem', display: 'block', marginBottom: 4 }}>Price ($)</label>
            <input type="number" step="any" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="50000" style={inputStyle} required />
          </div>
          <div>
            <label style={{ color: '#888', fontSize: '0.8rem', display: 'block', marginBottom: 4 }}>Date</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inputStyle} required />
          </div>
          <button type="submit" disabled={saving} style={btnStyle}>{saving ? 'Adding...' : 'Add Trade'}</button>
        </form>
        {error && <p style={{ color: '#f87171', marginTop: '0.75rem' }}>{error}</p>}
      </Card>

      <Card title="Trade History">
        {loading ? <LoadingSpinner /> : trades.length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Date', 'Coin', 'Type', 'Amount', 'Price', 'Total', 'P&L'].map((h) => (
                    <th key={h} style={headStyle}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {trades.map((t, i) => (
                  <tr key={t.id || i}>
                    <td style={{ ...cellStyle, color: '#aaa' }}>{t.date || '--'}</td>
                    <td style={{ ...cellStyle, color: '#e0e0e0', fontWeight: 600 }}>{(t.coin || '').replace(/\b\w/g, (l) => l.toUpperCase())}</td>
                    <td style={cellStyle}>
                      <span style={{
                        color: '#fff', fontWeight: 600, fontSize: '0.8rem',
                        background: t.type === 'buy' ? '#166534' : '#7f1d1d',
                        padding: '2px 8px', borderRadius: 4,
                      }}>
                        {(t.type || '').toUpperCase()}
                      </span>
                    </td>
                    <td style={{ ...cellStyle, color: '#e0e0e0' }}>{t.amount}</td>
                    <td style={{ ...cellStyle, color: '#e0e0e0' }}>${Number(t.price || 0).toLocaleString()}</td>
                    <td style={{ ...cellStyle, color: '#fff' }}>${(t.amount * t.price).toLocaleString()}</td>
                    <td style={{ ...cellStyle, color: (t.pnl || t.profit_loss || 0) >= 0 ? '#4ade80' : '#f87171', fontWeight: 600 }}>
                      {t.pnl != null || t.profit_loss != null ? `${(t.pnl || t.profit_loss) >= 0 ? '+' : ''}$${Number(t.pnl || t.profit_loss).toLocaleString()}` : '--'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p style={{ color: '#888' }}>No trades recorded yet.</p>}
      </Card>
    </div>
  );
}
