import { describe, expect, it } from 'vitest'

import { buildRunMarkdown } from './runMarkdown'
import { DEFAULT_SLA } from './sla'
import { RunStats, StatsBucket } from './stats'

function buckets(count: number): StatsBucket[] {
  return Array.from({ length: count }, (_, index) => ({
    time: 1_700_000_000 + index,
    vus: index + 1,
    requests: 2,
    failed: index % 2,
    duration: 100,
    throughput: 500,
  }))
}

function runStats(partial: Partial<RunStats> = {}): RunStats {
  return {
    buckets: [],
    elapsed: 10,
    vus: 5,
    vusMax: 10,
    requests: 20,
    failedRequests: 1,
    iterations: 10,
    failedIterations: 1,
    failedIterationsCapped: false,
    droppedIterations: 0,
    checksPassed: 9,
    checksFailed: 1,
    dataReceived: 4096,
    avgDuration: 100,
    maxDuration: 300,
    percentiles: { p50: 90, p90: 150, p95: 180, p99: 290 },
    timings: {
      blocked: 1,
      connecting: 2,
      tlsHandshaking: 3,
      sending: 4,
      waiting: 80,
      receiving: 5,
    },
    groups: [],
    requestStats: [],
    checks: [],
    errors: [],
    generators: [],
    ...partial,
  } as RunStats
}

const input = (partial: Partial<RunStats> = {}) => ({
  stats: runStats(partial),
  testName: 'Checkout',
})

describe('buildRunMarkdown', () => {
  it('keeps every request row rather than capping them', () => {
    const requestStats = Array.from({ length: 40 }, (_, index) => ({
      method: 'GET',
      name: `/api/item-${index}`,
      status: '200',
      group: '',
      count: 1,
      failed: 0,
      avg: 10,
      max: 20,
      min: 5,
      total: 10,
      std: 1,
      serverTime: 8,
    }))

    const markdown = buildRunMarkdown(input({ requestStats }))

    expect(markdown.match(/\/api\/item-\d+/g)).toHaveLength(40)
  })

  it('carries the per-second samples as CSV for charting', () => {
    const markdown = buildRunMarkdown(input({ buckets: buckets(3) }))
    const rows = markdown.slice(markdown.indexOf('```csv')).split('\n')

    expect(markdown).toContain('## Time series (CSV, 3 points)')
    expect(rows[1]).toBe(
      'time_unix_s,vus,requests,failed,avg_duration_ms,bytes_received,seconds_merged'
    )
    expect(rows[2]).toBe('1700000000,1,2,0,100,500,1')
  })

  it('merges the samples of a long run down to the point cap', () => {
    const markdown = buildRunMarkdown(input({ buckets: buckets(1500) }))
    const rows = markdown.slice(markdown.indexOf('```csv')).split('\n')

    // 1500 seconds over a 600-point cap merges 3 seconds per row.
    expect(markdown).toContain('## Time series (CSV, 500 points)')
    expect(rows[2]).toBe('1700000000,3,6,1,100,1500,3')
  })

  it('judges the run against the SLA it was saved with', () => {
    const markdown = buildRunMarkdown({
      ...input(),
      sla: { ...DEFAULT_SLA, enabled: true, responseTimeMs: 100 },
    })

    expect(markdown).toContain('p95 ≤ 100 ms')
    expect(markdown).toContain('FAIL — 1 row(s) over the ceiling')
    expect(markdown).toContain('| run | All requests | 20 | 1 | 180 | 5.00 |')
  })

  it('escapes a pipe in a name so the table row survives', () => {
    const markdown = buildRunMarkdown(
      input({
        checks: [
          {
            name: 'status 200 | fast',
            group: '',
            request: '',
            passes: 1,
            fails: 0,
          },
        ],
      })
    )

    expect(markdown).toContain('| status 200 \\| fast |')
  })
})
