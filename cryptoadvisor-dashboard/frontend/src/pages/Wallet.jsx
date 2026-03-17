import { useState, useEffect, useCallback } from 'react'
import { api } from '../api/client'
import Card from '../components/Card'
import LoadingSpinner from '../components/LoadingSpinner'
import { useWalletConnect } from '../hooks/useWalletConnect'

function Wallet() {
  const [wallets, setWallets] = useState([])
  const [balances, setBalances] = useState(null)
  const [loading, setLoading] = useState(true)
  const [metamaskAddr, setMetamaskAddr] = useState('')
  const [newLabel, setNewLabel] = useState('')
  const [newAddress, setNewAddress] = useState('')
  const [newChain, setNewChain] = useState('ethereum')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const { connect: wcConnect, connecting: wcConnecting, error: wcError } = useWalletConnect()

  const fetchWallets = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get('/api/wallet/saved')
      const list = Array.isArray(res) ? res : res.wallets || []
      setWallets(list)
      if (list.length > 0) {
        const addrs = list.map((w) => w.address).join(',')
        const bal = await api.get(`/api/wallet/balances?addresses=${addrs}`)
        setBalances(bal)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchWallets() }, [fetchWallets])

  const connectMetamask = async () => {
    if (!window.ethereum) {
      setError('MetaMask not detected. Please install it.')
      return
    }
    try {
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' })
      setMetamaskAddr(accounts[0])
      setNewAddress(accounts[0])
      setNewLabel('MetaMask')
    } catch {
      setError('MetaMask connection rejected')
    }
  }

  const connectWalletConnect = async () => {
    const result = await wcConnect()
    if (result) {
      setNewAddress(result.address)
      setNewChain(result.chain)
      setNewLabel('WalletConnect')
    }
  }

  const addWallet = async (e) => {
    e.preventDefault()
    if (!newAddress.trim()) return
    setSaving(true)
    setError('')
    try {
      await api.post('/api/wallet/saved', { label: newLabel || 'Wallet', address: newAddress.trim(), chain: newChain })
      setNewLabel('')
      setNewAddress('')
      await fetchWallets()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const removeWallet = async (id) => {
    try {
      await api.del(`/api/wallet/saved/${id}`)
      await fetchWallets()
    } catch (err) {
      setError(err.message)
    }
  }

  const balArr = balances
    ? (Array.isArray(balances) ? balances : balances.balances || Object.entries(balances).map(([addr, val]) => ({ address: addr, ...val })))
    : []

  return (
    <div>
      <h1>Wallet Management</h1>

      <Card title="Connect Wallet" className="mt-1">
        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
          <button className="btn" onClick={connectMetamask} style={{ background: '#f6851b' }}>
            {metamaskAddr ? `Connected: ${metamaskAddr.slice(0, 6)}...${metamaskAddr.slice(-4)}` : 'Connect MetaMask'}
          </button>
          <button className="btn" onClick={connectWalletConnect} disabled={wcConnecting} style={{ background: '#3b99fc' }}>
            {wcConnecting ? 'Connecting...' : 'WalletConnect'}
          </button>
        </div>
        {wcError && <div className="login-error" style={{ marginBottom: '0.75rem' }}>{wcError}</div>}

        <form onSubmit={addWallet} style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="form-group">
            <label>Label</label>
            <input className="form-input" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="My Wallet" />
          </div>
          <div className="form-group" style={{ flex: 1, minWidth: 200 }}>
            <label>Address</label>
            <input className="form-input" value={newAddress} onChange={(e) => setNewAddress(e.target.value)} placeholder="0x..." required />
          </div>
          <div className="form-group">
            <label>Chain</label>
            <select className="form-input" value={newChain} onChange={(e) => setNewChain(e.target.value)}>
              <option value="ethereum">Ethereum</option>
              <option value="polygon">Polygon</option>
              <option value="bsc">BSC</option>
              <option value="arbitrum">Arbitrum</option>
              <option value="optimism">Optimism</option>
              <option value="avalanche">Avalanche</option>
              <option value="base">Base</option>
              <option value="solana">Solana</option>
              <option value="bitcoin">Bitcoin</option>
            </select>
          </div>
          <button type="submit" className="btn" disabled={saving}>{saving ? 'Saving...' : 'Add Wallet'}</button>
        </form>
      </Card>

      {error && <div className="login-error" style={{ marginTop: '1rem' }}>{error}</div>}

      {loading ? <LoadingSpinner /> : (
        <>
          <Card title="Saved Wallets" className="mt-1">
            {wallets.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {wallets.map((w) => (
                  <div key={w.id || w.address} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <strong>{w.label || 'Wallet'}</strong>
                      <div className="muted" style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>{w.address}</div>
                      <div style={{ color: '#646cff', fontSize: '0.8rem' }}>{w.chain || 'ethereum'}</div>
                    </div>
                    <button className="btn btn-danger" onClick={() => removeWallet(w.id || w.address)}>Remove</button>
                  </div>
                ))}
              </div>
            ) : <p className="muted">No wallets saved yet.</p>}
          </Card>

          {balArr.length > 0 && (
            <Card title="Balances" className="mt-1">
              <div className="grid-row">
                {balArr.map((b, i) => (
                  <div key={i} className="card">
                    <div className="muted" style={{ fontFamily: 'monospace', fontSize: '0.8rem', marginBottom: 4 }}>
                      {(b.address || '').slice(0, 10)}...{(b.address || '').slice(-6)}
                    </div>
                    {(b.balances || [{ chain: b.chain, balance: b.balance, usd_value: b.usd_value }]).map((cb, j) => (
                      <div key={j} style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                        <span className="muted">{cb.chain || cb.token || 'ETH'}</span>
                        <strong>{cb.balance} {cb.usd_value ? `($${Number(cb.usd_value).toLocaleString()})` : ''}</strong>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  )
}

export default Wallet
