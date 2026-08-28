import { describeCode, describeError } from '@/components/Validator/format'
import { isDistributedRun, LOCAL_SOURCE, RunStats } from '@/utils/k6/stats'

import { bytes, count, decimal, escapeHtml, seconds } from './format'

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

export function overviewSection(stats: RunStats) {
  const elapsed = Math.max(1, stats.elapsed)
  const { passed, failed, total } = transactionCounts(stats)
  const errors = stats.errors.reduce((sum, error) => sum + error.count, 0)

  return definitionTable('Performance Overview', [
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

export function transactionSummarySection(stats: RunStats) {
  const rows = [...stats.groups]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((group) => [
      group.name,
      seconds(group.min),
      seconds(group.avg),
      seconds(group.max),
      seconds(group.std),
      count(Math.max(0, group.count - group.failed)),
      count(group.failed),
    ])

  return `<h2>Transaction Summary</h2>${table(
    [
      'Transaction Name',
      'Minimum',
      'Average',
      'Maximum',
      'Std. Deviation',
      'Pass Count',
      'Fail Count',
    ],
    rows
  )}`
}

export function worstRequestsSection(stats: RunStats, limit = 15) {
  const rows = [...stats.requestStats]
    .sort((a, b) => b.avg - a.avg)
    .slice(0, limit)
    .map((request) => [
      `${request.method} ${request.name}`,
      request.group === '' ? '—' : request.group,
      request.status,
      count(request.count),
      seconds(request.avg),
      seconds(request.max),
      count(request.failed),
    ])

  return `<h2>Worst Requests (by average response time)</h2>${table(
    [
      'Request',
      'Parent transaction',
      'Status',
      'Count',
      'Average',
      'Maximum',
      'Failed',
    ],
    rows
  )}`
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
