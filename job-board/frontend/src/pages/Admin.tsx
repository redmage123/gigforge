import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { api, ApiError } from '../api/client'
import type { User, Role } from '../types'

const styles: Record<string, React.CSSProperties> = {
  container: { maxWidth: 900, margin: '0 auto', padding: '24px 16px' },
  h1: { margin: '0 0 8px', fontSize: 26, fontWeight: 700 },
  subtitle: { color: '#666', marginBottom: 28 },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    background: '#fff',
    border: '1px solid #e0e0e0',
    borderRadius: 10,
    overflow: 'hidden',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)'
  },
  th: {
    padding: '12px 16px',
    textAlign: 'left',
    background: '#f8f9fa',
    fontSize: 13,
    fontWeight: 600,
    color: '#555',
    borderBottom: '1px solid #e0e0e0'
  },
  td: { padding: '12px 16px', borderBottom: '1px solid #f0f0f0', fontSize: 14 },
  roleSelect: {
    padding: '4px 8px',
    border: '1px solid #ccc',
    borderRadius: 4,
    fontSize: 13,
    cursor: 'pointer'
  },
  badge: (role: string): React.CSSProperties => ({
    display: 'inline-block',
    padding: '2px 10px',
    borderRadius: 20,
    fontSize: 12,
    fontWeight: 500,
    background: role === 'admin' ? '#fce4ec' : role === 'employer' ? '#e3f2fd' : '#e8f5e9',
    color: role === 'admin' ? '#b71c1c' : role === 'employer' ? '#1565c0' : '#2e7d32'
  }),
  loading: { textAlign: 'center', padding: 40, color: '#666' },
  error: {
    background: '#fff0f0',
    border: '1px solid #ffcdd2',
    color: '#c62828',
    padding: 12,
    borderRadius: 6,
    marginBottom: 16
  },
  success: {
    background: '#e6f4ea',
    border: '1px solid #a8d5b5',
    color: '#2d6a4f',
    padding: 12,
    borderRadius: 6,
    marginBottom: 16
  },
  saveBtn: {
    background: '#3b5bdb',
    color: '#fff',
    border: 'none',
    borderRadius: 4,
    padding: '4px 12px',
    fontSize: 13,
    cursor: 'pointer',
    marginLeft: 8
  }
}

export default function Admin() {
  const { token } = useAuth()
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [pendingRoles, setPendingRoles] = useState<Record<number, Role>>({})

  useEffect(() => {
    api.get<{ users: User[] }>('/admin/users', token)
      .then(data => { setUsers(data.users); setLoading(false) })
      .catch(err => {
        setError(err instanceof ApiError ? err.message : 'Failed to load users')
        setLoading(false)
      })
  }, [token])

  async function handleRoleChange(userId: number, newRole: Role) {
    setError(null)
    setMessage(null)
    try {
      const updated = await api.put<User>(`/admin/users/${userId}/role`, { role: newRole }, token)
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: updated.role } : u))
      setPendingRoles(prev => { const n = { ...prev }; delete n[userId]; return n })
      setMessage(`Role updated for ${updated.email}`)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update role')
    }
  }

  if (loading) return <div style={styles.loading}>Loading...</div>

  return (
    <div style={styles.container}>
      <h1 style={styles.h1}>Admin Panel</h1>
      <p style={styles.subtitle}>Manage users and platform settings</p>

      {error && <div style={styles.error}>{error}</div>}
      {message && <div style={styles.success}>{message}</div>}

      <h2 style={{ fontSize: 18, marginBottom: 12 }}>Users ({users.length})</h2>

      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.th}>ID</th>
            <th style={styles.th}>Name</th>
            <th style={styles.th}>Email</th>
            <th style={styles.th}>Current Role</th>
            <th style={styles.th}>Change Role</th>
          </tr>
        </thead>
        <tbody>
          {users.map(user => {
            const pending = pendingRoles[user.id]
            const changed = pending && pending !== user.role
            return (
              <tr key={user.id}>
                <td style={styles.td}>#{user.id}</td>
                <td style={styles.td}>{user.name}</td>
                <td style={styles.td}>{user.email}</td>
                <td style={styles.td}>
                  <span style={styles.badge(user.role)}>{user.role}</span>
                </td>
                <td style={styles.td}>
                  <select
                    style={styles.roleSelect}
                    value={pending ?? user.role}
                    onChange={e => setPendingRoles(prev => ({ ...prev, [user.id]: e.target.value as Role }))}
                  >
                    <option value="applicant">applicant</option>
                    <option value="employer">employer</option>
                    <option value="admin">admin</option>
                  </select>
                  {changed && (
                    <button
                      style={styles.saveBtn}
                      onClick={() => handleRoleChange(user.id, pending)}
                    >
                      Save
                    </button>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
