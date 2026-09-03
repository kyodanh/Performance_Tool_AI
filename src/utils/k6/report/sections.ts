import { describeCode, describeError } from '@/components/Validator/format'
import { isDistributedRun, LOCAL_SOURCE, RunStats } from '@/utils/k6/stats'

import { SERIES_COLORS, stackedBar } from './charts'
import {
  bytes,
  count,
  decimal,
  escapeHtml,
  percentile,
  seconds,
  summarize,
  timestamp,
} from './format'

/** The data tables of the performance report, each returning an HTML string. */

interface Row {
  label: string
  value: string
}

export function definitionTable(title: string, rows: Row[]) {
  const body = rows
    .map(
      (row) =>
        `<tr><th scope="row">${escapeHtml(row.label)}</th><td>${escapeHtml(row.value)}</td></tr>`
    )
    .join('')

  return `<h2>${escapeHtml(title)}</h2><table class="definition">${body}</table>`
}

function table(headers: string[], rows: string[][]) {
  if (rows.length === 0) {
    return '<p class="empty">Nothing was recorded.</p>'
  }

  const head = headers
    .map((header) => `<th>${escapeHtml(header)}</th>`)
    .join('')
  const body = rows
    .map(
      (row) =>
        `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`
    )
    .join('')

  return `<table class="data"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`
}

/** The `Filter` line an analysis report prints above a filtered table. */
function filterLine(text: string) {
  return `<p class="filter"><span>Filter</span>${escapeHtml(text)}</p>`
}

/** Groups are k6's transactions, so pass/fail is derived the way the UI does. */
export function transactionCounts(stats: RunStats) {
  const passed = stats.groups.reduce(
    (sum, group) => sum + Math.max(0, group.count - group.failed),
    0
  )
  const failed = stats.groups.reduce((sum, group) => sum + group.failed, 0)

  return { passed, failed, total: passed + failed }
}

export function weightedResponseTime(stats: RunStats) {
  const samples = stats.groups.reduce((sum, group) => sum + group.count, 0)

  if (samples === 0) {
    return 0
  }

  return (
    stats.groups.reduce((sum, group) => sum + group.avg * group.count, 0) /
    samples
  )
}

/**
 * Transactions that completed during each second of the run, summed across
 * groups — the series behind the "Total Transactions per Second" summary.
 */
export function transactionsPerSecond(stats: RunStats) {
  const perSecond = new Map<number, number>()

  for (const group of stats.groups) {
    for (const sample of group.series) {
      perSecond.set(
        sample.time,
        (perSecond.get(sample.time) ?? 0) + sample.count
      )
    }
  }

  return [...perSecond.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, value]) => value)
}

export function executiveSummarySection(stats: RunStats) {
  const { passed, failed, total } = transactionCounts(stats)
  const errors = stats.errors.reduce((sum, error) => sum + error.count, 0)
  const rate = total === 0 ? 0 : (passed / total) * 100

  const conclusions = [
    `The run replayed ${count(stats.iterations)} iteration(s) with up to ${count(stats.vusMax)} concurrent VUs, issuing ${count(stats.requests)} requests over ${count(stats.groups.length)} transaction(s).`,
    `${count(passed)} transaction execution(s) passed and ${count(failed)} failed, a success rate of ${decimal(rate)}%.`,
    `The weighted average transaction response time was ${seconds(weightedResponseTime(stats))} s, with ${count(stats.failedRequests)} failed request(s) and ${count(errors)} error(s) recorded.`,
  ]

  return `<h2>Executive Summary</h2><h3>Conclusions</h3>${conclusions
    .map((line) => `<p class="description">${escapeHtml(line)}</p>`)
    .join('')}`
}

interface RunNames {
  /** The run the report covers — the analysis report's `Run Name`. */
  runName: string
  /** The script that was replayed. */
  scriptName: string
}

/**
 * The scenario the run executed, in the shape a controller reports it. Think
 * time and pacing are omitted: k6 keeps no run-level record of either, and a
 * placeholder would read as a measurement.
 */
