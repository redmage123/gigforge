import { useState, useCallback, useRef, useEffect } from 'react'

// WalletConnect needs a (free) project id from https://cloud.reown.com, baked in at build time.
// Without one the WalletConnect option is hidden; injected browser wallets (window.ethereum) still work.
const PROJECT_ID = (import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || '').trim()
export const WALLETCONNECT_AVAILABLE = /^[0-9a-f]{32}$/i.test(PROJECT_ID)

const SUPPORTED_CHAINS = {
  ethereum: { id: 1, name: 'Ethereum', rpc: 'https://cloudflare-eth.com' },
  polygon: { id: 137, name: 'Polygon', rpc: 'https://polygon-rpc.com' },
  bsc: { id: 56, name: 'BNB Smart Chain', rpc: 'https://bsc-dataseed.binance.org' },
  arbitrum: { id: 42161, name: 'Arbitrum One', rpc: 'https://arb1.arbitrum.io/rpc' },
  optimism: { id: 10, name: 'Optimism', rpc: 'https://mainnet.optimism.io' },
  avalanche: { id: 43114, name: 'Avalanche C-Chain', rpc: 'https://api.avax.network/ext/bc/C/rpc' },
  base: { id: 8453, name: 'Base', rpc: 'https://mainnet.base.org' },
}

const CHAIN_ID_TO_NAME = Object.fromEntries(
  Object.entries(SUPPORTED_CHAINS).map(([name, cfg]) => [cfg.id, name])
)

// Pick one account out of a session's CAIP-10 list ("eip155:<chainId>:<address>"), preferring Ethereum mainnet.
function pickAccount(accounts) {
  const parsed = (accounts || [])
    .map((a) => a.split(':'))
    .filter((p) => p.length === 3 && p[0] === 'eip155')
    .map(([, chainId, address]) => ({ chainId: Number(chainId), address }))
  return parsed.find((a) => a.chainId === 1) || parsed.find((a) => CHAIN_ID_TO_NAME[a.chainId]) || parsed[0] || null
}

export function useWalletConnect() {
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState('')
  const [pairingUri, setPairingUri] = useState('')
  const [qrDataUrl, setQrDataUrl] = useState('')
  const providerRef = useRef(null)
  const attemptRef = useRef(0)

  const resetPairing = useCallback(() => {
    setPairingUri('')
    setQrDataUrl('')
  }, [])

  const connect = useCallback(async () => {
    if (!WALLETCONNECT_AVAILABLE) {
      setError('WalletConnect is not configured on this server.')
      return null
    }
    const attempt = ++attemptRef.current
    setConnecting(true)
    setError('')
    resetPairing()

    try {
      // Loaded on demand so the WalletConnect SDK is not part of the page bundle.
      const [{ UniversalProvider }, { renderSVG }] = await Promise.all([
        import('@walletconnect/universal-provider'),
        import('uqr'),
      ])

      if (!providerRef.current) {
        const provider = await UniversalProvider.init({
          projectId: PROJECT_ID,
          telemetryEnabled: false,
          metadata: {
            name: 'AssetAdvisor',
            description: 'AI-powered crypto portfolio tracker',
            url: window.location.origin,
            icons: [`${window.location.origin}/static/react/vite.svg`],
          },
        })
        providerRef.current = provider
      }
      const provider = providerRef.current
      if (provider.session) {
        await provider.disconnect().catch(() => {})
      }

      const onUri = (uri) => {
        if (attempt !== attemptRef.current) return
        setPairingUri(uri)
        setQrDataUrl(`data:image/svg+xml;utf8,${encodeURIComponent(renderSVG(uri, { border: 2 }))}`)
      }
      provider.on('display_uri', onUri)

      let session
      try {
        session = await provider.connect({
          optionalNamespaces: {
            eip155: {
              chains: Object.values(SUPPORTED_CHAINS).map((c) => `eip155:${c.id}`),
              methods: ['eth_accounts', 'eth_chainId', 'personal_sign'],
              events: ['accountsChanged', 'chainChanged'],
              rpcMap: Object.fromEntries(Object.values(SUPPORTED_CHAINS).map((c) => [c.id, c.rpc])),
            },
          },
        })
      } finally {
        provider.off('display_uri', onUri)
      }

      // Cancelled (or superseded) while the wallet was still deciding.
      if (attempt !== attemptRef.current) return null

      const acct = pickAccount(session?.namespaces?.eip155?.accounts)
      resetPairing()
      setConnecting(false)
      if (!acct) {
        setError('The wallet connected but shared no EVM account.')
        return null
      }
      return { address: acct.address, chain: CHAIN_ID_TO_NAME[acct.chainId] || 'ethereum', chainId: acct.chainId }
    } catch (err) {
      if (attempt !== attemptRef.current) return null
      const msg = err?.message || String(err || '') || 'WalletConnect connection failed'
      // The user declining in the wallet is not an error worth showing.
      setError(/reject|denied|dismissed/i.test(msg) ? '' : msg)
      resetPairing()
      setConnecting(false)
      return null
    }
  }, [resetPairing])

  // Stop waiting for the wallet; a late approval is ignored.
  const cancel = useCallback(() => {
    attemptRef.current += 1
    resetPairing()
    setConnecting(false)
  }, [resetPairing])

  const disconnect = useCallback(async () => {
    attemptRef.current += 1
    resetPairing()
    setConnecting(false)
    if (providerRef.current?.session) {
      try {
        await providerRef.current.disconnect()
      } catch {
        // ignore
      }
    }
  }, [resetPairing])

  // Leaving the page abandons any pending pairing.
  useEffect(() => () => { attemptRef.current += 1 }, [])

  return { connect, cancel, disconnect, connecting, error, pairingUri, qrDataUrl, available: WALLETCONNECT_AVAILABLE }
}

export { SUPPORTED_CHAINS, CHAIN_ID_TO_NAME }
