import { describe, expect, it } from 'vitest'

import { GroupStats } from '@/utils/k6/stats'

import { sortGroups } from './TransactionsTable'

const group = (name: string, avg: number, p90?: number) =>
  ({
    name,
    avg,
    count: 5,
    failed: 0,
    percentiles:
      p90 === undefined ? undefined : { p50: 0, p90, p95: 0, p99: 0 },
  }) as GroupStats

describe('sortGroups', () => {
  const groups = [group('10_b', 2, 1), group('2_a', 22), group('01_c', 0.1, 3)]

  it('keeps the run order without a sort', () => {
    expect(sortGroups(groups, null, 1)).toBe(groups)
  })

  it('sorts numbers high to low and low to high', () => {
    const names = (desc: boolean) =>
      sortGroups(groups, { key: 'avg', desc }, 1).map((g) => g.name)
    expect(names(true)).toEqual(['2_a', '10_b', '01_c'])
    expect(names(false)).toEqual(['01_c', '10_b', '2_a'])
  })

  it('puts missing percentiles lowest and sorts names naturally', () => {
    expect(
      sortGroups(groups, { key: 'p90', desc: true }, 1).map((g) => g.name)
    ).toEqual(['01_c', '10_b', '2_a'])
    expect(
      sortGroups(groups, { key: 'name', desc: false }, 1).map((g) => g.name)
    ).toEqual(['01_c', '2_a', '10_b'])
  })
})
