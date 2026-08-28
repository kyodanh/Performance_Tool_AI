import { describe, expect, it } from 'vitest'

import { RunStats } from '@/utils/k6/stats'

import { buildReportHtml, reportHeaderText } from './index'

function makeStats(overrides: Partial<RunStats> = {}): RunStats {
  return {
    buckets: [
      {
        time: 1000,
        vus: 1,
        requests: 2,
        failed: 0,
        duration: 120,
        throughput: 900,
      },
      {
        time: 1001,
        vus: 9,
        requests: 4,
        failed: 1,
        duration: 140,
        throughput: 1800,
      },
    ],
    generators: [],
    elapsed: 2,
    vus: 9,
    vusMax: 9,
    requests: 6,
    failedRequests: 1,
    iterations: 3,
    droppedIterations: 0,
    checksPassed: 5,
    checksFailed: 1,
    dataReceived: 2700,
    avgDuration: 130,
    maxDuration: 200,
    timings: {
      blocked: 1,
      connecting: 2,
      tlsHandshaking: 3,
      sending: 1,
      waiting: 100,
      receiving: 5,
    },
    groups: [
      {
        name: '01_Trans_Update_Project',
        count: 3,
        failed: 1,
        avg: 140,
        max: 193,
        min: 132,
        std: 8,
        last: 140,
        series: [
          { time: 1000, value: 132 },
          { time: 1001, value: 193 },
        ],
      },
    ],
    requestStats: [
      {
        method: 'POST',
        name: 'https://example.test/api/<project>',
        status: '200',
        group: '01_Trans_Update_Project',
        count: 6,
        failed: 1,
        avg: 130,
        max: 200,
      },
    ],
    checks: [
      {
        name: 'status is 200',
        group: '01_Trans_Update_Project',
        request: '',
        passes: 5,
        fails: 1,
      },
    ],
    errors: [
      {
        code: '1500',
        message: '',
        url: 'https://example.test/api',
        group: '',
        count: 1,
      },
    ],
    ...overrides,
  }
}

const META = {
  title: 'Pro360_Performance_Report',
  testName: 'Pro360_Performance',
  author: 'QC QA',
  organization: 'FIS',
}

describe('buildReportHtml', () => {
  it('renders every section of the report', () => {
    const html = buildReportHtml(makeStats(), META)

    for (const section of [
      'General Details',
      'Workload Characteristics',
      'Performance Overview',
      'HTTP Responses Summary',
      'Request Layers Breakdown',
      'Transaction Summary',
      'Worst Requests (by average response time)',
      'Checks',
      'Errors',
      'Running VUs',
      'Hits per Second',
      'Throughput',
      'Average Transaction Response Time',
      'Terminology',
    ]) {
      expect(html).toContain(section)
    }

    // Charts must plot, not silently fall back to the empty state.
    expect(html).not.toContain('No samples were recorded')
    expect(html.match(/<svg/g)?.length).toBe(5)
  })

  it('adds a load generator page only for a distributed run', () => {
    expect(buildReportHtml(makeStats(), META)).not.toContain('Load Generators')

    // A remote-only run has a single source, but naming it still matters.
    const remoteOnly = makeStats({
      generators: [
        {
          source: 'gen-b',
          vus: 6,
          vusMax: 6,
          requests: 20,
          failedRequests: 2,
          iterations: 7,
          dataReceived: 1800,
          avgDuration: 400,
          maxDuration: 480,
        },
      ],
    })

    expect(buildReportHtml(remoteOnly, META)).toContain('Load Generators')

    const distributed = makeStats({
      generators: [
        {
          source: 'local',
          vus: 4,
          vusMax: 5,
          requests: 10,
          failedRequests: 0,
          iterations: 3,
          dataReceived: 900,
          avgDuration: 120,
          maxDuration: 140,
        },
        {
          source: 'gen-b',
          vus: 6,
          vusMax: 6,
          requests: 20,
          failedRequests: 2,
          iterations: 7,
          dataReceived: 1800,
          avgDuration: 400,
          maxDuration: 480,
        },
      ],
    })

    const html = buildReportHtml(distributed, META)

    expect(html).toContain('Load Generators')
    expect(html).toContain('This machine')
    expect(html).toContain('gen-b')
  })

  it('escapes values that would otherwise break the document', () => {
    const html = buildReportHtml(makeStats(), META)

    expect(html).toContain('&lt;project&gt;')
    expect(html).not.toContain('/api/<project>')
  })

  it('reports the failure counts the run actually had', () => {
    const html = buildReportHtml(makeStats(), META)

    // 3 group executions, 1 attributed failure -> 2 passed, 66.7% success.
    expect(html).toContain('66.7')
  })

  it('survives a run that produced no samples at all', () => {
    const empty = makeStats({
      buckets: [],
      groups: [],
      requestStats: [],
      checks: [],
      errors: [],
    })

    expect(() => buildReportHtml(empty, META)).not.toThrow()
    expect(buildReportHtml(empty, META)).toContain('No samples were recorded')
  })

  it('stamps the page header with the run date and title', () => {
    expect(reportHeaderText(makeStats(), META)).toContain(
      'Report Title: Pro360_Performance_Report'
    )
  })
})
