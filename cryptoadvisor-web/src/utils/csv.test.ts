import { describe, expect, test } from 'vitest'
import { escapeCsvField, rowsToCsv, todayStamp } from './csv'

describe('escapeCsvField', () => {
  test('plain strings pass through unquoted', () => {
    expect(escapeCsvField('Bitcoin')).toBe('Bitcoin')
  })

  test('numbers are stringified unquoted', () => {
    expect(escapeCsvField(42.5)).toBe('42.5')
    expect(escapeCsvField(0)).toBe('0')
  })

  test('null and undefined become empty string', () => {
    expect(escapeCsvField(null)).toBe('')
    expect(escapeCsvField(undefined)).toBe('')
  })

  test('strings with commas are quoted', () => {
    expect(escapeCsvField('Bitcoin, Inc.')).toBe('"Bitcoin, Inc."')
  })

  test('strings with double-quotes have quotes doubled', () => {
    expect(escapeCsvField('She said "hi"')).toBe('"She said ""hi"""')
  })

  test('strings with newlines are quoted', () => {
    expect(escapeCsvField('line1\nline2')).toBe('"line1\nline2"')
  })
})

describe('rowsToCsv', () => {
  test('emits header + rows joined with CRLF', () => {
    const csv = rowsToCsv(
      ['Date', 'Asset', 'Amount'],
      [
        ['2026-04-28', 'BTC', 0.5],
        ['2026-04-27', 'ETH', 2.0],
      ],
    )
    expect(csv).toBe('Date,Asset,Amount\r\n2026-04-28,BTC,0.5\r\n2026-04-27,ETH,2\r\n')
  })

  test('quoting applied per field', () => {
    const csv = rowsToCsv(['Note'], [['hello, world'], ['plain']])
    expect(csv).toBe('Note\r\n"hello, world"\r\nplain\r\n')
  })

  test('empty rows still emit header', () => {
    const csv = rowsToCsv(['A', 'B'], [])
    expect(csv).toBe('A,B\r\n')
  })
})

describe('todayStamp', () => {
  test('returns YYYY-MM-DD', () => {
    expect(todayStamp()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
