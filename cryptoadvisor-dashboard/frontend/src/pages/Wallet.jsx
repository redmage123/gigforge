import { useState, useEffect, useCallback } from 'react'
import { api } from '../api/client'
import Card from '../components/Card'
import LoadingSpinner from '../components/LoadingSpinner'
import { useWalletConnect } from '../hooks/useWalletConnect'

const fmtUsd = (v) => (v == null ? 'price unavailable' : `$${Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)
const fmtAmt = (v) => Number(v).toLocaleString(undefined, { maximumFractionDigits: 6 })

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
  const [balLoading, setBalLoading] = useState(false)
  const [balError, setBalError] = useState('')
  const {
    connect: wcConnect, cancel: wcCancel, connecting: wcConnecting, error: wcError,
    pairingUri: wcUri, qrDataUrl: wcQr, available: wcAvailable,
  } = useWalletConnect()

  const fetchBalances = useCallback(async () => {
    setBalLoading(true)
    setBalError('')
    try {
      setBalances(await api.get('/api/wallet/saved/balances'))
    } catch (err) {
      setBalError(`Could not load balances: ${err.message}`)
    } finally {
      setBalLoading(false)
    }
  }, [])

  const fetchWallets = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get('/api/wallet/saved')
      const list = Array.isArray(res) ? res : res.wallets || []
      setWallets(list)
      if (list.length > 0) fetchBalances()
      else setBalances(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [fetchBalances])

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

  const removeWallet = async (w) => {
    setError('')
    try {
      await api.del(`/api/wallet/saved/${encodeURIComponent(w.address)}?chain=${encodeURIComponent(w.chain || 'ethereum')}`)
      await fetchWallets()
    } catch (err) {
      setError(`Could not remove the wallet: ${err.message}`)
    }
  }

  const balArr = balances?.wallets || []

  return (
    <div>
      <h1>Wallet Management</h1>

      <Card title="Connect Wallet" className="mt-1">
        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
          <button className="btn" onClick={connectMetamask} style={{ background: '#f6851b' }}>
            {metamaskAddr ? `Connected: ${metamaskAddr.slice(0, 6)}...${metamaskAddr.slice(-4)}` : 'Connect MetaMask'}
          </button>
          {wcAvailable && (
            <button className="btn" onClick={connectWalletConnect} disabled={wcConnecting} style={{ background: '#3b99fc' }}>
              {wcConnecting ? 'Waiting for wallet...' : 'WalletConnect'}
            </button>
          )}
        </div>
        {!wcAvailable && (
          <p className="muted" style={{ fontSize: '0.85rem', marginTop: 0 }}>
            WalletConnect (mobile wallets via QR code) is not configured on this server. Browser-extension wallets still work, or paste an address below.
          </p>
        )}
        {wcConnecting && (
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '1rem' }}>
            {wcQr ? (
              <img src={wcQr} alt="WalletConnect QR code" width={220} height={220} style={{ background: '#fff', borderRadius: 8 }} />
            ) : <LoadingSpinner />}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxWidth: 320 }}>
              <span className="muted" style={{ fontSize: '0.85rem' }}>Scan with a WalletConnect-compatible wallet app, then approve the request there.</span>
              {wcUri && <a className="btn btn-sm btn-secondary" href={wcUri}>Open in wallet app (this device)</a>}
              <button type="button" className="btn btn-sm btn-secondary" onClick={wcCancel}>Cancel</button>
            </div>
          </div>
        )}
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
                  <div key={`${w.chain}:${w.address}`} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <strong>{w.label || 'Wallet'}</strong>
                      <div className="muted" style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>{w.address}</div>
                      <div style={{ color: '#646cff', fontSize: '0.8rem' }}>{w.chain || 'ethereum'}</div>
                    </div>
                    <button className="btn btn-danger" onClick={() => removeWallet(w)}>Remove</button>
                  </div>
                ))}
              </div>
            ) : <p className="muted">No wallets saved yet.</p>}
          </Card>

          {wallets.length > 0 && (
            <Card title="Balances" className="mt-1">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: 8 }}>
                <strong>{balances ? `Total: ${fmtUsd(balances.total_usd)}` : ''}</strong>
                <button className="btn btn-sm btn-secondary" onClick={fetchBalances} disabled={balLoading}>{balLoading ? 'Loading...' : 'Refresh'}</button>
              </div>
              {balError && <div className="login-error" style={{ marginBottom: '0.75rem' }}>{balError}</div>}
              {balLoading && !balances && <LoadingSpinner />}
              <div className="grid-row">
                {balArr.map((b) => (
                  <div key={`${b.chain}:${b.address}`} className="card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <strong>{b.label || 'Wallet'}</strong>
                      <span style={{ color: '#646cff', fontSize: '0.8rem' }}>{b.chain}</span>
                    </div>
                    <div className="muted" style={{ fontFamily: 'monospace', fontSize: '0.8rem', marginBottom: 4 }}>
                      {(b.address || '').slice(0, 10)}...{(b.address || '').slice(-6)}
                    </div>
                    {b.error ? (
                      <div className="negative" style={{ fontSize: '0.85rem' }}>{b.error}</div>
                    ) : (
                      <>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                          <span className="muted">{b.symbol}</span>
                          <strong>{fmtAmt(b.balance)} ({fmtUsd(b.usd_value)})</strong>
                        </div>
                        {(b.tokens || []).slice(0, 10).map((t) => (
                          <div key={t.contract || t.symbol} style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: '0.9rem' }}>
                            <span className="muted" title={t.name}>{t.symbol}</span>
                            <span>{fmtAmt(t.balance)} ({fmtUsd(t.usd_value)})</span>
                          </div>
                        ))}
                        {(b.tokens || []).length > 10 && (
                          <div className="muted" style={{ fontSize: '0.8rem', marginTop: 4 }}>+{b.tokens.length - 10} more tokens</div>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, borderTop: '1px solid #2a2a3d', paddingTop: 6 }}>
                          <span className="muted">Total</span>
                          <strong>{fmtUsd(b.total_usd)}</strong>
                        </div>
                        <div className="muted" style={{ fontSize: '0.75rem', marginTop: 4 }}>
                          Source: {b.source}{b.unpriced_tokens ? `. ${b.unpriced_tokens} token(s) have no price and are not in the total.` : ''}
                        </div>
                      </>
                    )}
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
