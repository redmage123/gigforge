import { useState } from 'react';
import { api, getPortfolioScope } from '../api/client';
import Card from '../components/Card';
import StatCard from '../components/StatCard';
import LoadingSpinner from '../components/LoadingSpinner';

// Current year first, back to 2015
const THIS_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: THIS_YEAR - 2014 }, (_, i) => THIS_YEAR - i);

const money = (v) => `${v < 0 ? '-' : ''}$${Math.abs(Number(v || 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function Tax() {
  const [method, setMethod] = useState('fifo');
  const [year, setYear] = useState(THIS_YEAR);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchReport = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await api.get(`/api/tax/report?method=${method}&year=${year}`);
      setReport({ ...res, portfolio: getPortfolioScope() });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const downloadCsv = () => {
    if (!report) return;
    const headers = ['Sell Date', 'Buy Date', 'Instrument', 'Quantity', 'Proceeds', 'Cost Basis', 'Gain/Loss', 'Method'];
    const rows = (report.events || []).map((g) => [
      g.sell_date, g.buy_date, g.coin_id, g.quantity, g.proceeds, g.cost_basis, g.gain_loss, g.method,
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

  const gains = report?.events || [];
  const summary = report?.summary || {};
  const net = Number(summary.net || 0);

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
              {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
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
            <StatCard label="Net Realized Gain/Loss" value={`${net >= 0 ? '+' : ''}${money(net)}`} color={net >= 0 ? '#4ade80' : '#f87171'} />
            <StatCard label="Gains" value={money(summary.total_gains)} color="#4ade80" />
            <StatCard label="Losses" value={money(-(summary.total_losses || 0))} color="#f87171" />
            <StatCard label="Lots Sold" value={gains.length} />
            <StatCard label="Method" value={String(report.method || method).toUpperCase()} />
            <StatCard label="Tax Year" value={report.year || year} />
          </div>

          <p style={{ color: '#888', fontSize: '0.85rem', marginBottom: '1rem' }}>
            Portfolio: {report.portfolio === 'all' ? 'all your portfolios' : 'the portfolio selected in the top bar'}.
            Cost basis uses every earlier buy, including buys from previous years; only sales in {report.year || year} are listed.
          </p>
          {summary.unmatched_quantity > 0 && (
            <p style={{ color: '#f59e0b', fontSize: '0.85rem', marginBottom: '1rem' }}>
              Some sales ({summary.unmatched_quantity} units) have no earlier buy on record, so their cost basis is unknown and they are left out. Add the missing buys on the Trades page.
            </p>
          )}

          <Card title="Realized Gains">
            {gains.length > 0 ? (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      {['Sell Date', 'Buy Date', 'Instrument', 'Quantity', 'Proceeds', 'Cost Basis', 'Gain/Loss'].map((h) => (
                        <th key={h} style={headStyle}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {gains.map((g, i) => (
                      <tr key={i}>
                        <td style={{ ...cellStyle, color: '#aaa' }}>{g.sell_date || '--'}</td>
                        <td style={{ ...cellStyle, color: '#aaa' }}>{g.buy_date || '--'}</td>
                        <td style={{ ...cellStyle, color: '#e0e0e0', fontWeight: 600 }}>{g.symbol || g.coin_id}</td>
                        <td style={{ ...cellStyle, color: '#e0e0e0' }}>{Number(g.quantity).toLocaleString(undefined, { maximumFractionDigits: 8 })}</td>
                        <td style={{ ...cellStyle, color: '#e0e0e0' }}>{money(g.proceeds)}</td>
                        <td style={{ ...cellStyle, color: '#aaa' }}>{money(g.cost_basis)}</td>
                        <td style={{ ...cellStyle, color: g.gain_loss >= 0 ? '#4ade80' : '#f87171', fontWeight: 600 }}>
                          {g.gain_loss >= 0 ? '+' : ''}{money(g.gain_loss)}
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
