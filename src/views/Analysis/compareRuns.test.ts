import { describe, expect, it } from 'vitest'

import { SlaRow, SlaVerdict } from '@/utils/k6/sla'
import { GroupStats, RunStats } from '@/utils/k6/stats'

import {
  compareRuns,
  compareTransactions,
  loadMismatch,
  overlaySeries,
  slaRegressions,
} from './compareRuns'

function group(partial: Partial<GroupStats>): GroupStats {
  return {
    name: 'Login',
    count: 10,
    failed: 0,
    avg: 100,
    max: 200,
    min: 50,
    std: 10,
    last: 100,
    series: [],
    ...partial,
  }
}

function runStats(partial: Partial<RunStats>): RunStats {
  return {
    elapsed: 10,
    vusMax: 10,
    requests: 100,
    failedRequests: 0,
    failedIterations: 0,
    checksFailed: 0,
    dataReceived: 1000,
    avgDuration: 100,
    maxDuration: 200,
    percentiles: { p50: 90, p90: 150, p95: 180, p99: 195 },
    timings: { waiting: 80 },
    groups: [],
    ...partial,
  } as RunStats
}

const find = (sections: ReturnType<typeof compareRuns>, label: string) =>
  sections.flatMap((section) => section.rows).find((row) => row.label === label)

describe('compareRuns', () => {
  it('flags slower response time as worse and more throughput as better', () => {
    const rows = compareRuns(
      runStats({}),
      runStats({ avgDuration: 150, requests: 200 })
    )

    expect(find(rows, 'Avg')).toMatchObject({
      change: 50,
      verdict: 'worse',
    })
    expect(find(rows, 'Requests/s')).toMatchObject({ verdict: 'better' })
  })

  it('treats changes inside the noise band as the same', () => {
    const rows = compareRuns(runStats({}), runStats({ avgDuration: 103 }))

    expect(find(rows, 'Avg')?.verdict).toBe('same')
  })

  it('counts errors appearing from zero as a regression', () => {
    const rows = compareRuns(runStats({}), runStats({ checksFailed: 5 }))

    expect(find(rows, 'Failed checks')).toMatchObject({
      change: null,
      verdict: 'worse',
    })
  })

  it('leaves percentiles empty when a run never recorded them', () => {
    const rows = compareRuns(runStats({ percentiles: undefined }), runStats({}))

    expect(find(rows, '95%')).toMatchObject({ change: null, verdict: null })
  })
})

describe('compareTransactions', () => {
  it('matches transactions by name and keeps ones only in one run', () => {
    const rows = compareTransactions(
      runStats({
        groups: [
          group({
            name: 'Login',
            percentiles: { p50: 1, p90: 100, p95: 1, p99: 1 },
          }),
        ],
      }),
      runStats({
        groups: [
          group({
            name: 'Login',
            percentiles: { p50: 1, p90: 50, p95: 1, p99: 1 },
          }),
          group({ name: 'Checkout', failed: 5 }),
        ],
      })
    )

    expect(rows.map((row) => row.name)).toEqual(['Login', 'Checkout'])
    expect(rows[0]?.p90.verdict).toBe('better')
    expect(rows[1]?.failRate).toMatchObject({ base: undefined, current: 50 })
  })
})

describe('overlaySeries', () => {
  it('shifts the base run onto the current run start', () => {
    const bucket = (time: number, vus: number) =>
      ({ time, vus }) as RunStats['buckets'][number]

    const result = overlaySeries(
      runStats({ buckets: [bucket(100, 1), bucket(103, 2)] }),
      runStats({ buckets: [bucket(5000, 7), bucket(5001, 8)] }),
      (b) => b.vus
    )

    expect(result.before).toEqual([
      { time: 5000, value: 1 },
      { time: 5003, value: 2 },
    ])
    expect(result).toMatchObject({ start: 5000, end: 5003 })
  })
})

describe('loadMismatch', () => {
  it('warns when the load shape differs more than 2x', () => {
    expect(
      loadMismatch(runStats({ vusMax: 2 }), runStats({ vusMax: 100 }))
    ).toEqual(['peak VUs differ (2 vs 100)'])
    expect(loadMismatch(runStats({}), runStats({ vusMax: 15 }))).toEqual([])
  })
})

describe('slaRegressions', () => {
  const slaRow = (name: string, passed: boolean): SlaRow => ({
    scope: 'transaction',
    name,
    count: 10,
    failed: 0,
    responseTime: 100,
    errorRate: 0,
    passed,
    breached: passed ? [] : ['responseTime'],
  })
  const verdict = (rows: SlaRow[]): SlaVerdict => ({
    passed: rows.every((row) => row.passed),
    rows,
    failedRows: rows.filter((row) => !row.passed).length,
  })

  it('lists only rows that newly miss the SLA', () => {
    const base = verdict([slaRow('Login', true), slaRow('Search', false)])
    const current = verdict([
      slaRow('Login', false),
      slaRow('Search', false),
      slaRow('Checkout', false),
      slaRow('Home', true),
    ])

    expect(slaRegressions(base, current).map((row) => row.name)).toEqual([
      'Login',
      'Checkout',
    ])
  })

  it('is empty when the SLA is off', () => {
    expect(slaRegressions(null, null)).toEqual([])
  })
})
