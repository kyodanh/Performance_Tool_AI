import { AnalyzeFailureRequest, RunSummary } from './types'

const MAX_CHECKS = 20
const MAX_ERRORS = 20
const MAX_REQUEST_STATS = 20
const MAX_LOGS = 20

const FAILURE_INTENT = [
  'You are analyzing a failed k6 load test run. Given the data below, explain:',
  '1. The most likely root cause of the failures.',
  '2. Which request(s) or check(s) are implicated.',
  '3. A suggested next step to investigate or fix it.',
]

const PERFORMANCE_INTENT = [
  'You are reviewing a k6 load test run that finished without failures. Given the data below, explain:',
  '1. How the target performed — throughput, latency, and where the time went.',
  '2. Which request(s) are the slowest or the likeliest bottleneck under more load.',
  '3. A suggested next step to improve performance or make the test more meaningful.',
]

function summaryLines(summary: RunSummary): string[] {
  return [
    `- VUs: ${summary.vus} running / ${summary.vusMax} peak`,
    `- Elapsed: ${summary.elapsed}s, ${summary.iterations} iterations (${summary.droppedIterations} dropped)`,
    `- Requests: ${summary.requests} (${summary.failedRequests} failed)`,
    `- Checks: ${summary.checksPassed} passed / ${summary.checksFailed} failed`,
    `- Response time: avg ${summary.avgDuration.toFixed(0)}ms, max ${summary.maxDuration.toFixed(0)}ms`,
    `- Data received: ${summary.dataReceived} bytes`,
    `- Timing breakdown (ms): blocked ${summary.timings.blocked.toFixed(0)}, connecting ${summary.timings.connecting.toFixed(0)}, TLS ${summary.timings.tlsHandshaking.toFixed(0)}, sending ${summary.timings.sending.toFixed(0)}, waiting ${summary.timings.waiting.toFixed(0)}, receiving ${summary.timings.receiving.toFixed(0)}`,
  ]
}

export function buildFailureAnalysisPrompt({
  checks,
  errors,
  requestStats,
  logs,
  summary,
}: AnalyzeFailureRequest): string {
  const failedChecks = checks
    .filter((check) => check.fails > 0)
    .slice(0, MAX_CHECKS)

  const topErrors = [...errors]
    .sort((a, b) => b.count - a.count)
    .slice(0, MAX_ERRORS)

  const worstRequests = [...requestStats]
    .sort((a, b) => b.failed - a.failed || b.avg - a.avg)
    .slice(0, MAX_REQUEST_STATS)

  const errorLogs = logs
    .filter((entry) => entry.level === 'error')
    .slice(0, MAX_LOGS)

  const failed =
    failedChecks.length > 0 ||
    topErrors.length > 0 ||
    worstRequests.some((request) => request.failed > 0)

  const sections = [
    ...(failed ? FAILURE_INTENT : PERFORMANCE_INTENT),
    'Be concise and specific. Reference request names/URLs and numbers from the data, not generic advice.',
    // ponytail: hard-coded — the app has no locale setting to read.
    'Answer in Vietnamese. Keep metric names, request names, URLs and k6 terms as they appear in the data.',
    '',
    '## Run summary',
    summary ? summaryLines(summary).join('\n') : '(not available)',
    '',
    '## Failed checks',
    failedChecks.length > 0
      ? failedChecks
          .map(
            (check) =>
              `- "${check.name}" (${check.path}): ${check.fails} failed / ${check.passes} passed`
          )
          .join('\n')
      : '(none)',
    '',
    '## Errors',
    topErrors.length > 0
      ? topErrors
          .map(
            (error) =>
              `- [${error.code || 'no code'}] ${error.message || '(no message)'} — ${error.url}${error.group ? ` (group: ${error.group})` : ''} — ${error.count}x`
          )
          .join('\n')
      : '(none)',
    '',
    '## Request timing / failures (worst first)',
    worstRequests.length > 0
      ? worstRequests
          .map(
            (request) =>
              `- ${request.method} ${request.name} [${request.status}]: ${request.failed}/${request.count} failed, avg ${request.avg.toFixed(0)}ms, max ${request.max.toFixed(0)}ms`
          )
          .join('\n')
      : '(none)',
    '',
    '## Error logs',
    errorLogs.length > 0
      ? errorLogs.map((entry) => `- [${entry.time}] ${entry.msg}`).join('\n')
      : '(none)',
  ]

  return sections.join('\n')
}