export function businessProcessSection(stats: RunStats, names: RunNames) {
  const elapsed = Math.max(1, stats.elapsed)
  const { passed } = transactionCounts(stats)
  const start = stats.buckets[0]?.time ?? 0

  const rows = [
    [
      names.runName,
      names.scriptName,
      names.scriptName,
      count(stats.vusMax),
      '100',
      decimal((passed / elapsed) * 3600),
      timestamp(start),
    ],
    ['Total:', '', '', count(stats.vusMax), '100%', '', ''],
  ]

  return `<h2>Business Process</h2>${table(
    [
      'Run Name',
      'Group Name',
      'Script Name',
      'Concurrent VUs',
      '% of Total VUs',
      'Transactions per Hour',
      'Start Time',
    ],
    rows
  )}`
}

/** The transactions the script declares, numbered the way the report lists them. */
export function scriptTransactionsSection(stats: RunStats, names: RunNames) {
  const rows = stats.groups.map((group, index) => [
    String(index + 1),
    group.name,
  ])

  return `<h3>Script: ${escapeHtml(names.scriptName)}</h3>${table(
    ['#', 'Transaction'],
    rows
  )}`
}

export function workloadSection(stats: RunStats) {
  const elapsed = Math.max(1, stats.elapsed)
  const { passed } = transactionCounts(stats)

  return definitionTable('Workload Characteristics', [
    { label: 'Max Running VUs', value: count(stats.vusMax) },
    {
      label: 'Average Hits per Second',
      value: decimal(stats.requests / elapsed),
    },
    { label: 'Total Hits', value: count(stats.requests) },
    {
      label: 'Total Passed Transactions per Second',
      value: decimal(passed / elapsed),
    },
    {
      label: 'Total Passed Transactions per Minute',
      value: decimal((passed / elapsed) * 60),
    },
    { label: 'Total Transactions Number', value: count(stats.groups.length) },
    { label: 'Total Iterations', value: count(stats.iterations) },
    { label: 'Dropped Iterations', value: count(stats.droppedIterations) },
    { label: 'Data Received', value: bytes(stats.dataReceived) },
  ])
}

export interface MeasurementRow {
  /** Index into the series palette, so the swatch matches the chart line. */
  color: number
  /** The graph the series belongs to. Omitted on a single-graph page. */
  graph?: string
  measurement: string
  values: number[]
  digits?: number
  /** Divides every value before printing, e.g. ms → s. */
  scale?: number
}

/**
 * The `Color / Scale / Measurement / Minimum / Average / …` block every graph
 * in an analysis report carries.
 */
export function measurementTable(rows: MeasurementRow[]) {
  const withGraph = rows.some((row) => row.graph !== undefined)

  const headers = [
    'Color',
    ...(withGraph ? ['Graph'] : []),
    'Scale',
    'Measurement',
    'Minimum',
    'Average',
    'Maximum',
    'Median',
    'Std. Deviation',
  ]

  const head = headers.map((header) => `<th>${header}</th>`).join('')
  const body = rows
    .map((row) => {
      const stats = summarize(
        row.values.map((value) => value / (row.scale ?? 1))
      )
      const format = (value: number) => decimal(value, row.digits ?? 3)
      const swatch = `<span class="swatch" style="background:${SERIES_COLORS[row.color % SERIES_COLORS.length]}"></span>`

      return `<tr>
        <td>${swatch}</td>
        ${withGraph ? `<td>${escapeHtml(row.graph ?? '')}</td>` : ''}
        <td>1</td>
        <td>${escapeHtml(row.measurement)}</td>
        <td>${format(stats.min)}</td>
        <td>${format(stats.avg)}</td>
        <td>${format(stats.max)}</td>
        <td>${format(stats.median)}</td>
        <td>${format(stats.std)}</td>
      </tr>`
    })
    .join('')

  return `<table class="data"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`
}

/** The two-series summary the report prints under Workload Characteristics. */
export function workloadSummaryTable(stats: RunStats) {
  return measurementTable([
    {
      color: 0,
      graph: 'Running VUs',
      measurement: 'Run',
      values: stats.buckets.map((bucket) => bucket.vus),
    },
    {
      color: 1,
      graph: 'Total Transactions per Second',
      measurement: 'All',
      values: transactionsPerSecond(stats),
    },
  ])
}

