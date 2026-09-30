import log from 'electron-log/main'

import { RequestStats } from '@/utils/k6/stats'

import { AnalyzeFailureRequest, TriageRow } from '../errorAnalysis/types'

import {
  askJev,
  causeBreakdown,
  ChoiceAnswer,
  MIN_CONFIDENCE,
  NO_TRIAGE,
  Triage,
} from './triageErrors'

const MAX_REQUESTS = 5

const CAUSES = {
  server_processing:
    'The backend itself is slow on this request — heavy DB query, aggregation, report or file export — time to first byte (waiting) is nearly all of the duration and it is slow even at low VUs',
  server_contention:
    'The server queues under concurrency — DB connection pool, locks, thread pool — only some calls are slow: max far above avg or min, and it gets worse as VUs grow',
  dependency:
    'The backend waits on a downstream system it calls (data warehouse, another API, file storage, SSO), slow waiting on the endpoints that integrate with it',
  payload:
    'A large response body: receiving the body takes a large share of the duration, e.g. a file download',
  network:
    'Connection setup or network latency: blocked, connecting or TLS handshake take a large share of the duration',
  client_resource:
    'The machine running k6 is out of CPU, memory or bandwidth, so timings reflect the load generator, not the target',
  none: 'Not a bottleneck: response time is fine for an interactive request (well under 1 s)',
}

type Cause = keyof typeof CAUSES

/** What the reader sees; the English criteria above are what Jev reads. */
const LABELS: Record<Cause, string> = {
  server_processing: 'Xử lý server (query/export)',
  server_contention: 'Tranh chấp tài nguyên server',
  dependency: 'Hệ thống phụ thuộc',
  payload: 'Dữ liệu trả về lớn',
  network: 'Mạng / kết nối',
  client_resource: 'Máy chạy test',
  none: 'Không nghẽn',
}

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`

const endpointOf = (name: string) =>
  name.split('?')[0]?.split('/').filter(Boolean).pop() || name

/** Share of the request's time spent waiting on the server, 0–1. */
const serverShare = (request: RequestStats) =>
  request.total > 0 ? Math.min(request.serverTime / request.total, 1) : null

function evidence(request: RequestStats) {
  const server = serverShare(request)

  return [
    `${request.method} ${request.name}${request.group ? ` in group ${request.group}` : ''} [HTTP ${request.status}]`,
    `${request.count} requests`,
    `response time avg ${request.avg.toFixed(0)}ms, min ${request.min.toFixed(0)}ms, max ${request.max.toFixed(0)}ms`,
    request.percentiles && `p95 ${request.percentiles.p95.toFixed(0)}ms`,
    server !== null &&
      `waiting on the server (time to first byte) is ${Math.round(server * 100)}% of the duration`,
  ]
    .filter(Boolean)
    .join('; ')
}

/**
 * For a run without errors Jev splits where the slowest requests lose their
 * time — server processing, contention, a downstream system, payload, network —
 * in the same rows and lines as the error triage.
 */
export async function rateLatency(
  {
    requestStats,
    summary,
  }: Pick<AnalyzeFailureRequest, 'requestStats' | 'summary'>,
  apiKey: string | null
): Promise<Triage> {
  if (!apiKey || requestStats.length === 0) {
    return NO_TRIAGE
  }

  const top = [...requestStats]
    .sort((a, b) => b.max - a.max)
    .slice(0, MAX_REQUESTS)

  const questions = Object.fromEntries(
    top.map((request, i) => [
      `cause_${i}`,
      {
        type: 'choice',
        instructions: `What makes request #${i} slow: ${evidence(request)}`,
        criteria: CAUSES,
      },
    ])
  )

  try {
    const answers = (await askJev(
      apiKey,
      {
        context:
          'Slowest requests of a k6 load test run that finished without errors, slowest first.',
        run: summary
          ? `peak ${summary.vusMax} VUs; ${summary.requests} requests; response time avg ${summary.avgDuration.toFixed(0)}ms, max ${summary.maxDuration.toFixed(0)}ms`
          : 'not available',
        requests: top.map((request, i) => `#${i} ${evidence(request)}`),
      },
      questions
    )) as Record<string, ChoiceAnswer<Cause>>

    const confidence = Math.min(
      ...top.map((_, i) => answers[`cause_${i}`]?.confidence ?? 0)
    )

    const rows: TriageRow[] = top.map((request, i) => {
      const answer = answers[`cause_${i}`]
      const server = serverShare(request)

      return {
        endpoint: endpointOf(request.name),
        group: request.group,
        code: '',
        meaning: [
          `${request.method} · HTTP ${request.status}`,
          server !== null && `server ${Math.round(server * 100)}% thời gian`,
        ]
          .filter(Boolean)
          .join(' · '),
        count: request.count,
        request: {
          failed: request.failed,
          count: request.count,
          avg: request.avg,
          max: request.max,
        },
        causes: answer ? causeBreakdown(answer, LABELS) : [],
        confidence: answer?.confidence ?? null,
      }
    })

    const lines = top.map((request, i) => {
      const answer = answers[`cause_${i}`]
      const shown = `**${endpointOf(request.name)}**${request.group ? ` · ${request.group}` : ''} — ${request.method}, ${request.count} request, avg ${seconds(request.avg)}, max ${seconds(request.max)}`

      if (!answer) {
        return `- ${shown}  \n  → không có kết quả`
      }

      const shares = causeBreakdown(answer, LABELS)
        .map(
          ({ label, share }, rank) =>
            `${rank === 0 ? '**' : ''}${label} ${Math.round(share * 100)}%${rank === 0 ? '**' : ''}`
        )
        .join(' · ')

      const certainty = `độ tin cậy ${answer.confidence.toFixed(2)}${answer.confidence < MIN_CONFIDENCE ? ', Jev không chắc chắn' : ''}`

      return `- ${shown}  \n  → ${shares} _(${certainty})_`
    })

    return { kind: 'latency', lines, rows, confidence }
  } catch (error) {
    log.warn('[TypeSafe] Latency rating failed, continuing without it:', error)
    return NO_TRIAGE
  }
}
