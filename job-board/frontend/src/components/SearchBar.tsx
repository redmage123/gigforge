import { useState, FormEvent } from 'react'

interface SearchBarProps {
  initialQuery?: string
  initialLocation?: string
  onSearch: (q: string, location: string) => void
}

const styles: Record<string, React.CSSProperties> = {
  form: {
    display: 'flex',
    gap: 12,
    flexWrap: 'wrap',
    background: '#fff',
    padding: 16,
    borderRadius: 8,
    border: '1px solid #e0e0e0',
    marginBottom: 24,
    boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
  },
  input: {
    flex: 1,
    minWidth: 200,
    padding: '10px 14px',
    border: '1px solid #ccc',
    borderRadius: 6,
    fontSize: 15,
    outline: 'none'
  },
  button: {
    background: '#3b5bdb',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    padding: '10px 20px',
    cursor: 'pointer',
    fontSize: 15,
    fontWeight: 500,
    whiteSpace: 'nowrap'
  }
}

export function SearchBar({ initialQuery = '', initialLocation = '', onSearch }: SearchBarProps) {
  const [q, setQ] = useState(initialQuery)
  const [location, setLocation] = useState(initialLocation)

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    onSearch(q.trim(), location.trim())
  }

  return (
    <form style={styles.form} onSubmit={handleSubmit}>
      <input
        style={styles.input}
        type="text"
        placeholder="Job title, skills, keywords..."
        value={q}
        onChange={e => setQ(e.target.value)}
        aria-label="Search query"
      />
      <input
        style={styles.input}
        type="text"
        placeholder="Location (e.g. London)"
        value={location}
        onChange={e => setLocation(e.target.value)}
        aria-label="Location filter"
      />
      <button style={styles.button} type="submit">Search Jobs</button>
    </form>
  )
}
