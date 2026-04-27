import { describe, it, expect } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement } from 'react'
import { usePortfolio } from './usePortfolio'

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children)
}

describe('usePortfolio', () => {
  it('starts with isLoading true', () => {
    const { result } = renderHook(() => usePortfolio(), {
      wrapper: createWrapper(),
    })
    expect(result.current.isLoading).toBe(true)
  })

  it('resolves with portfolio data', async () => {
    const { result } = renderHook(() => usePortfolio(), {
      wrapper: createWrapper(),
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toBeDefined()
    expect(result.current.data?.totalValue).toBeGreaterThan(0)
  })

  it('resolves holdings array', async () => {
    const { result } = renderHook(() => usePortfolio(), {
      wrapper: createWrapper(),
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(Array.isArray(result.current.data?.holdings)).toBe(true)
    expect(result.current.data!.holdings.length).toBeGreaterThan(0)
  })

  it('isError is false under normal operation', async () => {
    const { result } = renderHook(() => usePortfolio(), {
      wrapper: createWrapper(),
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.isError).toBe(false)
  })
})
