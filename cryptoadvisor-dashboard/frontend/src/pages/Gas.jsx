import { useState } from 'react';
import { useFetch } from '../hooks/useFetch';
import Card from '../components/Card';
import StatCard from '../components/StatCard';
import LoadingSpinner from '../components/LoadingSpinner';
import { Chart as ChartJS, LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Legend, Filler } from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Legend, Filler);

export default function Gas() {
  const [chain, setChain] = useState('ethereum');
  const { data: current, loading: cl } = useFetch('/api/gas/current', 30000);
  const { data: recommendation, loading: rl } = useFetch(`/api/gas/recommendation?chain=${chain}`);

  const gas = current || {};
  const rec = recommendation || {};

  const selectStyle = {
    padding: '0.6rem 1rem',
    background: '#12121f',
    border: '1px solid #2a2a3d',
    borderRadius: 8,
    color: '#e0e0e0',
    fontSize: '1rem',
  };

  const historyData = (rec.history || rec.chart_data) ? {
    labels: (rec.history || rec.chart_data).map((p) => p.time || p.label || ''),
    datasets: [{
      label: 'Gas Price (Gwei)',
      data: (rec.history || rec.chart_data).map((p) => p.price || p.value || p.gas),
      borderColor: '#646cff',
      backgroundColor: '#646cff22',
      fill: true,
      tension: 0.3,
      pointRadius: 2,
    }],
  } : null;

  const chartOpts = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { labels: { color: '#aaa' } } },
    scales: {
      x: { ticks: { color: '#888', maxTicksLimit: 12 }, grid: { color: '#1a1a2e' } },
      y: { ticks: { color: '#888' }, grid: { color: '#1a1a2e' } },
    },
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
        <h2 style={{ color: '#e0e0e0', margin: 0 }}>Gas Tracker</h2>
        <select value={chain} onChange={(e) => setChain(e.target.value)} style={selectStyle}>
          {['ethereum', 'polygon', 'bsc', 'arbitrum', 'optimism'].map((c) => (
            <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
          ))}
        </select>
      </div>

      {cl ? <LoadingSpinner text="Loading gas prices..." /> : (
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
          <StatCard label="Low" value={gas.low != null ? `${gas.low} Gwei` : '--'} color="#4ade80" />
          <StatCard label="Average" value={gas.average != null ? `${gas.average} Gwei` : gas.standard ? `${gas.standard} Gwei` : '--'} color="#facc15" />
          <StatCard label="High" value={gas.high != null ? `${gas.high} Gwei` : gas.fast ? `${gas.fast} Gwei` : '--'} color="#f87171" />
          <StatCard label="Base Fee" value={gas.base_fee != null ? `${gas.base_fee} Gwei` : '--'} />
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '1rem' }}>
        <Card title="Best Time to Transact">
          {rl ? <LoadingSpinner /> : (
            <div>
              {rec.best_time || rec.recommendation ? (
                <div style={{ padding: '1rem', background: '#12121f', borderRadius: 8, borderLeft: '4px solid #4ade80' }}>
                  <div style={{ color: '#4ade80', fontWeight: 700, fontSize: '1.1rem', marginBottom: 8 }}>
                    {rec.best_time || 'Recommendation'}
                  </div>
                  <div style={{ color: '#e0e0e0' }}>
                    {rec.recommendation || rec.description || rec.message || `Gas prices are typically lowest at ${rec.best_time}`}
                  </div>
                  {rec.estimated_savings && (
                    <div style={{ color: '#888', marginTop: 8, fontSize: '0.9rem' }}>
                      Estimated savings: {rec.estimated_savings}
                    </div>
                  )}
                </div>
              ) : <p style={{ color: '#888' }}>No recommendation available.</p>}
            </div>
          )}
        </Card>

        {historyData && (
          <Card title="Gas Price History">
            <div style={{ height: 250 }}>
              <Line data={historyData} options={chartOpts} />
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
