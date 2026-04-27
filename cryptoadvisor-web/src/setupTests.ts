import '@testing-library/jest-dom'
import './i18n/index.ts'
import { vi } from 'vitest'
import React from 'react'

vi.mock('recharts', () => {
  const MockChart = ({ children }: { children?: React.ReactNode }) =>
    React.createElement('div', { 'data-testid': 'chart' }, children)
  return {
    ResponsiveContainer: ({ children }: { children?: React.ReactNode }) =>
      React.createElement('div', { 'data-testid': 'responsive-container' }, children),
    PieChart: MockChart,
    Pie: () => React.createElement('div', { 'data-testid': 'pie' }),
    Cell: () => null,
    Tooltip: () => null,
    Legend: () => null,
    ComposedChart: MockChart,
    XAxis: () => null,
    YAxis: () => null,
    CartesianGrid: () => null,
    Bar: () => React.createElement('div', { 'data-testid': 'bar' }),
    Line: () => null,
    Area: () => null,
    AreaChart: MockChart,
    BarChart: MockChart,
    ReferenceLine: () => null,
  }
})

// Mock ResizeObserver
;(globalThis as unknown as Record<string, unknown>).ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
