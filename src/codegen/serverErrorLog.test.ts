import { describe, expect, it, vi } from 'vitest'

import { SERVER_ERROR_LOG_HELPER } from './serverErrorLog'

type Resp = {
  status: number
  headers: Record<string, string>
  body: string | null
}

// Runs the script-side helper the way k6 would, with console swapped out.
function logFor({ status, headers, body }: Resp) {
  const error = vi.fn()
  // eslint-disable-next-line no-implied-eval -- evaluating the generated script is the point
  const run = new Function(
    'console',
    'resp',
    `${SERVER_ERROR_LOG_HELPER}\nlogServerError(resp)`
  ) as (console: { error: typeof error }, resp: unknown) => void

  run(
    { error },
    {
      status,
      headers,
      body,
      url: 'http://a/api',
      request: { method: 'POST' },
      timings: { duration: 120034.4 },
    }
  )

  return error.mock.calls[0]?.[0] as string | undefined
}

describe('logServerError', () => {
  it('stays quiet below 500', () => {
    expect(logFor({ status: 404, headers: {}, body: 'x' })).toBeUndefined()
  })

  it('names a gateway page', () => {
    const line = logFor({
      status: 504,
      headers: { Server: 'nginx' },
      body: '<html><center>504 Gateway Time-out</center></html>',
    })

    expect(line).toContain('tier=gateway')
    expect(line).toContain('time=120034ms')
    expect(line).toContain('server=nginx')
  })

  it('names a database failure behind the app', () => {
    expect(
      logFor({
        status: 500,
        headers: {},
        body: '{"message":"JDBCConnectionException: Connection is not available"}',
      })
    ).toContain('tier=database')
  })

  it('falls back to the app for its own error JSON', () => {
    expect(
      logFor({
        status: 500,
        headers: { 'X-Kong-Upstream-Latency': '12' },
        body: '{"status":500,"error":"Internal Server Error"}',
      })
    ).toContain('tier=app')
  })

  it('names Kong when it never reached the upstream', () => {
    expect(
      logFor({
        status: 502,
        headers: { 'X-Kong-Proxy-Latency': '1' },
        body: '{"message":"An invalid response was received from the upstream server"}',
      })
    ).toContain('tier=gateway')
  })

  it('survives a discarded body', () => {
    expect(logFor({ status: 500, headers: {}, body: null })).toContain('body=-')
  })
})
