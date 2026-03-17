function Card({ title, children, className = '', onClick }) {
  return (
    <div className={`card ${className}`} onClick={onClick}>
      {title && <h3>{title}</h3>}
      {children}
    </div>
  )
}

export default Card
