import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import {
  BUILTIN_PRESETS,
  deleteSavedPreset,
  loadSavedPresets,
  persistSavedPresets,
  saveCurrentAsPreset,
} from './RiskPresets'

const STORAGE_KEY = 'cryptoadvisor.risk.presets'

describe('RiskPresets', () => {
  beforeEach(() => {
    localStorage.clear()
  })
  afterEach(() => {
    localStorage.clear()
  })

  test('BUILTIN_PRESETS includes Conservative, Balanced, Aggressive', () => {
    const ids = BUILTIN_PRESETS.map((p) => p.id)
    expect(ids).toEqual(['conservative', 'balanced', 'aggressive'])
    for (const p of BUILTIN_PRESETS) {
      expect(p.builtin).toBe(true)
      expect(p.allocations.reduce((s, a) => s + a.pct, 0)).toBe(100)
    }
  })

  test('loadSavedPresets returns [] when nothing saved', () => {
    expect(loadSavedPresets()).toEqual([])
  })

  test('loadSavedPresets returns [] on bad JSON', () => {
    localStorage.setItem(STORAGE_KEY, '{not-json')
    expect(loadSavedPresets()).toEqual([])
  })

  test('saveCurrentAsPreset persists + roundtrips', () => {
    const preset = saveCurrentAsPreset('My mix', [
      { symbol: 'BTC', pct: 60 },
      { symbol: 'ETH', pct: 40 },
    ])
    expect(preset.label).toBe('My mix')
    expect(preset.builtin).toBe(false)
    const loaded = loadSavedPresets()
    expect(loaded).toHaveLength(1)
    expect(loaded[0].id).toBe(preset.id)
  })

  test('deleteSavedPreset removes by id', () => {
    const a = saveCurrentAsPreset('A', [{ symbol: 'BTC', pct: 100 }])
    const b = saveCurrentAsPreset('B', [{ symbol: 'ETH', pct: 100 }])
    deleteSavedPreset(a.id)
    const remaining = loadSavedPresets()
    expect(remaining).toHaveLength(1)
    expect(remaining[0].id).toBe(b.id)
  })

  test('persistSavedPresets overwrites existing', () => {
    persistSavedPresets([
      {
        id: 'p1',
        label: 'First',
        builtin: false,
        allocations: [{ symbol: 'BTC', pct: 100 }],
      },
    ])
    const loaded = loadSavedPresets()
    expect(loaded).toHaveLength(1)
    expect(loaded[0].label).toBe('First')
  })
})
