import * as fs from 'fs'
import * as path from 'path'

const dashboardPath = path.join(__dirname, '../grafana/dashboard.json')
const dashboard = JSON.parse(fs.readFileSync(dashboardPath, 'utf-8')) as {
  schemaVersion?: number
  title?: string
  refresh?: string
  panels?: Array<{
    title?: string
    type?: string
    targets?: Array<{ expr?: string; expression?: string }>
  }>
}

describe('Grafana dashboard JSON', () => {
  // Test 1: dashboard parses as valid JSON
  it('dashboard.json parses as valid JSON', () => {
    expect(dashboard).toBeDefined()
    expect(typeof dashboard).toBe('object')
  })

  // Test 2: schemaVersion is a number >= 30
  it('schemaVersion is a number >= 30', () => {
    expect(typeof dashboard.schemaVersion).toBe('number')
    expect(dashboard.schemaVersion).toBeGreaterThanOrEqual(30)
  })

  // Test 3: panels array exists and has length >= 2
  it('panels array exists and has at least 2 panels', () => {
    expect(Array.isArray(dashboard.panels)).toBe(true)
    expect((dashboard.panels ?? []).length).toBeGreaterThanOrEqual(2)
  })

  // Test 4: Each panel has a title string and type string
  it('each panel has a title and type string', () => {
    const panels = dashboard.panels ?? []
    for (const panel of panels) {
      expect(typeof panel.title).toBe('string')
      expect(typeof panel.type).toBe('string')
    }
  })

  // Test 5: At least one panel references 'http_requests_total'
  it('at least one panel references http_requests_total metric', () => {
    const panels = dashboard.panels ?? []
    const hasMetric = panels.some((panel) => {
      const targets = panel.targets ?? []
      return targets.some(
        (t) => t.expr?.includes('http_requests_total') || t.expression?.includes('http_requests_total')
      )
    })
    expect(hasMetric).toBe(true)
  })

  // Test 6: refresh field is a non-empty string
  it('refresh field is a non-empty string', () => {
    expect(typeof dashboard.refresh).toBe('string')
    expect((dashboard.refresh ?? '').length).toBeGreaterThan(0)
  })
})
