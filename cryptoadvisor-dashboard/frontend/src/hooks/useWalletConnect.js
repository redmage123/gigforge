import { useState, useCallback, useRef } from 'react'
import { BrowserProvider } from 'ethers'

// WalletConnect project ID — get yours free at https://cloud.walletconnect.com
const PROJECT_ID = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || '2f5e5b0d8e5c4e0a9b8d7c6f5a4e3d2c'

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

export function useWalletConnect() {
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState('')
  const providerRef = useRef(null)

  const connect = useCallback(async () => {
    setConnecting(true)
    setError('')

    try {
      // Dynamic import to avoid loading WalletConnect on every page
      const { EthereumProvider } = await import('@walletconnect/ethereum-provider')

      const chainIds = Object.values(SUPPORTED_CHAINS).map(c => c.id)
      const rpcMap = Object.fromEntries(
        Object.values(SUPPORTED_CHAINS).map(c => [c.id, c.rpc])
      )

      const provider = await EthereumProvider.init({
        projectId: PROJECT_ID,
        chains: [1], // default to Ethereum mainnet
        optionalChains: chainIds,
        rpcMap,
        showQrModal: true,
        metadata: {
          name: 'CryptoAdvisor Dashboard',
          description: 'AI-powered crypto portfolio tracker',
          url: window.location.origin,
          icons: [`${window.location.origin}/static/react/vite.svg`],
        },
      })

      providerRef.current = provider

      await provider.connect()

      const ethersProvider = new BrowserProvider(provider)
      const signer = await ethersProvider.getSigner()
      const address = await signer.getAddress()
      const chainId = provider.chainId
      const chain = CHAIN_ID_TO_NAME[chainId] || 'ethereum'

      setConnecting(false)
      return { address, chain, chainId }
    } catch (err) {
      const msg = err?.message || 'WalletConnect connection failed'
      // User closed modal — not an error
      if (msg.includes('User rejected') || msg.includes('dismissed')) {
        setError('')
      } else {
        setError(msg)
      }
      setConnecting(false)
      return null
    }
  }, [])

  const disconnect = useCallback(async () => {
    if (providerRef.current) {
      try {
        await providerRef.current.disconnect()
      } catch {
        // ignore
      }
      providerRef.current = null
    }
  }, [])

  return { connect, disconnect, connecting, error }
}

export { SUPPORTED_CHAINS, CHAIN_ID_TO_NAME }
