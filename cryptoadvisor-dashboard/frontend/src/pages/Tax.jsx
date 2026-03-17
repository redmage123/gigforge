import { useState } from 'react';
import { api } from '../api/client';
import Card from '../components/Card';
import StatCard from '../components/StatCard';
import LoadingSpinner from '../components/LoadingSpinner';

export default function Tax() {
  const [method, setMethod] = useState('fifo');
  const [year, setYear] = useState(new Date().getFullYear());
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchReport = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await api.get(`/api/tax/report?method=${method}&year=${year}`);
      setReport(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const downloadCsv = () => {
    if (!report) return;
    const gains = Array.isArray(report) ? report : report.gains || report.transactions || [];
    const headers = ['Date', 'Coin', 'Amount', 'Proceeds', 'Cost Basis', 'Gain/Loss'];
    const rows = gains.map((g) => [
      g.date || '', g.coin || g.symbol || '', g.amount || '', g.proceeds || '', g.cost_basis || g.costBasis || '', g.gain || g.gain_loss || '',
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tax_report_${year}_${method}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const inputStyle = {
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

  const gains = report ? (Array.isArray(report) ? report : report.gains || report.transactions || []) : [];
  const totalGain = gains.reduce((sum, g) => sum + (g.gain || g.gain_loss || 0), 0);

  const cellStyle = { padding: '0.75rem', borderBottom: '1px solid #1a1a2e' };
  const headStyle = { ...cellStyle, color: '#888', textAlign: 'left', fontSize: '0.85rem', borderBottom: '1px solid #2a2a3d' };

  return (
    <div>
      <h2 style={{ color: '#e0e0e0', marginBottom: '1.5rem' }}>Tax Reporting</h2>

      <Card title="Generate Report" style={{ marginBottom: '1.5rem' }}>
        <form onSubmit={fetchReport} style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label style={{ color: '#888', fontSize: '0.8rem', display: 'block', marginBottom: 4 }}>Method</label>
            <select value={method} onChange={(e) => setMethod(e.target.value)} style={inputStyle}>
              <option value="fifo">FIFO</option>
              <option value="lifo">LIFO</option>
            </select>
          </div>
          <div>
            <label style={{ color: '#888', fontSize: '0.8rem', display: 'block', marginBottom: 4 }}>Tax Year</label>
            <select value={year} onChange={(e) => setYear(Number(e.target.value))} style={inputStyle}>
              {[2024, 2023, 2022, 2021].map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <button type="submit" disabled={loading} style={btnStyle}>{loading ? 'Generating...' : 'Generate Report'}</button>
          {report && <button type="button" onClick={downloadCsv} style={{ ...btnStyle, background: '#166534' }}>Download CSV</button>}
        </form>
        {error && <p style={{ color: '#f87171', marginTop: '0.75rem' }}>{error}</p>}
      </Card>

      {loading && <LoadingSpinner text="Generating tax report..." />}

      {report && (
        <>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
            <StatCard label="Total Realized Gains" value={`${totalGain >= 0 ? '+' : ''}$${totalGain.toLocaleString()}`} color={totalGain >= 0 ? '#4ade80' : '#f87171'} />
            <StatCard label="Transactions" value={gains.length} />
            <StatCard label="Method" value={method.toUpperCase()} />
            <StatCard label="Tax Year" value={year} />
          </div>

          <Card title="Realized Gains">
            {gains.length > 0 ? (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      {['Date', 'Coin', 'Amount', 'Proceeds', 'Cost Basis', 'Gain/Loss'].map((h) => (
                        <th key={h} style={headStyle}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {gains.map((g, i) => (
                      <tr key={i}>
                        <td style={{ ...cellStyle, color: '#aaa' }}>{g.date || '--'}</td>
                        <td style={{ ...cellStyle, color: '#e0e0e0', fontWeight: 600 }}>{g.coin || g.symbol}</td>
                        <td style={{ ...cellStyle, color: '#e0e0e0' }}>{g.amount}</td>
                        <td style={{ ...cellStyle, color: '#e0e0e0' }}>${Number(g.proceeds || 0).toLocaleString()}</td>
                        <td style={{ ...cellStyle, color: '#aaa' }}>${Number(g.cost_basis || g.costBasis || 0).toLocaleString()}</td>
                        <td style={{ ...cellStyle, color: (g.gain || g.gain_loss || 0) >= 0 ? '#4ade80' : '#f87171', fontWeight: 600 }}>
                          {(g.gain || g.gain_loss || 0) >= 0 ? '+' : ''}${Number(g.gain || g.gain_loss || 0).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p style={{ color: '#888' }}>No realized gains for this period.</p>}
          </Card>
        </>
      )}
    </div>
  );
}
