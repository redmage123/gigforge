export default function Skeleton({ lines = 3, height = 14, style = {} }) {
  return (
    <div className="skeleton-container" style={style}>
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="skeleton-line"
          style={{ width: `${90 - i * 12}%`, height }}
        />
      ))}
    </div>
  )
}

export function SkeletonCard() {
  return (
    <div className="card">
      <div className="skeleton-line" style={{ width: '40%', height: 12, marginBottom: 16 }} />
      <div className="skeleton-line" style={{ width: '70%', height: 28, marginBottom: 8 }} />
      <div className="skeleton-line" style={{ width: '50%', height: 14 }} />
    </div>
  )
}
