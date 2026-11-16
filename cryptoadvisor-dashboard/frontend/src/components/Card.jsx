function Card({ title, children, className = '', onClick, style }) {
  return (
    <div className={`card ${className}`} onClick={onClick} style={style}>
      {title && <h3>{title}</h3>}
      {children}
    </div>
  )
}

export default Card
