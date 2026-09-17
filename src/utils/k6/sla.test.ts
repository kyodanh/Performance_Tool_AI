import { describe, expect, it } from 'vitest'

import { byEndpoint, DEFAULT_SLA, evaluateSla, statValue } from './sla'
import { GroupStats, RequestStats, RunStats } from './stats'

const sla = { ...DEFAULT_SLA, enabled: true }

function request(partial: Partial<RequestStats>): RequestStats {
  return {
    method: 'GET',
    name: '/api/users',
    status: '200',
    group: '',
    count: 10,
    failed: 0,
    avg: 100,
    max: 200,
    min: 50,
    total: 1000,
    std: 10,
    serverTime: 900,
    ...partial,
  }
}

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
    requests: 10,
    failedRequests: 0,
    avgDuration: 100,
    maxDuration: 200,
    percentiles: { p50: 90, p90: 150, p95: 180, p99: 195 },
    groups: [],
    requestStats: [],
    ...partial,
  } as RunStats
}

describe('statValue', () => {
  it('reports null when the run never recorded the percentile', () => {
    expect(statValue('p95', { avg: 100, max: 200 })).toBeNull()
    expect(statValue('max', { avg: 100, max: 200 })).toBe(200)
  })
})

describe('byEndpoint', () => {
  it('sums the statuses of one endpoint and keeps the worst percentile', () => {
    const rolled = byEndpoint(
      [
        request({
          status: '200',
          count: 8,
          failed: 0,
          percentiles: { p50: 80, p90: 90, p95: 100, p99: 110 },
        }),
        request({
          status: '500',
          count: 2,
          failed: 2,
          percentiles: { p50: 700, p90: 900, p95: 3000, p99: 3200 },
        }),
      ],
      'p95'
    )

    expect(rolled).toEqual([
      { name: 'GET /api/users', count: 10, failed: 2, value: 3000 },
    ])
  })
})

describe('evaluateSla', () => {
  it('returns nothing while the SLA is off', () => {
    expect(evaluateSla(runStats({}), DEFAULT_SLA)).toBeNull()
  })

  it('passes a run inside both ceilings', () => {
    const verdict = evaluateSla(
      runStats({ groups: [group({})], requestStats: [request({})] }),
      sla
    )

    expect(verdict?.passed).toBe(true)
    expect(verdict?.rows).toHaveLength(3)
  })

  it('fails the transaction over the response-time ceiling, and the run with it', () => {
    const verdict = evaluateSla(
      runStats({
        groups: [
          group({ percentiles: { p50: 900, p90: 2100, p95: 2400, p99: 2600 } }),
        ],
      }),
      sla
    )

    expect(verdict?.passed).toBe(false)
    expect(verdict?.failedRows).toBe(1)
    expect(verdict?.rows[1]).toMatchObject({
      scope: 'transaction',
      name: 'Login',
      breached: ['responseTime'],
    })
  })

  it('fails an endpoint over the error ceiling', () => {
    const verdict = evaluateSla(
      runStats({
        requestStats: [request({ count: 100, failed: 5 })],
      }),
      sla
    )

    expect(verdict?.rows[1]).toMatchObject({
      scope: 'request',
      errorRate: 5,
      breached: ['errorRate'],
    })
  })

  it('does not fail a row whose statistic the run never recorded', () => {
    const verdict = evaluateSla(
      runStats({ groups: [group({ avg: 9000, max: 9000 })] }),
      sla
    )

    expect(verdict?.rows[1]).toMatchObject({ responseTime: null, passed: true })
  })
})

describe('a group whose saved failures outnumber its executions', () => {
  it('clamps the error rate at 100%', () => {
    const verdict = evaluateSla(
      runStats({ groups: [group({ count: 100, failed: 104 })] }),
      sla
    )

    expect(verdict?.rows[1]).toMatchObject({ errorRate: 100, passed: false })
  })
})
