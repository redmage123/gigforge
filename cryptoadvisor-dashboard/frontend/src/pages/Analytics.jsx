import { useFetch } from '../hooks/useFetch'
import Card from '../components/Card'
import LoadingSpinner from '../components/LoadingSpinner'

function ImageCard({ title, data, loading }) {
  if (loading) return <Card title={title}><LoadingSpinner /></Card>
  if (!data) return null
  const src = typeof data === 'string'
    ? (data.startsWith('data:') ? data : `data:image/png;base64,${data}`)
    : data.image
      ? (data.image.startsWith('data:') ? data.image : `data:image/png;base64,${data.image}`)
      : null
  if (!src) return null
  return (
    <Card title={title}>
      <img src={src} alt={title} style={{ width: '100%', borderRadius: 8 }} />
    </Card>
  )
}

function Analytics() {
  const { data: correlation, loading: cl } = useFetch('/api/charts/correlation')
  const { data: distributions, loading: dl } = useFetch('/api/charts/distributions')
  const { data: volatility, loading: vl } = useFetch('/api/charts/volatility')

  return (
    <div>
      <h1>Market Analytics</h1>

      <div className="grid-row">
        <ImageCard title="Correlation Heatmap" data={correlation} loading={cl} />
        <ImageCard title="Price Distributions" data={distributions} loading={dl} />
        <ImageCard title="Volatility Analysis" data={volatility} loading={vl} />
      </div>

      {!cl && !dl && !vl && !correlation && !distributions && !volatility && (
        <Card><p className="muted">No analytics data available.</p></Card>
      )}
    </div>
  )
}

export default Analytics
