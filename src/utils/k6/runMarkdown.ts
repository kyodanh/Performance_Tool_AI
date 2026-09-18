import { describeSla, evaluateSla, Sla } from './sla'
import { GroupStats, Percentiles, RequestStats, RunStats } from './stats'

/**
 * Seconds of time series carried over. A run longer than this is aggregated
 * into that many points — enough to draw every chart, short enough to paste.
 */
const MAX_SERIES_POINTS = 600

const INTENT = [
  'Below is the complete data of one k6 load test run.',
  '',
  'Analyze it end to end: how the target performed, which transactions and endpoints are the bottleneck, what the errors say, and whether the run met its SLA. Then draw charts from the CSV time series at the end — response time, throughput (requests/s and bytes/s), VUs, and errors over time — plus a bar chart of the slowest transactions.',
  'Reference the names and numbers in the data, not generic advice.',
  // ponytail: hard-coded — the app has no locale setting to read.
  'Answer in Vietnamese. Keep metric names, transaction names, URLs and k6 terms as they appear in the data.',
]

/** A cell of a Markdown table — a pipe in a name would split the row. */
function cell(value: string) {
  return value.replace(/\|/g, '\\|')
}

function ms(value: number | null | undefined) {
  return value === null || value === undefined ? '—' : value.toFixed(0)
}

function percentileCells(percentiles: Percentiles | undefined) {
  return [
    ms(percentiles?.p50),
    ms(percentiles?.p90),
    ms(percentiles?.p95),
    ms(percentiles?.p99),
  ]
}

