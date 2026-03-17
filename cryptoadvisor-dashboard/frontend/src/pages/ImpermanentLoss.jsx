import { useState } from 'react'
import { api } from '../api/client'
import Card from '../components/Card'
import LoadingSpinner from '../components/LoadingSpinner'
import { Chart as ChartJS, BarElement, CategoryScale, LinearScale, Tooltip, Legend } from 'chart.js'
import { Bar } from 'react-chartjs-2'

ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip, Legend)

export default function ImpermanentLoss() {
  const [form, setForm] = useState({
    token_a_start: '',
    token_b_start: '',
    token_a_end: '',
    token_b_end: '',
    initial_value: '',
  })
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleChange = (field) => (e) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }))
  }

  const calculate = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setResult(null)
    try {
      const body = {
        token_a_start_price: parseFloat(form.token_a_start),
        token_b_start_price: parseFloat(form.token_b_start),
        token_a_end_price: parseFloat(form.token_a_end),
        token_b_end_price: parseFloat(form.token_b_end),
        initial_lp_value: parseFloat(form.initial_value),
      }
      const res = await api.post('/api/impermanent-loss/calculate', body)
      setResult(res)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const formatUsd = (val) => val != null ? `$${Number(val).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '--'

  const lpValue = result?.lp_value ?? result?.lp_value_now ?? null
  const holdValue = result?.hold_value ?? result?.hold_value_now ?? null
  const ilPercent = result?.impermanent_loss_percent ?? result?.il_percent ?? null
  const ilDollar = result?.impermanent_loss_usd ?? result?.il_usd ?? null

  const chartData = lpValue != null && holdValue != null ? {
    labels: ['LP Value', 'Hold Value'],
    datasets: [{
      label: 'Value ($)',
      data: [lpValue, holdValue],
      backgroundColor: ['#00d4aa', '#646cff'],
      borderRadius: 6,
      barThickness: 60,
    }],
  } : null

  const chartOpts = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) => `$${Number(ctx.raw).toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
        },
      },
    },
    scales: {
      x: { ticks: { color: '#aaa' }, grid: { display: false } },
      y: {
        ticks: { color: '#888', callback: (v) => `$${v.toLocaleString()}` },
        grid: { color: '#1a1a2e' },
      },
    },
  }

  const inputStyle = { maxWidth: 200 }

  return (
    <div>
      <h2 style={{ color: '#e0e0e0' }}>Impermanent Loss Calculator</h2>

      <Card title="Input Parameters" className="mt-1">
        <form onSubmit={calculate}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
            <div className="form-group">
              <label>Token A Start Price ($)</label>
              <input className="form-input" type="number" step="any" value={form.token_a_start} onChange={handleChange('token_a_start')} placeholder="e.g. 2000" required />
            </div>
            <div className="form-group">
              <label>Token B Start Price ($)</label>
              <input className="form-input" type="number" step="any" value={form.token_b_start} onChange={handleChange('token_b_start')} placeholder="e.g. 1" required />
            </div>
            <div className="form-group">
              <label>Token A End Price ($)</label>
              <input className="form-input" type="number" step="any" value={form.token_a_end} onChange={handleChange('token_a_end')} placeholder="e.g. 3000" required />
            </div>
            <div className="form-group">
              <label>Token B End Price ($)</label>
              <input className="form-input" type="number" step="any" value={form.token_b_end} onChange={handleChange('token_b_end')} placeholder="e.g. 1" required />
            </div>
            <div className="form-group">
              <label>Initial LP Value ($)</label>
              <input className="form-input" type="number" step="any" value={form.initial_value} onChange={handleChange('initial_value')} placeholder="e.g. 10000" required />
            </div>
          </div>
          <button type="submit" className="btn" style={{ marginTop: '1rem' }} disabled={loading}>
            {loading ? 'Calculating...' : 'Calculate'}
          </button>
        </form>
      </Card>

      {error && <div className="login-error" style={{ marginTop: '1rem' }}>{error}</div>}

      {loading && <LoadingSpinner />}

      {result && !loading && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginTop: '1rem' }}>
            <div className="card" style={{ padding: '1.25rem', borderLeft: '4px solid #00d4aa' }}>
              <div className="muted" style={{ marginBottom: '0.3rem' }}>LP Value Now</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#00d4aa' }}>{formatUsd(lpValue)}</div>
            </div>
            <div className="card" style={{ padding: '1.25rem', borderLeft: '4px solid #646cff' }}>
              <div className="muted" style={{ marginBottom: '0.3rem' }}>Hold Value Now</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#646cff' }}>{formatUsd(holdValue)}</div>
            </div>
            <div className="card" style={{ padding: '1.25rem', borderLeft: '4px solid #ff6b6b' }}>
              <div className="muted" style={{ marginBottom: '0.3rem' }}>Impermanent Loss %</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#ff6b6b' }}>
                {ilPercent != null ? `${Number(ilPercent).toFixed(2)}%` : '--'}
              </div>
            </div>
            <div className="card" style={{ padding: '1.25rem', borderLeft: '4px solid #ff6b6b' }}>
              <div className="muted" style={{ marginBottom: '0.3rem' }}>Impermanent Loss $</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#ff6b6b' }}>{formatUsd(ilDollar)}</div>
            </div>
          </div>

          {chartData && (
            <Card title="LP vs Hold Comparison" className="mt-1">
              <div style={{ height: 300 }}>
                <Bar data={chartData} options={chartOpts} />
              </div>
            </Card>
          )}
        </>
      )}

      <Card title="What is Impermanent Loss?" className="mt-1">
        <div style={{ color: '#94a3b8', lineHeight: 1.7 }}>
          <p>
            Impermanent loss (IL) occurs when you provide liquidity to an automated market maker (AMM) pool
            and the price ratio of the deposited tokens changes compared to when you deposited them.
          </p>
          <p>
            The larger the price divergence, the more impermanent loss you experience. It is called
            "impermanent" because if the prices return to their original ratio, the loss disappears.
          </p>
          <p>
            <strong style={{ color: '#e2e8f0' }}>Key points:</strong>
          </p>
          <ul style={{ paddingLeft: '1.5rem' }}>
            <li>IL is the difference between holding tokens in a pool vs. simply holding them in your wallet.</li>
            <li>Trading fees earned from the pool can offset impermanent loss.</li>
            <li>IL only becomes permanent ("realized") when you withdraw your liquidity.</li>
            <li>Stablecoin pairs experience minimal IL since their prices stay close to each other.</li>
          </ul>
        </div>
      </Card>
    </div>
  )
}
