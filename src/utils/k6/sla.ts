import { z } from 'zod'

import { Percentiles, RequestStats, RunStats } from './stats'

/** The statistic the ceiling is read against — what a contract names. */
export const SLA_STATISTICS = [
  'avg',
  'p50',
  'p90',
  'p95',
  'p99',
  'max',
] as const

export const SlaSchema = z.object({
  enabled: z.boolean(),
  statistic: z.enum(SLA_STATISTICS),
  /** Response-time ceiling in milliseconds. */
  responseTimeMs: z.number().nonnegative(),
  /** Error-rate ceiling, as a percentage of that row's executions. */
  errorRatePercent: z.number().min(0).max(100),
})

export type Sla = z.infer<typeof SlaSchema>
export type SlaStatistic = Sla['statistic']

export const DEFAULT_SLA: Sla = {
  enabled: false,
  statistic: 'p95',
  responseTimeMs: 2000,
  errorRatePercent: 1,
}

/** Which level of the run a row measures. */
export type SlaScope = 'run' | 'transaction' | 'request'

export type SlaBreach = 'responseTime' | 'errorRate'

export interface SlaRow {
  scope: SlaScope
  name: string
  /** Executions: requests for a request row, group executions otherwise. */
  count: number
  failed: number
  /** null when the run never recorded the chosen statistic — see `statValue`. */
  responseTime: number | null
  /** Percent, 0-100. */
  errorRate: number
  passed: boolean
  breached: SlaBreach[]
}

export interface SlaVerdict {
  /** False as soon as one row crosses a ceiling. */
  passed: boolean
  rows: SlaRow[]
  failedRows: number
}

interface Timings {
  avg: number
  max: number
  percentiles?: Percentiles
}

/**
 * The configured statistic out of a set of timings. Percentiles are missing
 * from results saved before the distribution was collected, and a run that
 * never recorded the statistic cannot be judged against it — null, so the row
 * reports "not recorded" rather than passing at 0 ms.
 */
export function statValue(statistic: SlaStatistic, timings: Timings) {
  switch (statistic) {
    case 'avg':
      return timings.avg
    case 'max':
      return timings.max
    default:
      return timings.percentiles?.[statistic] ?? null
  }
}

function slaRow(
  scope: SlaScope,
  name: string,
  count: number,
  failed: number,
  responseTime: number | null,
  sla: Sla
): SlaRow {
  // Clamped: a result saved before `failedExecutions` capped a group's failures
  // at its executions can carry more failures than runs, and a sign-off report
  // cannot print 104%. Only ever clamps a row that already missed the ceiling.
  const errorRate = count === 0 ? 0 : Math.min(100, (failed / count) * 100)

  const breached: SlaBreach[] = []

  if (responseTime !== null && responseTime > sla.responseTimeMs) {
    breached.push('responseTime')
  }

  if (errorRate > sla.errorRatePercent) {
    breached.push('errorRate')
  }

  return {
    scope,
    name,
    count,
    failed,
    responseTime,
    errorRate,
    passed: breached.length === 0,
    breached,
  }
}

/**
 * Requests rolled up per endpoint. `requestStats` splits a request by status,
 * so an endpoint answering both 200 and 500 arrives as two rows — and the 500
 * row alone always reads as a 100% error rate. An SLA is given per endpoint,
 * so the statuses are summed back together first.
 */
export function byEndpoint(requests: RequestStats[], statistic: SlaStatistic) {
  const endpoints = new Map<
    string,
    { name: string; count: number; failed: number; value: number | null }
  >()

  for (const request of requests) {
    const key = `${request.method}|${request.name}`
    const value = statValue(statistic, request)
    const existing = endpoints.get(key)

    if (existing === undefined) {
      endpoints.set(key, {
        name: [request.method, request.name].filter(Boolean).join(' '),
        count: request.count,
        failed: request.failed,
        value,
      })

      continue
    }

    existing.count += request.count
    existing.failed += request.failed
    // ponytail: worst status wins — percentiles of two status buckets cannot be
    // merged without their histograms. Conservative, so it never reports an
    // endpoint as inside the ceiling when one of its statuses was not.
    existing.value =
      value === null || existing.value === null
        ? (existing.value ?? value)
        : Math.max(existing.value, value)
  }

  return [...endpoints.values()]
}

/**
 * The run judged against the SLA: the totals, then every transaction, then
 * every endpoint. One row crossing a ceiling fails the run — the verdict a
 * sign-off report carries.
 */
export function evaluateSla(
  stats: RunStats | null,
  sla: Sla
): SlaVerdict | null {
  if (stats === null || !sla.enabled) {
    return null
  }

  const rows: SlaRow[] = [
    slaRow(
      'run',
      'All requests',
      stats.requests,
      stats.failedRequests,
      statValue(sla.statistic, {
        avg: stats.avgDuration,
        max: stats.maxDuration,
        percentiles: stats.percentiles,
      }),
      sla
    ),
    ...stats.groups.map((group) =>
      slaRow(
        'transaction',
        group.name,
        group.count,
        group.failed,
        statValue(sla.statistic, group),
        sla
      )
    ),
    ...byEndpoint(stats.requestStats, sla.statistic).map((endpoint) =>
      slaRow(
        'request',
        endpoint.name,
        endpoint.count,
        endpoint.failed,
        endpoint.value,
        sla
      )
    ),
  ]

  const failedRows = rows.filter((row) => !row.passed).length

  return { passed: failedRows === 0, rows, failedRows }
}

/** How the ceiling reads in a heading: `p95 ≤ 2000 ms, lỗi ≤ 1%`. */
export function describeSla(sla: Sla) {
  return `${sla.statistic} ≤ ${sla.responseTimeMs} ms · error ≤ ${sla.errorRatePercent}%`
}