function table(headers: string[], rows: string[][]) {
  if (rows.length === 0) {
    return '(none)'
  }

  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.join(' | ')} |`),
  ].join('\n')
}

function summaryLines(stats: RunStats) {
  const { timings: t } = stats

  return [
    `- VUs: ${stats.vus} running / ${stats.vusMax} peak`,
    `- Elapsed: ${stats.elapsed}s`,
    `- Iterations: ${stats.iterations} (${stats.failedIterations} with a failed request${stats.failedIterationsCapped ? ', capped' : ''}, ${stats.droppedIterations} dropped)`,
    `- Requests: ${stats.requests} (${stats.failedRequests} failed)`,
    `- Checks: ${stats.checksPassed} passed / ${stats.checksFailed} failed`,
    `- Response time (ms): avg ${ms(stats.avgDuration)}, max ${ms(stats.maxDuration)}, p50 ${ms(stats.percentiles?.p50)}, p90 ${ms(stats.percentiles?.p90)}, p95 ${ms(stats.percentiles?.p95)}, p99 ${ms(stats.percentiles?.p99)}`,
    `- Data received: ${stats.dataReceived} bytes`,
    `- Timing breakdown (ms): blocked ${ms(t.blocked)}, connecting ${ms(t.connecting)}, TLS ${ms(t.tlsHandshaking)}, sending ${ms(t.sending)}, waiting ${ms(t.waiting)}, receiving ${ms(t.receiving)}`,
    `- Load generators: ${stats.generators.map((generator) => `${generator.source} (${generator.requests} requests, ${generator.failedRequests} failed)`).join(', ') || '(none)'}`,
  ]
}

function slaSection(stats: RunStats, sla: Sla | undefined) {
  const verdict = sla === undefined ? null : evaluateSla(stats, sla)

  if (sla === undefined || verdict === null) {
    return '(no SLA was set for this run)'
  }

  return [
    `- Ceiling: ${describeSla(sla)}`,
    `- Verdict: ${verdict.passed ? 'PASS' : `FAIL — ${verdict.failedRows} row(s) over the ceiling`}`,
    '',
    table(
      [
        'Scope',
        'Name',
        'Executions',
        'Failed',
        `${sla.statistic} (ms)`,
        'Errors %',
        'Verdict',
      ],
      verdict.rows.map((row) => [
        row.scope,
        cell(row.name),
        String(row.count),
        String(row.failed),
        ms(row.responseTime),
        row.errorRate.toFixed(2),
        row.passed ? 'pass' : `FAIL (${row.breached.join(', ')})`,
      ])
    ),
  ].join('\n')
}

function transactionRows(groups: GroupStats[]) {
  return groups.map((group) => [
    cell(group.name),
    String(group.count),
    String(group.failed),
    ms(group.avg),
    ms(group.min),
    ms(group.max),
    ms(group.std),
    ...percentileCells(group.percentiles),
    ms(group.last),
  ])
}

function requestRows(requests: RequestStats[]) {
  return requests.map((request) => [
    request.method,
    cell(request.name),
    request.status,
    cell(request.group),
    String(request.count),
    String(request.failed),
    ms(request.avg),
    ms(request.min),
    ms(request.max),
    ms(request.std),
    ...percentileCells(request.percentiles),
    ms(request.serverTime),
  ])
}

/**
 * The per-second samples, aggregated into at most `MAX_SERIES_POINTS` rows so
 * an hour-long run still pastes into a chat. Counts are summed and concurrency
 * takes the peak, so a spike survives the aggregation rather than being
 * averaged away.
 */
function seriesRows(stats: RunStats) {
  const step = Math.max(1, Math.ceil(stats.buckets.length / MAX_SERIES_POINTS))
  const rows: string[][] = []

  for (let index = 0; index < stats.buckets.length; index += step) {
    const chunk = stats.buckets.slice(index, index + step)
    const first = chunk[0]

    if (first === undefined) {
      continue
    }

    const requests = chunk.reduce((total, bucket) => total + bucket.requests, 0)
    // Weighted by the requests each second carried, so a quiet second cannot
    // pull the average as hard as a busy one.
    const weighted = chunk.reduce(
      (total, bucket) => total + bucket.duration * bucket.requests,
      0
    )

    rows.push([
      String(first.time),
      String(Math.max(...chunk.map((bucket) => bucket.vus))),
      String(requests),
      String(chunk.reduce((total, bucket) => total + bucket.failed, 0)),
      ms(requests === 0 ? 0 : weighted / requests),
      String(chunk.reduce((total, bucket) => total + bucket.throughput, 0)),
      String(chunk.length),
    ])
  }

  return rows
}

export interface RunMarkdownInput {
  stats: RunStats
  testName: string
  /** The saved version this run came from, when it has one. */
  label?: string
  sla?: Sla
}

/**
 * One run as a whole Markdown document — every transaction, endpoint, check and
 * error, plus the time series as CSV so a chat model can plot it. Uncapped, in
 * contrast to the prompt the in-app analysis sends.
 */
export function buildRunMarkdown({
  stats,
  testName,
  label,
  sla,
}: RunMarkdownInput): string {
  const series = seriesRows(stats)

  return [
    `# k6 load test run — ${testName}${label === undefined ? '' : ` (${label})`}`,
    '',
    ...INTENT,
    '',
    '## Run summary',
    summaryLines(stats).join('\n'),
    '',
    '## SLA',
    slaSection(stats, sla),
    '',
    '## Transactions',
    table(
      [
        'Name',
        'Executions',
        'Failed',
        'Avg',
        'Min',
        'Max',
        'Std',
        'p50',
        'p90',
        'p95',
        'p99',
        'Last',
      ],
      transactionRows(stats.groups)
    ),
    '',
    '## Requests',
    table(
      [
        'Method',
        'Name',
        'Status',
        'Group',
        'Count',
        'Failed',
        'Avg',
        'Min',
        'Max',
        'Std',
        'p50',
        'p90',
        'p95',
        'p99',
        'Server time',
      ],
      requestRows(stats.requestStats)
    ),
    '',
    '## Checks',
    table(
      ['Name', 'Group', 'Request', 'Passed', 'Failed'],
      stats.checks.map((check) => [
        cell(check.name),
        cell(check.group),
        cell(check.request),
        String(check.passes),
        String(check.fails),
      ])
    ),
    '',
    '## Errors',
    table(
      ['Code', 'Message', 'URL', 'Group', 'Count', 'Data rows'],
      stats.errors.map((error) => [
        cell(error.code || '—'),
        cell(error.message || '—'),
        cell(error.url),
        cell(error.group),
        String(error.count),
        cell(error.dataRows.join(' ')),
      ])
    ),
    '',
    `## Time series (CSV, ${series.length} points)`,
    '```csv',
    'time_unix_s,vus,requests,failed,avg_duration_ms,bytes_received,seconds_merged',
    ...series.map((row) => row.join(',')),
    '```',
  ].join('\n')
}
