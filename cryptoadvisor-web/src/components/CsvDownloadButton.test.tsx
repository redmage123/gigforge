import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import CsvDownloadButton from './CsvDownloadButton'

describe('CsvDownloadButton', () => {
  let createObjectURL: typeof URL.createObjectURL
  let revokeObjectURL: typeof URL.revokeObjectURL
  let urls: string[] = []

  beforeEach(() => {
    urls = []
    createObjectURL = URL.createObjectURL
    revokeObjectURL = URL.revokeObjectURL
    URL.createObjectURL = vi.fn(() => {
      const u = `blob:fake-${urls.length}`
      urls.push(u)
      return u
    })
    URL.revokeObjectURL = vi.fn()
  })

  afterEach(() => {
    URL.createObjectURL = createObjectURL
    URL.revokeObjectURL = revokeObjectURL
  })

  test('disabled when rows empty', () => {
    render(
      <CsvDownloadButton
        rows={[]}
        filenamePrefix="test"
        headers={['A']}
        rowMapper={(r: number) => [r]}
      />,
    )
    expect(screen.getByTestId('csv-download')).toBeDisabled()
  })

  test('enabled with rows; click triggers blob URL creation', () => {
    render(
      <CsvDownloadButton
        rows={[{ a: 1 }, { a: 2 }]}
        filenamePrefix="test"
        headers={['A']}
        rowMapper={(r: { a: number }) => [r.a]}
      />,
    )
    const btn = screen.getByTestId('csv-download')
    expect(btn).not.toBeDisabled()
    fireEvent.click(btn)
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1)
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1)
  })

  test('custom label renders', () => {
    render(
      <CsvDownloadButton
        rows={[1]}
        filenamePrefix="t"
        headers={['n']}
        rowMapper={(n: number) => [n]}
        label="Download .csv"
      />,
    )
    expect(screen.getByText('Download .csv')).toBeInTheDocument()
  })
})
