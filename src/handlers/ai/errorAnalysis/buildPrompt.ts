import { AnalyzeFailureRequest } from './types'

const MAX_CHECKS = 20
const MAX_ERRORS = 20
const MAX_REQUEST_STATS = 20
const MAX_LOGS = 20

export function buildFailureAnalysisPrompt({
  checks,
  errors,
  requestStats,
  logs,
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

  const sections = [
    'You are analyzing a failed k6 load test run. Given the data below, explain:',
    '1. The most likely root cause of the failures.',
    '2. Which request(s) or check(s) are implicated.',
    '3. A suggested next step to investigate or fix it.',
    'Be concise and specific. Reference request names/URLs and numbers from the data, not generic advice.',
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
