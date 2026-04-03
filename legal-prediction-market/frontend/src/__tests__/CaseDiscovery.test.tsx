import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { CaseDiscovery } from '../components/CaseDiscovery'
import * as client from '../api/client'
import type { Case } from '../api/types'

const mockCases: Case[] = [
  { id: 'c1', case_number: '23-CV-001', title: 'Smith v. Acme Corp', jurisdiction_id: 1, case_type_id: 1, judge_id: 'j1', filing_date: '2023-01-15', status: 'open', damages_claimed: 500000 },
  { id: 'c2', case_number: '23-CV-002', title: 'Jones v. BigTech', jurisdiction_id: 2, case_type_id: 1, judge_id: 'j2', filing_date: '2023-02-20', status: 'closed', damages_claimed: 1500000 },
]

describe('CaseDiscovery', () => {
  beforeEach(() => {
    vi.spyOn(client.api, 'getCases').mockResolvedValue(mockCases)
  })

  const renderComponent = () =>
    render(<MemoryRouter><CaseDiscovery /></MemoryRouter>)

  it('renders search input fields', () => {
    renderComponent()
    expect(screen.getByPlaceholderText(/case type/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/jurisdiction/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/judge name/i)).toBeInTheDocument()
  })

  it('fetches cases on mount', async () => {
    renderComponent()
    await waitFor(() => {
      expect(client.api.getCases).toHaveBeenCalledWith(expect.objectContaining({ page: 1 }))
    })
  })

  it('renders case cards from API response', async () => {
    renderComponent()
    await waitFor(() => {
      expect(screen.getByText(/Smith v\. Acme Corp/)).toBeInTheDocument()
      expect(screen.getByText(/Jones v\. BigTech/)).toBeInTheDocument()
    })
  })

  it('calls API with filter params when type input changes', async () => {
    renderComponent()
    await waitFor(() => screen.getByText(/Smith v\. Acme Corp/))
    fireEvent.change(screen.getByPlaceholderText(/case type/i), { target: { value: 'civil' } })
    await waitFor(() => {
      expect(client.api.getCases).toHaveBeenCalledWith(expect.objectContaining({ type: 'civil' }))
    })
  })

  it('increments page when Next is clicked', async () => {
    // return 20 mock items to enable Next button
    vi.spyOn(client.api, 'getCases').mockResolvedValue(
      Array.from({ length: 20 }, (_, i) => ({ ...mockCases[0], id: `c-${i + 1}` }))
    )
    renderComponent()
    await waitFor(() => screen.getByText('Next'))
    fireEvent.click(screen.getByText('Next'))
    await waitFor(() => {
      expect(client.api.getCases).toHaveBeenCalledWith(expect.objectContaining({ page: 2 }))
    })
  })
})
