import { describeSla, evaluateSla, Sla, SlaScope } from '@/utils/k6/sla'
import { RunStats } from '@/utils/k6/stats'

import { count, decimal, escapeHtml, seconds } from './format'
import { table } from './sections'

const SCOPE_LABELS: Record<SlaScope, string> = {
  run: 'Run',
  transaction: 'Transaction',
  request: 'Endpoint',
}

/**
 * The run against the agreed service level — the verdict first, then every row
 * that was checked, failures on top. Empty when no SLA is switched on, so a
 * report without one reads as before.
 */
export function slaSection(stats: RunStats, sla: Sla | undefined) {
  const verdict = sla === undefined ? null : evaluateSla(stats, sla)

  if (sla === undefined || verdict === null) {
    return ''
  }

  const rows = [...verdict.rows]
    .sort((a, b) => Number(a.passed) - Number(b.passed))
    .map((row) => [
      SCOPE_LABELS[row.scope],
      row.name,
      count(row.count),
      row.responseTime === null ? '—' : seconds(row.responseTime),
      `${decimal(row.errorRate, 2)}%`,
      row.passed ? 'Pass' : 'Fail',
    ])

  const summary = verdict.passed
    ? `SLA met — all ${count(verdict.rows.length)} row(s) within ${describeSla(sla)}.`
    : `SLA missed — ${count(verdict.failedRows)} of ${count(verdict.rows.length)} row(s) over ${describeSla(sla)}.`

  return `<h2>Service Level Agreement</h2><p class="verdict ${
    verdict.passed ? 'pass' : 'fail'
  }">${escapeHtml(summary)}</p>${table(
    ['Scope', 'Name', 'Count', `${sla.statistic} (s)`, 'Error %', 'Result'],
    rows
  )}`
}
