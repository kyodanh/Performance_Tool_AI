import { describe, expect, it } from 'vitest'

import { Check } from '@/schemas/k6'
import { RunStats } from '@/utils/k6/stats'

import { checkTotals, runSummaryStats } from './RunSummaryBar'

function check(passes: number, fails: number): Check {
  return {
    id: `${passes}-${fails}`,
    name: 'status is 200',
    path: '',
    passes,
    fails,
  }
}

describe('checkTotals', () => {
  it('sums passes and fails', () => {
    expect(checkTotals([check(2, 0), check(3, 1)])).toEqual({
      passes: 5,
      fails: 1,
    })
  })
})

describe('runSummaryStats', () => {
  it('reports em dashes before any check ran', () => {
    const stats = runSummaryStats(0, [], null)

    expect(stats.map((stat) => stat.value)).toEqual(['0', '—', '—', '0', '—'])
  })

  it('rounds the success rate and marks a clean run green', () => {
    const stats = runSummaryStats(7, [check(3, 0)], {
      avgDuration: 411.6,
    } as RunStats)

    expect(stats.map((stat) => stat.value)).toEqual([
      '7',
      '3 / 3',
      '100',
      '0',
      '412',
    ])
    expect(stats[3]?.color).toBeUndefined()
  })

  it('marks failures red', () => {
    const stats = runSummaryStats(4, [check(1, 3)], null)

    expect(stats[2]?.value).toBe('25')
    expect(stats[3]?.color).toBe('var(--red-11)')
  })

  // A load test's stdout carries no checks — they only reach the UI via stats.
  it('falls back to the stats check stream', () => {
    const stats = runSummaryStats(0, [], {
      avgDuration: 0,
      checks: [{ name: 'ok', group: 'g', request: 'r', passes: 4, fails: 0 }],
    } as RunStats)

    expect(stats[1]?.value).toBe('4 / 4')
  })
})
