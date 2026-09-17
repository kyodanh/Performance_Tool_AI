import { SlaRow, SlaVerdict } from '@/utils/k6/sla'
import { RunStats, StatsBucket } from '@/utils/k6/stats'

export type CompareFormat =
  | 'count'
  | 'time'
  | 'duration'
  | 'percent'
  | 'rate'
  | 'bytes'

export type Verdict = 'better' | 'worse' | 'same' | null

export interface CompareRow {
  label: string
  base: number | undefined
  current: number | undefined
  format: CompareFormat
  /** Change relative to the base, in percent; null when it can't be computed. */
  change: number | null
  verdict: Verdict
}

export interface TransactionCompareRow {
  name: string
  p90: CompareRow
  failRate: CompareRow
}

// ponytail: fixed 5% noise band, make it configurable if runs are noisier
const NOISE_PERCENT = 5

type Direction = 'lower' | 'higher' | null

function row(
  label: string,
  base: number | undefined,
  current: number | undefined,
  format: CompareFormat,
  better: Direction
): CompareRow {
  const change =
    base === undefined || current === undefined
      ? null
      : base === 0
        ? current === 0
          ? 0
          : null
        : ((current - base) / base) * 100

  let verdict: Verdict = null

  if (better !== null && base !== undefined && current !== undefined) {
    // A base of 0 has no percent change, but going from 0 to anything still
    // counts — 0 errors to 5 errors is a regression.
    const moved =
      change === null ? current !== base : Math.abs(change) >= NOISE_PERCENT

    if (!moved) {
      verdict = 'same'
    } else {
      const up = current > base
      verdict = up === (better === 'higher') ? 'better' : 'worse'
    }
  }

  return { label, base, current, format, change, verdict }
}

function rate(failed: number, total: number) {
  return total === 0 ? 0 : (failed / total) * 100
}

function throughput(stats: RunStats) {
  return stats.elapsed === 0 ? 0 : stats.requests / stats.elapsed
}

export interface CompareSection {
  title: string
  rows: CompareRow[]
}

/** Headline metrics of `current` against `base`, the run it is judged by. */
export function compareRuns(
  base: RunStats,
  current: RunStats
): CompareSection[] {
  const time = (label: string, pick: (stats: RunStats) => number | undefined) =>
    row(label, pick(base), pick(current), 'time', 'lower')

  return [
    {
      title: 'Load',
      rows: [
        row('Peak VUs', base.vusMax, current.vusMax, 'count', null),
        row('Duration', base.elapsed, current.elapsed, 'duration', null),
        row('Requests', base.requests, current.requests, 'count', null),
        row(
          'Requests/s',
          throughput(base),
          throughput(current),
          'rate',
          'higher'
        ),
      ],
    },
    {
      title: 'Errors',
      rows: [
        row(
          'Error rate',
          rate(base.failedRequests, base.requests),
          rate(current.failedRequests, current.requests),
          'percent',
          'lower'
        ),
        row(
          'Failed iterations',
          base.failedIterations,
          current.failedIterations,
          'count',
          'lower'
        ),
        row(
          'Failed checks',
          base.checksFailed,
          current.checksFailed,
          'count',
          'lower'
        ),
      ],
    },
    {
      title: 'Response time',
      rows: [
        time('Avg', (stats) => stats.avgDuration),
        time('Median', (stats) => stats.percentiles?.p50),
        time('90%', (stats) => stats.percentiles?.p90),
        time('95%', (stats) => stats.percentiles?.p95),
        time('99%', (stats) => stats.percentiles?.p99),
        time('Max', (stats) => stats.maxDuration),
        time('TTFB (waiting)', (stats) => stats.timings.waiting),
      ],
    },
    {
      title: 'Data',
      rows: [
        row(
          'Data received',
          base.dataReceived,
          current.dataReceived,
          'bytes',
          null
        ),
      ],
    },
  ]
}

// ponytail: 2x is a rough "not the same test shape" line, tune if it nags
const LOAD_RATIO = 2

/**
 * Why the two runs may not be a fair comparison: a run with a fraction of the
 * users or of the duration will look faster for reasons that aren't the target.
 */
export function loadMismatch(base: RunStats, current: RunStats): string[] {
  const apart = (a: number, b: number) =>
    Math.max(a, b) > LOAD_RATIO * Math.max(1, Math.min(a, b))

  return [
    apart(base.vusMax, current.vusMax) &&
      `peak VUs differ (${base.vusMax} vs ${current.vusMax})`,
    apart(base.elapsed, current.elapsed) &&
      `durations differ (${Math.round(base.elapsed)}s vs ${Math.round(current.elapsed)}s)`,
  ].filter((reason): reason is string => typeof reason === 'string')
}

/**
 * Transactions matched by name. One that only ran in one of the two runs still
 * gets a row, with the other side empty, so a renamed or dropped step shows.
 */
export function compareTransactions(
  base: RunStats,
  current: RunStats
): TransactionCompareRow[] {
  const names = [
    ...new Set([...current.groups, ...base.groups].map((group) => group.name)),
  ]

  return names.map((name) => {
    const a = base.groups.find((group) => group.name === name)
    const b = current.groups.find((group) => group.name === name)

    return {
      name,
      p90: row(
        '90%',
        a?.percentiles?.p90,
        b?.percentiles?.p90,
        'time',
        'lower'
      ),
      failRate: row(
        'Fail %',
        a && rate(a.failed, a.count),
        b && rate(b.failed, b.count),
        'percent',
        'lower'
      ),
    }
  })
}

/**
 * One metric of both runs on a shared x axis. The runs happened at different
 * times, so the base run is shifted to start when the current one did — both
 * lines then read as "seconds since the test started".
 */
export function overlaySeries(
  base: RunStats,
  current: RunStats,
  select: (bucket: StatsBucket) => number
) {
  const start = current.buckets[0]?.time ?? 0
  const shift = start - (base.buckets[0]?.time ?? 0)

  const samples = (stats: RunStats, offset: number) =>
    stats.buckets.map((bucket) => ({
      time: bucket.time + offset,
      value: select(bucket),
    }))

  const now = samples(current, 0)
  const before = samples(base, shift)
  const end = Math.max(now.at(-1)?.time ?? start, before.at(-1)?.time ?? start)

  return { now, before, start, end }
}

/**
 * Rows the current run misses the SLA on that the base run met — including a
 * transaction or endpoint the base never ran. Rows failing in both are old
 * news; these are what the change broke.
 */
export function slaRegressions(
  base: SlaVerdict | null,
  current: SlaVerdict | null
): SlaRow[] {
  if (current === null) {
    return []
  }

  const failedBefore = new Set(
    (base?.rows ?? [])
      .filter((row) => !row.passed)
      .map((row) => `${row.scope}|${row.name}`)
  )

  return current.rows.filter(
    (row) => !row.passed && !failedBefore.has(`${row.scope}|${row.name}`)
  )
}
