import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import Panel from './Panel'

describe('Panel', () => {
  it('renders the title when provided', () => {
    render(<Panel title="My Panel">Content</Panel>)
    expect(screen.getByText('My Panel')).toBeInTheDocument()
  })

  it('renders children', () => {
    render(<Panel title="Test"><span>Child content</span></Panel>)
    expect(screen.getByText('Child content')).toBeInTheDocument()
  })

  it('renders without title', () => {
    render(<Panel>No title</Panel>)
    expect(screen.getByText('No title')).toBeInTheDocument()
  })
})
