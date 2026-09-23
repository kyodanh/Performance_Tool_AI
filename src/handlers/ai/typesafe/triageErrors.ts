import log from 'electron-log/main'
import { STATUS_CODES } from 'node:http'

import { RunErrorGroup } from '@/utils/k6/stats'

import {
  AnalyzeFailureRequest,
  TriageRoute,
  TriageRow,
} from '../errorAnalysis/types'

const ENDPOINT = 'https://api.typesafe.ai/v1/systemone'
const TIMEOUT_MS = 10_000
const MAX_ERRORS = 10
/** Below this the label is shown as uncertain rather than as a finding. */
const MIN_CONFIDENCE = 0.5
/** At or above this Jev's verdict stands on its own, without the LLM. */
const HIGH_CONFIDENCE = 0.8

const CAUSES = {
  correlation:
    'A dynamic value (token, session id, CSRF, id from an earlier response) was hard-coded or not extracted, so the server rejects the request',
  test_data:
    'The data-file row or parameter value is invalid, duplicated or already used',
  overload:
    'The target is saturated under load: rate limiting, 429/502/503/504, queueing, responses slow or near the timeout',
  server_error:
    'A bug or failure in the backend application itself: 500 answered quickly, not a capacity problem',
  network: 'Connectivity problem: DNS, connection refused/reset, TLS handshake',
  script: 'A bug in the k6 script: wrong URL, method, body, or a JS exception',
  client_resource:
    'The machine running k6 itself is out of resources — CPU, memory, open file descriptors, ephemeral ports, or network bandwidth — so failures reflect the load generator, not the target’s capacity',
}

type Cause = keyof typeof CAUSES

/** What the reader sees; the English criteria above are what Jev reads. */
const LABELS: Record<Cause, string> = {
  correlation: 'Correlation (token/session)',
  test_data: 'Dữ liệu test',
  overload: 'Quá tải',
  server_error: 'Lỗi server',
  network: 'Mạng',
  script: 'Lỗi script',
  client_resource: 'Máy chạy test cạn tài nguyên',
}

/** Causes under this share are noise and left out of the line. */
const MIN_SHARE = 0.05

interface ChoiceAnswer {
  type: 'choice'
  choice: Cause
  confidence: number
  probabilities: Partial<Record<Cause, number>>
}

interface SystemOneResponse {
  answers: Record<string, ChoiceAnswer>
}

/**
 * What a k6 error code means — k6 reports HTTP failures as 1000 + status
 * (1504 is a 504), which Jev cannot know and would otherwise guess at.
 * https://grafana.com/docs/k6/latest/javascript-api/error-codes/
 */
export function explainK6Code(code: string): string {
  const n = Number(code)

  if (!Number.isInteger(n) || n < 1000 || n >= 1700) {
    return ''
  }

  if (n >= 1400 && n < 1600) {
    return `HTTP ${n - 1000} ${STATUS_CODES[n - 1000] ?? ''}`.trim()
  }

  const known: Record<number, string> = {
    1050: 'request timeout, no response in time',
    1211: 'TCP dial timeout',
    1212: 'connection refused',
    1220: 'connection reset by peer',
  }

  return (
    known[n] ??
    (n < 1100
      ? 'network error'
      : n < 1200
        ? 'DNS lookup failure'
        : n < 1300
          ? 'TCP connection error'
          : n < 1400
            ? 'TLS error'
            : 'HTTP/2 error')
  )
}

/** The error plus what code alone can establish: the code's meaning, timings. */
function facts(
  error: RunErrorGroup,
  requestStats: AnalyzeFailureRequest['requestStats']
) {
  const same = requestStats.filter(
    (stats) => stats.name === error.url && stats.group === error.group
  )
  const n = Number(error.code)
  // Stats are split per status; an HTTP error (1000 + status) belongs to its
  // own row, not to the successes of the same request. Anything else
  // (network/DNS/TCP/TLS/HTTP2) never got a response — k6 tags that "0".
  // Falling back to an arbitrary row of `same` would show a *successful*
  // request's timings under a request that failed outright.
  const status = n >= 1400 && n < 1600 ? String(n - 1000) : '0'

  return {
    meaning: explainK6Code(error.code),
    request: same.find((stats) => stats.status === status),
  }
}

