import { afterEach, describe, expect, it, vi } from 'vitest'

import { RequestStats, RunErrorGroup } from '@/utils/k6/stats'

import { explainK6Code, routeTriage, triageErrors } from './triageErrors'

const error = (code: string, count: number): RunErrorGroup =>
  ({
    code,
    message: 'failed',
    url: `https://api.test/${code}`,
    group: '',
    count,
    dataRows: [],
  }) as unknown as RunErrorGroup

function mockFetch(body: unknown, ok = true) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 401,
    json: () => Promise.resolve(body),
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('triageErrors', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('skips the call without a key or without errors', async () => {
    const fetchMock = mockFetch({})

    expect(
      await triageErrors({ errors: [error('401', 1)], requestStats: [] }, '')
    ).toEqual({ lines: [], rows: [], confidence: 0 })
    expect(await triageErrors({ errors: [], requestStats: [] }, 'key')).toEqual(
      { lines: [], rows: [], confidence: 0 }
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('shows each cause as a percentage, most frequent error first', async () => {
    const fetchMock = mockFetch({
      answers: {
        cause_0: {
          type: 'choice',
          choice: 'correlation',
          confidence: 0.9,
          probabilities: { correlation: 0.85, script: 0.12, network: 0.03 },
        },
        // Deliberately not the top probability — Jev's `choice` is the
        // verdict of record even when a different cause polled higher.
        cause_1: {
          type: 'choice',
          choice: 'overload',
          confidence: 0.2,
          probabilities: { overload: 0.4, server_error: 0.6 },
        },
      },
    })

    const { lines, rows, confidence } = await triageErrors(
      {
        errors: [error('1503', 2), error('1401', 9)],
        requestStats: [
          {
            name: 'https://api.test/1503',
            group: '',
            status: '200',
            count: 9,
            failed: 0,
            avg: 100,
            max: 200,
          } as RequestStats,
          {
            name: 'https://api.test/1503',
            group: '',
            status: '503',
            count: 4,
            failed: 2,
            avg: 30000,
            max: 60065,
          } as RequestStats,
        ],
      },
      'key'
    )

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(init.body as string) as {
      questions: Record<string, { instructions: string }>
    }
    expect(Object.keys(body.questions)).toEqual(['cause_0', 'cause_1'])
    expect(body.questions.cause_0?.instructions).toContain(
      'HTTP 401 Unauthorized (k6 code 1401)'
    )
    expect(body.questions.cause_1?.instructions).toContain(
      'this request: 2/4 failed, response time avg 30000ms, max 60065ms'
    )
    expect(lines[0]).toContain(
      '**Correlation (token/session) 85%** · Lỗi script 12%'
    )
    // Under 5% is dropped.
    expect(lines[0]).not.toContain('Mạng')
    expect(lines[1]).toContain(
      '**1503** — HTTP 503 Service Unavailable (k6 1503), 2 lần; request này 2/4 lỗi, avg 30.0 s, max 60.1 s'
    )
    // `choice` ('overload') leads even though `server_error` polled higher.
    expect(lines[1]).toContain('**Quá tải 40%** · Lỗi server 60%')
    expect(lines[1]).toContain('không chắc chắn')
    // The run is as sure as its shakiest error.
    expect(confidence).toBe(0.2)
    // The UI gets the same verdict as data.
    expect(rows[1]).toEqual({
      endpoint: '1503',
      group: '',
      code: '1503',
      meaning: 'HTTP 503 Service Unavailable',
      count: 2,
      request: { failed: 2, count: 4, avg: 30000, max: 60065 },
      causes: [
        { cause: 'overload', label: 'Quá tải', share: 0.4 },
        { cause: 'server_error', label: 'Lỗi server', share: 0.6 },
      ],
      confidence: 0.2,
    })
  })

  it("trusts Jev's `choice` over the raw probability ranking", async () => {
    // A cause below the 5% noise floor is still the answer when chosen.
    mockFetch({
      answers: {
        cause_0: {
          type: 'choice',
          choice: 'script',
          confidence: 0.55,
          probabilities: { correlation: 0.93, script: 0.02, network: 0.05 },
        },
      },
    })

    const { rows } = await triageErrors(
      { errors: [error('1500', 1)], requestStats: [] },
      'key'
    )

    expect(rows[0]?.causes[0]).toEqual({
      cause: 'script',
      label: 'Lỗi script',
      share: 0.02,
    })
  })

  it('recognizes client_resource as a distinct cause from overload', async () => {
    mockFetch({
      answers: {
        cause_0: {
          type: 'choice',
          choice: 'client_resource',
          confidence: 0.75,
          probabilities: { client_resource: 0.7, overload: 0.3 },
        },
      },
    })

    const { lines, rows } = await triageErrors(
      { errors: [error('1504', 4)], requestStats: [] },
      'key'
    )

    expect(rows[0]?.causes[0]).toEqual({
      cause: 'client_resource',
      label: 'Máy chạy test cạn tài nguyên',
      share: 0.7,
    })
    expect(lines[0]).toContain('**Máy chạy test cạn tài nguyên 70%**')
  })

  it('only attaches request stats from the matching status, never a fallback row', async () => {
    mockFetch({
      answers: {
        cause_0: {
          type: 'choice',
          choice: 'network',
          confidence: 0.7,
          probabilities: { network: 0.9 },
        },
      },
    })

    // A connection-refused error (k6 1212) never gets a response, so it has
    // no "1212 - 1000" status row — only the endpoint's successful "200" one.
    const { rows } = await triageErrors(
      {
        errors: [
          { ...error('1212', 3), url: 'https://api.test/x' } as RunErrorGroup,
        ],
        requestStats: [
          {
            name: 'https://api.test/x',
            group: '',
            status: '200',
            count: 5,
            failed: 0,
            avg: 50,
            max: 80,
          } as RequestStats,
        ],
      },
      'key'
    )

    // Must not be misreported as fast/successful using the 200 row's timings.
    expect(rows[0]?.request).toBeUndefined()
  })

  it('returns nothing when the API fails', async () => {
    mockFetch({}, false)

    expect(
      await triageErrors(
        { errors: [error('1500', 1)], requestStats: [] },
        'key'
      )
    ).toEqual({ lines: [], rows: [], confidence: 0 })
  })
})

describe('routeTriage', () => {
  it.each([
    [0.95, 'auto'],
    [0.8, 'auto'],
    [0.6, 'llm'],
    [0.5, 'llm'],
    [0.2, 'human'],
  ])('routes confidence %s to %s', (confidence, route) => {
    expect(routeTriage(confidence)).toBe(route)
  })
})

describe('explainK6Code', () => {
  it.each([
    ['1500', 'HTTP 500 Internal Server Error'],
    ['1504', 'HTTP 504 Gateway Timeout'],
    ['1050', 'request timeout, no response in time'],
    ['1212', 'connection refused'],
    ['1101', 'DNS lookup failure'],
    ['1301', 'TLS error'],
    ['500', ''],
    ['', ''],
  ])('%s → %s', (code, meaning) => {
    expect(explainK6Code(code)).toBe(meaning)
  })
})
