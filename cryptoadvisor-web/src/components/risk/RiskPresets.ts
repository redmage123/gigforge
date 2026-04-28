/**
 * Built-in portfolio presets for the Risk Calculator.
 *
 * Names + allocations match the spec in TASK_BRIEF Sprint 8 STORY-802.
 * Saved presets live in localStorage under SAVED_KEY as a JSON array.
 */
import type { RiskAllocation } from '../../api/cms/client'

export interface Preset {
  id: string
  label: string
  allocations: RiskAllocation[]
  builtin: boolean
}

export const BUILTIN_PRESETS: Preset[] = [
  {
    id: 'conservative',
    label: 'Conservative',
    builtin: true,
    allocations: [
      { symbol: 'BTC', pct: 30 },
      { symbol: 'ETH', pct: 20 },
      { symbol: 'USD', pct: 50 },
    ],
  },
  {
    id: 'balanced',
    label: 'Balanced',
    builtin: true,
    allocations: [
      { symbol: 'BTC', pct: 50 },
      { symbol: 'ETH', pct: 30 },
      { symbol: 'USD', pct: 20 },
    ],
  },
  {
    id: 'aggressive',
    label: 'Aggressive',
    builtin: true,
    allocations: [
      { symbol: 'BTC', pct: 40 },
      { symbol: 'ETH', pct: 30 },
      { symbol: 'SOL', pct: 20 },
      { symbol: 'LINK', pct: 10 },
    ],
  },
]

const SAVED_KEY = 'cryptoadvisor.risk.presets'

export function loadSavedPresets(): Preset[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const raw = localStorage.getItem(SAVED_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as Preset[]
    return Array.isArray(parsed) ? parsed.filter((p) => p && p.id) : []
  } catch {
    return []
  }
}

export function persistSavedPresets(presets: Preset[]): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(SAVED_KEY, JSON.stringify(presets))
}

export function saveCurrentAsPreset(
  label: string,
  allocations: RiskAllocation[],
): Preset {
  const id = `saved-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const preset: Preset = { id, label, allocations, builtin: false }
  const next = [...loadSavedPresets(), preset]
  persistSavedPresets(next)
  return preset
}

export function deleteSavedPreset(id: string): void {
  const next = loadSavedPresets().filter((p) => p.id !== id)
  persistSavedPresets(next)
}
