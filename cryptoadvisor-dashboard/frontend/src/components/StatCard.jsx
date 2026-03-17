function StatCard({ value, label, change }) {
  const changeClass = change > 0 ? 'positive' : change < 0 ? 'negative' : ''
  const changePrefix = change > 0 ? '+' : ''

  return (
    <div className="card">
      <div className="stat">
        <div className="value">{value}</div>
        <div className="label">{label}</div>
        {change !== undefined && change !== null && (
          <div className={`change ${changeClass}`}>
            {changePrefix}{change}%
          </div>
        )}
      </div>
    </div>
  )
}

export default StatCard