function evidence(
  error: RunErrorGroup,
  requestStats: AnalyzeFailureRequest['requestStats']
) {
  const { meaning, request } = facts(error, requestStats)

  return [
    meaning ? `${meaning} (k6 code ${error.code})` : `k6 code ${error.code}`,
    error.message && `message: ${error.message}`,
    `${error.url}${error.group ? ` in group ${error.group}` : ''}`,
    `${error.count} failures`,
    request &&
      `this request: ${request.failed}/${request.count} failed, response time avg ${request.avg.toFixed(0)}ms, max ${request.max.toFixed(0)}ms`,
  ]
    .filter(Boolean)
    .join('; ')
}

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`

/**
 * The same facts Jev was given, for the reader to check its verdict against:
 * `**endpoint** · group — HTTP 500 …, 182 lần; avg 26.1 s, max 107.2 s`.
 */
function display(
  error: RunErrorGroup,
  requestStats: AnalyzeFailureRequest['requestStats']
) {
  const { meaning, request } = facts(error, requestStats)
  const endpoint = error.url.split('?')[0]?.split('/').filter(Boolean).pop()

  return [
    `**${endpoint || error.url}**${error.group ? ` · ${error.group}` : ''}`,
    ' — ',
    meaning || error.message || 'lỗi không rõ',
    ` (k6 ${error.code || '—'}), ${error.count} lần`,
    request
      ? `; request này ${request.failed}/${request.count} lỗi, avg ${seconds(request.avg)}, max ${seconds(request.max)}`
      : '',
  ].join('')
}

/**
 * Jev's verdicts as Markdown lines (for the LLM) and as rows (for the UI),
 * plus its least sure answer across them — a run is only as certain as its
 * shakiest error. 0 when an error went unanswered.
 */
export interface Triage {
  lines: string[]
  rows: TriageRow[]
  confidence: number
}

const NO_TRIAGE: Triage = { lines: [], rows: [], confidence: 0 }

/**
 * The answer's causes, most likely first. `choice` always leads — it's Jev's
 * actual verdict, not just whichever probability happens to sort highest —
 * and stays even under the noise threshold, since hiding the chosen answer
 * would be worse than showing a low share for it.
 */
function causeBreakdown(
  answer: ChoiceAnswer
): { cause: Cause; label: string; share: number }[] {
  const rest = (Object.entries(answer.probabilities) as [Cause, number][])
    .filter(
      ([cause, probability]) =>
        cause !== answer.choice && probability >= MIN_SHARE
    )
    .sort(([, a], [, b]) => b - a)

  return [
    [answer.choice, answer.probabilities[answer.choice] ?? 0] as [
      Cause,
      number,
    ],
    ...rest,
  ].map(([cause, share]) => ({ cause, label: LABELS[cause] ?? cause, share }))
}

function row(
  error: RunErrorGroup,
  requestStats: AnalyzeFailureRequest['requestStats'],
  answer: ChoiceAnswer | undefined
): TriageRow {
  const { meaning, request } = facts(error, requestStats)

  return {
    endpoint:
      error.url.split('?')[0]?.split('/').filter(Boolean).pop() || error.url,
    group: error.group,
    code: error.code,
    meaning: meaning || error.message || 'lỗi không rõ',
    count: error.count,
    request: request && {
      failed: request.failed,
      count: request.count,
      avg: request.avg,
      max: request.max,
    },
    causes: answer ? causeBreakdown(answer) : [],
    confidence: answer?.confidence ?? null,
  }
}

/**
 * Who handles a run after Jev: 'auto' shows Jev alone, 'llm' has the model
 * explain it with Jev's odds, 'human' shows Jev flagged for a person to check.
 */
export function routeTriage(confidence: number): TriageRoute {
  if (confidence >= HIGH_CONFIDENCE) {
    return 'auto'
  }

  return confidence >= MIN_CONFIDENCE ? 'llm' : 'human'
}

/**
 * Asks TypeSafe (Jev) how likely each cause is for every error group, as
 * Markdown lines (`- error: **top 85%** · next 10%`) shown to the reader and
 * handed to the LLM. Empty when there is nothing to triage, no key, or the
 * call fails — triage only enriches the analysis, never blocks it.
 */
export async function triageErrors(
  {
    errors,
    requestStats,
    summary,
  }: Pick<AnalyzeFailureRequest, 'errors' | 'requestStats' | 'summary'>,
  apiKey: string | null
): Promise<Triage> {
  if (!apiKey || errors.length === 0) {
    return NO_TRIAGE
  }

  const top = [...errors].sort((a, b) => b.count - a.count).slice(0, MAX_ERRORS)

  // One call, one question per error group (speculative fan-out).
  const questions = Object.fromEntries(
    top.map((error, i) => [
      `cause_${i}`,
      {
        type: 'choice',
        instructions: `Most likely cause of error #${i}: ${evidence(error, requestStats)}`,
        criteria: CAUSES,
      },
    ])
  )

  try {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'jev-latest',
        state: {
          context: 'Errors from a k6 load test run, most frequent first.',
          run: summary
            ? `peak ${summary.vusMax} VUs; ${summary.failedRequests}/${summary.requests} requests failed; response time avg ${summary.avgDuration.toFixed(0)}ms, max ${summary.maxDuration.toFixed(0)}ms`
            : 'not available',
          errors: top.map(
            (error, i) => `#${i} ${evidence(error, requestStats)}`
          ),
        },
        questions,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })

    if (!response.ok) {
      throw new Error(`TypeSafe responded ${response.status}`)
    }

    const { answers } = (await response.json()) as SystemOneResponse

    const confidence = Math.min(
      ...top.map((_, i) => answers[`cause_${i}`]?.confidence ?? 0)
    )

    const lines = top.map((error, i) => {
      const answer = answers[`cause_${i}`]

      const shown = display(error, requestStats)

      if (!answer) {
        return `- ${shown}  \n  → không có kết quả`
      }

      const shares = causeBreakdown(answer)
        .map(
          ({ label, share }, rank) =>
            `${rank === 0 ? '**' : ''}${label} ${Math.round(share * 100)}%${rank === 0 ? '**' : ''}`
        )
        .join(' · ')

      const certainty = `độ tin cậy ${answer.confidence.toFixed(2)}${answer.confidence < MIN_CONFIDENCE ? ', Jev không chắc chắn' : ''}`

      // A hard line break keeps the facts and the verdict apart.
      return `- ${shown}  \n  → ${shares} _(${certainty})_`
    })

    const rows = top.map((error, i) =>
      row(error, requestStats, answers[`cause_${i}`])
    )

    return { lines, rows, confidence }
  } catch (error) {
    log.warn('[TypeSafe] Error triage failed, continuing without it:', error)
    return NO_TRIAGE
  }
}