export function overviewSection(stats: RunStats, names: RunNames) {
  const elapsed = Math.max(1, stats.elapsed)
  const { passed, failed, total } = transactionCounts(stats)
  const errors = stats.errors.reduce((sum, error) => sum + error.count, 0)

  return definitionTable('Performance Overview', [
    { label: 'Run Name', value: names.runName },
    {
      label: 'Weighted Average of Transaction Response Time',
      value: `${seconds(weightedResponseTime(stats))} s`,
    },
    {
      label: 'Average Request Response Time',
      value: `${seconds(stats.avgDuration)} s`,
    },
    {
      label: 'Maximum Request Response Time',
      value: `${seconds(stats.maxDuration)} s`,
    },
    { label: 'Total Passed Transactions', value: count(passed) },
    { label: 'Total Failed Transactions', value: count(failed) },
    {
      label: 'Transactions Success Rate, %',
      value: total === 0 ? '0' : decimal((passed / total) * 100),
    },
    { label: 'Total Failed Requests', value: count(stats.failedRequests) },
    { label: 'Total Errors per Second', value: decimal(errors / elapsed, 2) },
    { label: 'Total Errors', value: count(errors) },
    { label: 'Checks Passed', value: count(stats.checksPassed) },
    { label: 'Checks Failed', value: count(stats.checksFailed) },
  ])
}

export function httpResponsesSection(stats: RunStats) {
  const elapsed = Math.max(1, stats.elapsed)
  const totals = new Map<string, number>()

  for (const request of stats.requestStats) {
    const status = request.status === '' ? '0' : request.status
    totals.set(status, (totals.get(status) ?? 0) + request.count)
  }

  const rows = [...totals.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([status, total]) => [
      status === '0' ? 'No response' : `HTTP_${status}`,
      count(total),
      decimal(total / elapsed),
    ])

  return `<h2>HTTP Responses Summary</h2>${table(
    ['HTTP Response Name', 'Total', 'Per Second'],
    rows
  )}`
}

export function transactionSummarySection(stats: RunStats, names: RunNames) {
  const rows = [...stats.groups]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((group) => [
      names.runName,
      group.name,
      seconds(group.min),
      seconds(group.avg),
      seconds(group.max),
      seconds(group.std),
      // ponytail: p90 of the per-second averages, the only distribution k6's
      // CSV keeps. Switch to the raw samples if a true p90 is ever needed.
      seconds(
        percentile(
          group.series.map((sample) => sample.value),
          0.9
        )
      ),
      count(Math.max(0, group.count - group.failed)),
      count(group.failed),
      // k6 never stops a transaction mid-flight, so the column is always zero.
      '0',
    ])

  return `<h2>Transaction Summary</h2>${filterLine(
    'Transaction End Status = (Pass, Fail)'
  )}${table(
    [
      'Run Name',
      'Transaction Name',
      'Minimum',
      'Average',
      'Maximum',
      'Std. Deviation',
      '90%',
      'Pass Count',
      'Fail Count',
      'Stop Count',
    ],
    rows
  )}`
}

/** Columns shared by the URL rankings, all in seconds. */
function urlRow(request: RunStats['requestStats'][number]) {
  return [
    request.name,
    request.group === '' ? '—' : request.group,
    count(request.count),
    seconds(request.total),
    seconds(request.min),
    seconds(request.max),
    seconds(request.avg),
    seconds(request.std),
  ]
}

const URL_HEADERS = [
  'URL name',
  'Parent transaction name',
  'Count',
  'Total',
  'Min',
  'Max',
  'Avg',
  'StdDev',
]

export function worstUrlsSection(stats: RunStats, limit = 15) {
  const rows = [...stats.requestStats]
    .sort((a, b) => b.avg - a.avg)
    .slice(0, limit)
    .map(urlRow)

  return `<h2>Worst URLs (by average response time)</h2>${table(
    URL_HEADERS,
    rows
  )}${layersBreakdownChart(stats)}`
}

/** The stacked bar under the URL table: where the average response time goes. */
function layersBreakdownChart(stats: RunStats) {
  return stackedBar(
    [
      {
        label: 'DNS Resolution / Blocked',
        value: stats.timings.blocked / 1000,
      },
      { label: 'Connection', value: stats.timings.connecting / 1000 },
      { label: 'SSL Handshaking', value: stats.timings.tlsHandshaking / 1000 },
      { label: 'Sending', value: stats.timings.sending / 1000 },
      { label: 'First Buffer', value: stats.timings.waiting / 1000 },
      { label: 'Receive', value: stats.timings.receiving / 1000 },
    ],
    'seconds'
  )
}

export function resourceConsumingUrlsSection(stats: RunStats, limit = 15) {
  const rows = [...stats.requestStats]
    .sort((a, b) => b.serverTime - a.serverTime)
    .slice(0, limit)
    .map((request) => [
      request.name,
      request.group === '' ? '—' : request.group,
      count(request.count),
      seconds(request.serverTime),
      seconds(request.count === 0 ? 0 : request.serverTime / request.count),
    ])

  return `<h2>Most Resource Consuming URLs</h2>${table(
    [
      'URL name',
      'Parent transaction name',
      'Count',
      'Total server time',
      'Average server time',
    ],
    rows
  )}<p class="description">Ranks URLs by the time the server itself spent before sending the first byte, so a slow endpoint is separated from a slow connection.</p>`
}

export function timingsSection(stats: RunStats) {
  const phases: Array<[string, number]> = [
    ['Blocked', stats.timings.blocked],
    ['Connection', stats.timings.connecting],
    ['SSL Handshaking', stats.timings.tlsHandshaking],
    ['Sending', stats.timings.sending],
    ['First Buffer (TTFB)', stats.timings.waiting],
    ['Receive', stats.timings.receiving],
  ]

  const total = phases.reduce((sum, [, value]) => sum + value, 0)
  const rows = phases.map(([label, value]) => [
    label,
    seconds(value),
    total === 0 ? '0.0' : decimal((value / total) * 100),
  ])

  return `<h2>Request Layers Breakdown</h2>${table(
    ['Layer', 'Average', '% of response time'],
    rows
  )}`
}

export function checksSection(stats: RunStats) {
  const rows = stats.checks.map((check) => [
    check.name,
    check.group === '' ? '—' : check.group,
    count(check.passes),
    count(check.fails),
  ])

  return `<h2>Checks</h2>${table(
    ['Check', 'Transaction', 'Passed', 'Failed'],
    rows
  )}`
}

/**
 * Per-machine contribution. Omitted for a single-machine run, where it would
 * only restate the totals.
 */
export function loadGeneratorsSection(stats: RunStats) {
  if (!isDistributedRun(stats.generators)) {
    return ''
  }

  const rows = stats.generators.map((generator) => [
    generator.source === LOCAL_SOURCE ? 'This machine' : generator.source,
    count(generator.vusMax),
    count(generator.requests),
    count(generator.failedRequests),
    count(generator.iterations),
    seconds(generator.avgDuration),
    seconds(generator.maxDuration),
    bytes(generator.dataReceived),
  ])

  return `<h2>Load Generators</h2>${table(
    [
      'Machine',
      'Peak VUs',
      'Requests',
      'Failed',
      'Iterations',
      'Avg Response',
      'Max Response',
      'Data Received',
    ],
    rows
  )}<p class="description">Displays what each load generator contributed to the run. A generator with a markedly higher response time than the others points at that machine rather than at the target.</p>`
}

export function errorsSection(stats: RunStats) {
  const rows = stats.errors.map((error) => [
    describeCode(error),
    describeError(error),
    error.url,
    error.group === '' ? '—' : error.group,
    count(error.count),
  ])

  return `<h2>Errors</h2>${table(
    ['Code', 'Error', 'URL', 'Transaction', 'Count'],
    rows
  )}`
}
